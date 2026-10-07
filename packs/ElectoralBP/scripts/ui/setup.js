// Setting a nation up: candidates, counties, parties, performance and rules.

import { BLOCS, REGION_TEMPLATES } from "../data/blocs.js";
import { ISSUES } from "../data/issues.js";
import { METRICS } from "../data/metrics.js";
import { GOVERNMENTS, GOV_BY_ID, METHODS, effectiveGov } from "../data/governments.js";
import { COLORS, COLOR_NAMES } from "../data/names.js";
import { createParty, createPerson, deleteNation, deletePerson, displayName, nationPersons, personLabel } from "../core/state.js";
import { clamp, createRng } from "../core/random.js";
import { addRegionOfType, autoApportion, seedHistoricalLean } from "../engine/generate.js";
import { TERM_EVENTS } from "../data/events.js";
import { confirm, fmt, modal, notice } from "./forms.js";
import { CLOSE, commit, loop, S } from "./nav.js";
import { metricsPage, personCard, regionProfile, stanceText } from "./render.js";

const rng = () => createRng(Math.floor(Math.random() * 2 ** 31));
const int = (v, fallback) => {
  const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
};
const colorOptions = () => COLORS.map((c) => `${c}${COLOR_NAMES[c]}`);

// ---------- candidates ----------

// "Main issue" choices: each issue twice, once per side.
const SIDES = ISSUES.flatMap((i) => [
  { issue: i.id, sign: -1, label: `${i.name}: ${i.low}` },
  { issue: i.id, sign: 1, label: `${i.name}: ${i.high}` },
]);

async function candidateBasics(player, nation, p, title = "Candidate") {
  const r = await modal(player, title, [
    { key: "name", type: "text", label: "Name §c(required)", placeholder: "Type the candidate's name", value: p.name },
    { key: "party", type: "dropdown", label: "Party", options: ["Independent", ...nation.parties.map((x) => x.name || "(unnamed party)")], value: Math.max(0, nation.parties.findIndex((x) => x.id === p.partyId) + 1) },
    { key: "home", type: "dropdown", label: "Home county (they do better there)", options: ["None", ...nation.regions.map((x) => x.name)], value: Math.max(0, nation.regions.findIndex((x) => x.id === p.homeRegion) + 1) },
  ]);
  if (!r) return false;
  if (r.name.trim()) p.name = r.name.trim(); // a blank box keeps the old name
  p.partyId = r.party === 0 ? null : nation.parties[r.party - 1].id;
  p.homeRegion = r.home === 0 ? null : nation.regions[r.home - 1].id;
  commit();
  if (!p.name) {
    await notice(player, "Name needed", "Every candidate needs a name. Unnamed candidates can't be put on a ballot.");
    return false;
  }
  return true;
}

async function candidateRatings(player, p) {
  const fields = [
    ["popularity", "Popularity - how well-liked they are overall"],
    ["charisma", "Charisma - wins over youth and workers"],
    ["competence", "Competence - wins over scholars and merchants"],
    ["integrity", "Honesty - wins over clergy and elders"],
    ["funds", "Campaign money"],
  ];
  const r = await modal(player, `Ratings: ${displayName(p)}`, fields.map(([k, label]) => ({ key: k, type: "slider", label, min: 0, max: 100, step: 5, value: p[k] })));
  if (!r) return;
  for (const [k] of fields) p[k] = r[k];
  commit();
}

async function candidateIssues(player, p) {
  const fields = [];
  for (let k = 0; k < 3; k++) {
    const f = p.focus[k];
    const idx = f ? SIDES.findIndex((s) => s.issue === f && s.sign === (p.positions[f] < 0 ? -1 : 1)) + 1 : 0;
    fields.push({ key: `s${k}`, type: "dropdown", label: `Main issue ${k + 1}`, options: ["(none)", ...SIDES.map((s) => s.label)], value: idx });
    fields.push({ key: `x${k}`, type: "dropdown", label: "How strongly?", options: ["Moderately", "Strongly"], value: f && Math.abs(p.positions[f]) >= 65 ? 1 : 0 });
  }
  const r = await modal(player, `Main Issues: ${displayName(p)}`, fields);
  if (!r) return;
  const focus = [];
  for (let k = 0; k < 3; k++) {
    const side = SIDES[r[`s${k}`] - 1];
    if (!side || focus.includes(side.issue)) continue;
    focus.push(side.issue);
    p.positions[side.issue] = side.sign * (r[`x${k}`] ? 80 : 45);
  }
  p.focus = focus;
  commit();
}

async function candidateAppeal(player, nation, p) {
  const groups = ["(none)", ...BLOCS.map((b) => b.name)];
  const counties = ["(none)", ...nation.regions.map((x) => x.name)];
  const fields = [];
  for (let k = 0; k < 3; k++) fields.push({ key: `g${k}`, type: "dropdown", label: `Group they court #${k + 1}`, options: groups, value: Math.max(0, BLOCS.findIndex((b) => b.id === p.targets[k]) + 1) });
  for (let k = 0; k < 3; k++) fields.push({ key: `r${k}`, type: "dropdown", label: `County they campaign in #${k + 1}`, options: counties, value: Math.max(0, nation.regions.findIndex((x) => x.id === p.campaignRegions[k]) + 1) });
  const r = await modal(player, `Campaign: ${displayName(p)}`, fields);
  if (!r) return;
  p.targets = [...new Set([0, 1, 2].map((k) => BLOCS[r[`g${k}`] - 1]?.id).filter(Boolean))];
  p.campaignRegions = [...new Set([0, 1, 2].map((k) => nation.regions[r[`r${k}`] - 1]?.id).filter(Boolean))];
  commit();
}

async function stanceSliders(player, title, positions) {
  const r = await modal(player, title, ISSUES.map((i) => ({ key: i.id, type: "slider", label: `${i.name}: §7${i.low} <-> ${i.high}`, min: -100, max: 100, step: 5, value: positions[i.id] || 0 })));
  if (!r) return false;
  for (const i of ISSUES) positions[i.id] = r[i.id];
  commit();
  return true;
}

function candidateMenu(player, nation, p) {
  return loop(player, () => {
    if (!S().persons[p.id]) return null;
    return {
      title: displayName(p).replace(/§./g, ""),
      body: personCard(S(), nation, p),
      options: [
        { text: "Name, Party & Home County", run: () => candidateBasics(player, nation, p) },
        { text: "Main Issues", run: () => candidateIssues(player, p) },
        { text: "Ratings", run: () => candidateRatings(player, p) },
        { text: "Campaign (groups & counties)", run: () => candidateAppeal(player, nation, p) },
        { text: "§7All Stances (advanced)", run: () => stanceSliders(player, `Stances: ${displayName(p)}`, p.positions) },
        {
          text: "§cDelete Candidate",
          run: async () => {
            if (!(await confirm(player, "Delete", `Delete ${displayName(p)}?`, "§cDelete"))) return;
            deletePerson(S(), p.id);
            commit();
            return "back";
          },
        },
      ],
    };
  });
}

async function newCandidate(player, nation) {
  const p = createPerson(S(), nation, { homeRegion: null });
  const ok = await candidateBasics(player, nation, p, "New Candidate");
  if (!ok && !p.name) {
    deletePerson(S(), p.id);
    commit();
    return;
  }
  const party = nation.parties.find((x) => x.id === p.partyId);
  if (party) for (const i of ISSUES) p.positions[i.id] = clamp(party.positions[i.id] || 0, -100, 100); // start from the party line
  commit();
  return candidateMenu(player, nation, p);
}

export function candidatesMenu(player, nation) {
  return loop(player, () => {
    const state = S();
    const people = nationPersons(state, nation).sort((a, b) => displayName(a).localeCompare(displayName(b)));
    return {
      title: "Candidates",
      body: "§7The people who can run. You name them; give each one main issues, ratings and a campaign so voters have something to judge.",
      options: [
        { text: "§2+ New Candidate", run: () => newCandidate(player, nation) },
        ...people.map((p) => ({ text: `${personLabel(state, nation, p)}${p.id === nation.leaderId ? " §6(in office)" : ""}`, run: () => candidateMenu(player, nation, p) })),
      ],
    };
  });
}

// ---------- counties ----------

async function addCounty(player, nation) {
  const r = await modal(player, "Add County", [
    { key: "name", type: "text", label: "Name (leave blank for a random name)", placeholder: "County name", value: "" },
    { key: "type", type: "dropdown", label: "What kind of place is it? (decides who lives there)", options: REGION_TEMPLATES.map((t) => t.name) },
    { key: "pop", type: "text", label: "Population (leave blank for typical)", placeholder: "e.g. 5000", value: "" },
  ], "Add");
  if (!r) return;
  const region = addRegionOfType(S(), nation, rng(), REGION_TEMPLATES[r.type].id, r.name);
  const pop = int(r.pop, 0);
  if (pop > 0) {
    region.population = Math.min(pop, 10000000);
    autoApportion(nation);
  }
  commit();
}

async function editCounty(player, nation, region) {
  const r = await modal(player, region.name, [
    { key: "name", type: "text", label: "Name", value: region.name },
    { key: "pop", type: "text", label: "Population", value: String(region.population) },
    { key: "type", type: "dropdown", label: "Kind of place (changing it resets who lives here)", options: REGION_TEMPLATES.map((t) => t.name), value: Math.max(0, REGION_TEMPLATES.findIndex((t) => t.id === region.template)) },
    { key: "auto", type: "toggle", label: "Voting power follows population", value: region.autoPower !== false },
    { key: "power", type: "slider", label: "Voting power (electors / seats), if set by hand", min: 1, max: 50, value: region.power },
  ]);
  if (!r) return;
  region.name = r.name.trim() || region.name;
  region.population = clamp(int(r.pop, region.population), 0, 10000000);
  const tpl = REGION_TEMPLATES[r.type];
  if (tpl.id !== region.template) {
    region.template = tpl.id;
    region.blocs = { ...tpl.mix };
    region.issueMods = { ...tpl.focus };
    region.wealth = tpl.wealth;
    region.urban = tpl.urban;
  }
  region.autoPower = r.auto;
  if (!r.auto) region.power = r.power;
  autoApportion(nation);
  commit();
}

function countyMenu(player, nation, region) {
  return loop(player, () => {
    if (!nation.regions.includes(region)) return null;
    return {
      title: region.name,
      body: regionProfile(S(), nation, region),
      options: [
        { text: "Name, Population & Type", run: () => editCounty(player, nation, region) },
        {
          text: "§7Who Lives Here (advanced)",
          run: async () => {
            const r = await modal(player, "Who Lives Here", BLOCS.map((b) => ({ key: b.id, type: "slider", label: `${b.name} §7(share)`, min: 0, max: 100, value: region.blocs[b.id] || 0 })));
            if (!r) return;
            region.blocs = {};
            for (const b of BLOCS) if (r[b.id] > 0) region.blocs[b.id] = r[b.id];
            if (!Object.keys(region.blocs).length) region.blocs = { farmers: 1 };
            commit();
          },
        },
        {
          text: "§7Local Issues (advanced)",
          run: async () => {
            const r = await modal(player, "Local Issues", ISSUES.map((i) => ({ key: i.id, type: "slider", label: `${i.name} §7(how much more this county cares, %)`, min: -50, max: 150, step: 10, value: Math.round((region.issueMods[i.id] || 0) * 100) })));
            if (!r) return;
            region.issueMods = {};
            for (const i of ISSUES) if (r[i.id]) region.issueMods[i.id] = r[i.id] / 100;
            commit();
          },
        },
        nation.parties.length > 0 && {
          text: "§7Party Loyalty (advanced)",
          run: async () => {
            const r = await modal(player, "Party Loyalty", nation.parties.map((p) => ({ key: p.id, type: "slider", label: `${p.color}${p.name}§r §7(-100 hostile .. 100 loyal)`, min: -100, max: 100, step: 10, value: Math.round((region.lean[p.id] || 0) * 100) })));
            if (!r) return;
            for (const p of nation.parties) region.lean[p.id] = r[p.id] / 100;
            commit();
          },
        },
        {
          text: "§cDelete County",
          run: async () => {
            if (!(await confirm(player, "Delete County", `Delete ${region.name}?`, "§cDelete"))) return;
            nation.regions = nation.regions.filter((x) => x !== region);
            autoApportion(nation);
            commit();
            return "back";
          },
        },
      ],
    };
  });
}

export function countiesMenu(player, nation) {
  return loop(player, () => ({
    title: "Counties",
    body: `§7Counties (or states/provinces) hold the voters. Their type decides who lives there and what they care about.\n§7Total population §f${fmt(nation.regions.reduce((s, r) => s + r.population, 0))}§7 · voting power §f${nation.regions.reduce((s, r) => s + r.power, 0)}`,
    options: [
      { text: "§2+ Add County", run: () => addCounty(player, nation) },
      ...nation.regions.map((r) => ({ text: `${r.name}\n§7${REGION_TEMPLATES.find((t) => t.id === r.template)?.name || "Custom"} · pop ${fmt(r.population)} · power ${r.power}`, run: () => countyMenu(player, nation, r) })),
      nation.regions.length > 1 && {
        text: "Total Voting Power",
        run: async () => {
          const r = await modal(player, "Total Voting Power", [{ key: "t", type: "slider", label: "Electors/seats shared between counties by population (each gets at least 1)", min: nation.regions.length, max: Math.max(nation.regions.length + 1, 150), value: Math.max(nation.regions.length, nation.settings.totalSeats || nation.regions.reduce((s, x) => s + x.power, 0)) }]);
          if (!r) return;
          nation.settings.totalSeats = r.t;
          autoApportion(nation);
          commit();
        },
      },
    ],
  }));
}

// ---------- parties ----------

async function editParty(player, nation, party, title) {
  const r = await modal(player, title, [
    { key: "name", type: "text", label: "Party name §c(required)", placeholder: "Type the party's name", value: party.name },
    { key: "color", type: "dropdown", label: "Color", options: colorOptions(), value: Math.max(0, COLORS.indexOf(party.color)) },
  ]);
  if (!r) return false;
  if (r.name.trim()) party.name = r.name.trim();
  party.color = COLORS[r.color];
  seedHistoricalLean(nation);
  commit();
  return !!party.name;
}

export function partiesMenu(player, nation) {
  return loop(player, () => ({
    title: "Parties",
    body: "§7Optional. Parties give candidates loyal voters, and voters remember which party they backed last time.",
    options: [
      {
        text: "§2+ New Party",
        run: async () => {
          const used = new Set(nation.parties.map((p) => p.color));
          const party = createParty(S(), nation, { name: "", color: COLORS.find((c) => !used.has(c)) || "§7" });
          if (!(await editParty(player, nation, party, "New Party"))) {
            nation.parties = nation.parties.filter((x) => x !== party);
            commit();
          }
        },
      },
      ...nation.parties.map((p) => ({
        text: `${p.color}${p.name}\n§7${nationPersons(S(), nation).filter((x) => x.partyId === p.id).length} candidates`,
        run: () => loop(player, () => ({
          title: p.name,
          body: `${p.color}§l${p.name}§r\n§7Platform: §f${ISSUES.filter((i) => Math.abs(p.positions[i.id]) >= 30).map((i) => stanceText(i.id, p.positions[i.id])).join(", ") || "not set"}\n§7New candidates in this party start from its platform.`,
          options: [
            { text: "Name & Color", run: () => editParty(player, nation, p, "Party") },
            {
              text: "Platform",
              run: async () => {
                if (!(await stanceSliders(player, `Platform: ${p.name}`, p.positions))) return;
                // a new platform reshapes which counties are this party's natural base
                for (const reg of nation.regions) if (!(reg.history || []).length) delete reg.lean[p.id];
                seedHistoricalLean(nation);
                commit();
              },
            },
            {
              text: "§cDelete Party",
              run: async () => {
                if (!(await confirm(player, "Delete Party", `Delete ${p.name}? Its candidates become independents.`, "§cDelete"))) return;
                nation.parties = nation.parties.filter((x) => x !== p);
                for (const person of nationPersons(S(), nation)) if (person.partyId === p.id) person.partyId = null;
                for (const reg of nation.regions) {
                  delete reg.lean[p.id];
                  for (const m of Object.values(reg.memory || {})) delete m[p.id];
                }
                commit();
                return "back";
              },
            },
          ],
        })),
      })),
    ],
  }));
}

// ---------- leader performance ----------

export function performanceMenu(player, nation) {
  return loop(player, () => {
    const gov = effectiveGov(nation);
    return {
      title: "Leader Performance",
      body: `§7In office: §f${nation.leaderId ? personLabel(S(), nation, nation.leaderId) : "nobody"}\n§7Rate how the ${gov.leaderTitle} has done. If they run again, voters judge them on this (their party too).\n\n${metricsPage(nation)}`,
      options: [
        {
          text: "Adjust Sliders",
          icon: "textures/items/clock_item",
          run: async () => {
            const r = await modal(player, "Performance", METRICS.map((m) => ({ key: m.id, type: "slider", label: `${m.name} §7(50 = average)`, min: 0, max: 100, step: 5, value: nation.metrics[m.id] })));
            if (!r) return;
            for (const m of METRICS) nation.metrics[m.id] = r[m.id];
            commit();
          },
        },
        {
          text: "Who Is In Office?",
          run: async () => {
            const people = nationPersons(S(), nation).filter((p) => p.name);
            const r = await modal(player, "In Office", [{ key: "who", type: "dropdown", label: `Who is the current ${gov.leaderTitle}? (Election winners are set automatically.)`, options: ["Nobody", ...people.map((p) => p.name)], value: Math.max(0, people.findIndex((p) => p.id === nation.leaderId) + 1) }]);
            if (!r) return;
            const id = r.who === 0 ? null : people[r.who - 1].id;
            if (id !== nation.leaderId) nation.leaderTerms = id ? 1 : 0;
            nation.leaderId = id;
            commit();
          },
        },
        {
          text: "§7County Favor (advanced)",
          run: async () => {
            if (!nation.regions.length) return;
            const r = await modal(player, "County Favor", nation.regions.map((reg) => ({ key: reg.id, type: "slider", label: `${reg.name} §7(-50 neglected .. +50 favored by the government)`, min: -50, max: 50, step: 5, value: reg.favor || 0 })));
            if (!r) return;
            for (const reg of nation.regions) reg.favor = r[reg.id];
            commit();
          },
        },
      ],
    };
  });
}

// ---------- settings ----------

async function rules(player, nation) {
  const gov = effectiveGov(nation);
  const base = GOV_BY_ID[nation.gov];
  const methods = Object.keys(METHODS);
  const r = await modal(player, `Rules: ${base.name}`, [
    { key: "method", type: "dropdown", label: "Default way votes are counted", options: methods.map((m) => METHODS[m].name), value: methods.indexOf(gov.method) },
    { key: "integrity", type: "slider", label: "Honest count % (100 = fair; lower tilts the official result to the endorsed candidate)", min: 0, max: 100, step: 5, value: Math.round(gov.integrity * 100) },
    { key: "compulsory", type: "slider", label: "Forced turnout % (0 = people choose whether to vote)", min: 0, max: 99, step: 1, value: Math.round(gov.compulsory * 100) },
    { key: "protection", type: "slider", label: "Leader protection % (in a rigged count, how hard it is for a real loser to be forced out)", min: 0, max: 100, step: 5, value: Math.round(gov.protection * 100) },
    { key: "consensus", type: "slider", label: "Council agreement needed % (council styles)", min: 50, max: 100, step: 1, value: Math.round(gov.consensus * 100) },
    { key: "threshold", type: "slider", label: "Minimum % for a party to win seats (Parliament)", min: 0, max: 20, value: Math.round(gov.threshold * 100) },
    { key: "ballot", type: "slider", label: "How many votes one player ballot is worth", min: 1, max: 500, value: gov.ballotWeight },
    { key: "night", type: "slider", label: "Default length of election night (minutes)", min: 1, max: 60, value: gov.nightMinutes },
  ]);
  if (!r) return;
  const s = nation.settings;
  const set = (key, value, def) => {
    if (value === def) delete s[key];
    else s[key] = value;
  };
  set("method", methods[r.method], base.method);
  set("integrity", r.integrity / 100, base.integrity);
  set("compulsory", r.compulsory / 100, base.compulsory);
  set("protection", r.protection / 100, base.protection);
  set("consensus", r.consensus / 100, base.consensus);
  set("threshold", r.threshold / 100, base.threshold ?? 0.05);
  s.ballotWeight = r.ballot;
  s.nightMinutes = r.night;
  commit();
}

export function settingsMenu(player, nation) {
  return loop(player, () => ({
    title: "Nation Settings",
    body: `${nation.color}§l${nation.name}§r §7· ${GOV_BY_ID[nation.gov].name}`,
    options: [
      {
        text: "Name, Color & Style",
        run: async () => {
          const r = await modal(player, "Nation", [
            { key: "name", type: "text", label: "Nation name", value: nation.name },
            { key: "color", type: "dropdown", label: "Color", options: colorOptions(), value: Math.max(0, COLORS.indexOf(nation.color)) },
            { key: "gov", type: "dropdown", label: GOVERNMENTS.map((g) => `§e${g.name}§r: §7${g.tagline}`).join("\n") + "\n\n§fVoting style:", options: GOVERNMENTS.map((g) => g.name), value: Math.max(0, GOVERNMENTS.findIndex((g) => g.id === nation.gov)) },
          ]);
          if (!r) return;
          nation.name = r.name.trim() || nation.name;
          nation.color = COLORS[r.color];
          const gov = GOVERNMENTS[r.gov].id;
          if (gov !== nation.gov) {
            nation.gov = gov;
            nation.settings = { totalSeats: nation.settings.totalSeats, ballotWeight: nation.settings.ballotWeight, nightMinutes: nation.settings.nightMinutes };
            if (nation.election && !nation.count) nation.election = null;
          }
          commit();
        },
      },
      { text: "§7Voting Rules (advanced)", run: () => rules(player, nation) },
      {
        text: "§cDelete Nation",
        run: async () => {
          if (!(await confirm(player, "Delete Nation", `Permanently delete ${nation.name}, its counties, candidates and history?`, "§cDelete"))) return;
          deleteNation(S(), nation.id);
          commit();
          return CLOSE;
        },
      },
    ],
  }));
}

export { colorOptions };

// ---------- issues of the term ----------

export function termMenu(player, nation) {
  return loop(player, () => {
    const on = new Set(nation.termEvents || []);
    const lines = ["§7What happened during this term? These change what voters care about and how they judge whoever is in office. They reset when a new term starts (after an election).", ""];
    lines.push(on.size ? TERM_EVENTS.filter((e) => on.has(e.id)).map((e) => `§c* ${e.name}§7 - ${e.desc}`).join("\n") : "§7Nothing major has happened.");
    return {
      title: "Issues of the Term",
      body: lines.join("\n"),
      options: [
        {
          text: "Choose What Happened",
          run: async () => {
            const r = await modal(player, "Issues of the Term", TERM_EVENTS.map((e) => ({ key: e.id, type: "toggle", label: `§e${e.name}§r §7- ${e.desc}`, value: on.has(e.id) })));
            if (!r) return;
            nation.termEvents = TERM_EVENTS.filter((e) => r[e.id]).map((e) => e.id);
            commit();
          },
        },
      ],
    };
  });
}
