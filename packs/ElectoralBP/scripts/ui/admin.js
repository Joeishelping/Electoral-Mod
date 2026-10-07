// Admin screens: performance sliders, regions, parties, notables, houses, offices
// and government rules.

import { BLOCS, BLOC_BY_ID, REGION_TEMPLATES } from "../data/blocs.js";
import { ISSUES, ISSUE_IDS } from "../data/issues.js";
import { METRICS } from "../data/metrics.js";
import { CABINET_STYLES, effectiveGov, GOVERNMENTS, GOV_BY_ID, METHODS, officeTitle, SUCCESSION_LAWS } from "../data/governments.js";
import { COLORS, COLOR_NAMES, personName } from "../data/names.js";
import {
  createHouse, createParty, createPerson, deleteNation, deletePerson, getPerson, nationHouses, nationPersons, personLabel, regionBlocShares,
} from "../core/state.js";
import { clamp, createRng } from "../core/random.js";
import { autoApportion, generateRegion } from "../engine/generate.js";
import { installLeader, issuePriorities, regionIdeal } from "../engine/apply.js";
import { confirm, modal, notice, pct, fmt } from "./forms.js";
import { CLOSE, commit, loop, S } from "./nav.js";
import { metricsPage, personCard } from "./render.js";
import { electionsMenu } from "./elections.js";

const rng = () => createRng(Math.floor(Math.random() * 2 ** 31));
const int = (v, fallback) => {
  const n = parseInt(String(v).replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
};

// ---------- performance ----------

async function editMetrics(player, nation) {
  const r = await modal(player, "Performance Sliders", METRICS.map((m) => ({
    key: m.id, type: "slider", label: `${m.name}\n§7How well has the government done? 50 = average`, min: 0, max: 100, step: 1, value: nation.metrics[m.id],
  })));
  if (!r) return;
  for (const m of METRICS) nation.metrics[m.id] = r[m.id];
  commit();
}

async function editFavor(player, nation) {
  if (!nation.regions.length) return notice(player, "Regional Favor", "No regions yet.");
  const r = await modal(player, "Regional Favor & Unrest", nation.regions.flatMap((reg) => [
    { key: `f:${reg.id}`, type: "slider", label: `§f${reg.name}§r favor §7(neglected -50 .. pampered +50)`, min: -50, max: 50, step: 5, value: reg.favor || 0 },
    { key: `u:${reg.id}`, type: "slider", label: `§7${reg.name} unrest`, min: 0, max: 100, step: 5, value: reg.unrest || 0 },
  ]));
  if (!r) return;
  for (const reg of nation.regions) {
    reg.favor = r[`f:${reg.id}`];
    reg.unrest = r[`u:${reg.id}`];
  }
  commit();
}

function performanceMenu(player, nation) {
  return loop(player, () => ({
    title: "Performance",
    body: `§7Sliders feed retrospective voting: each voter group weighs the metrics tied to the issues it cares about.\n\n${metricsPage(nation)}`,
    options: [
      { text: "Adjust Performance Sliders", icon: "textures/items/clock_item", run: () => editMetrics(player, nation) },
      { text: "Regional Favor & Unrest", run: () => editFavor(player, nation) },
    ],
  }));
}

// ---------- regions ----------

async function regionBasics(player, nation, region) {
  const r = await modal(player, `Region: ${region.name}`, [
    { key: "name", type: "text", label: "Name", value: region.name },
    { key: "pop", type: "text", label: "Population", value: String(region.population) },
    { key: "auto", type: "toggle", label: "Voting power set automatically from population", value: region.autoPower !== false },
    { key: "power", type: "slider", label: "Voting power (electors / seats) if manual", min: 1, max: 60, value: region.power },
    { key: "wealth", type: "slider", label: "Wealth", min: 0, max: 100, value: region.wealth },
    { key: "urban", type: "slider", label: "Urbanisation %", min: 0, max: 100, step: 5, value: Math.round((region.urban ?? 0.5) * 100) },
  ]);
  if (!r) return;
  region.name = r.name.trim() || region.name;
  region.population = clamp(int(r.pop, region.population), 0, 10000000);
  region.autoPower = r.auto;
  if (!r.auto) region.power = r.power;
  region.wealth = r.wealth;
  region.urban = r.urban / 100;
  autoApportion(nation, autoSeatTotal(nation));
  commit();
}

function autoSeatTotal(nation) {
  return nation.settings.totalSeats || null;
}

async function regionBlocs(player, region) {
  const r = await modal(player, "Voter Groups", BLOCS.map((b) => ({
    key: b.id, type: "slider", label: `${b.name} §7(relative share)`, min: 0, max: 100, value: region.blocs[b.id] || 0,
  })));
  if (!r) return;
  region.blocs = {};
  for (const b of BLOCS) if (r[b.id] > 0) region.blocs[b.id] = r[b.id];
  if (!Object.keys(region.blocs).length) region.blocs = { farmers: 1 };
  commit();
}

async function regionIssues(player, region) {
  const r = await modal(player, "Local Issues", ISSUES.map((i) => ({
    key: i.id, type: "slider", label: `${i.name} §7(how much more this region cares, %)`, min: -50, max: 150, step: 10, value: Math.round((region.issueMods[i.id] || 0) * 100),
  })));
  if (!r) return;
  region.issueMods = {};
  for (const i of ISSUES) if (r[i.id]) region.issueMods[i.id] = r[i.id] / 100;
  commit();
}

async function regionLean(player, nation, region) {
  if (!nation.parties.length) return notice(player, "Party Leanings", "This nation has no parties.");
  const r = await modal(player, "Party Leanings", nation.parties.map((p) => ({
    key: p.id, type: "slider", label: `${p.color}${p.name}§r §7(traditional loyalty -100..100)`, min: -100, max: 100, step: 5, value: Math.round((region.lean[p.id] || 0) * 100),
  })));
  if (!r) return;
  for (const p of nation.parties) region.lean[p.id] = r[p.id] / 100;
  commit();
}

function regionProfile(nation, region) {
  const state = S();
  const shares = regionBlocShares(region);
  const pri = issuePriorities(state, nation, region).slice(0, 5);
  const ideal = regionIdeal(state, nation, region);
  const lines = [
    `§l${region.name}§r §7(${REGION_TEMPLATES.find((t) => t.id === region.template)?.name || "Custom"})`,
    `§7Population §f${fmt(region.population)}§7 · Voting power §f${region.power}§7 · Wealth §f${region.wealth}§7 · Urban §f${pct(region.urban ?? 0.5, 0)}`,
    `§7Favor §f${region.favor || 0}§7 · Unrest §f${region.unrest || 0}`,
    "",
    "§6Who lives here",
    ...Object.entries(shares).sort((a, b) => b[1] - a[1]).map(([b, s]) => ` §f${BLOC_BY_ID[b].name}§7 ${pct(s, 0)}`),
    "",
    "§6Top issues: §f" + pri.map((p) => ISSUES.find((i) => i.id === p.id).name).join(", "),
    "§6Average voter: §f" + ISSUE_IDS.filter((id) => Math.abs(ideal[id]) >= 20).map((id) => {
      const i = ISSUES.find((x) => x.id === id);
      return `${ideal[id] < 0 ? i.low : i.high}`;
    }).join(", "),
  ];
  const leans = nation.parties.filter((p) => region.lean[p.id]).map((p) => `${p.color}${p.name} ${region.lean[p.id] > 0 ? "+" : ""}${Math.round(region.lean[p.id] * 100)}`);
  if (leans.length) lines.push("§6Leanings: " + leans.join("§7, "));
  const habits = [];
  for (const [b, mem] of Object.entries(region.memory || {})) {
    for (const [pid, v] of Object.entries(mem)) if (Math.abs(v) >= 0.15) {
      const p = nation.parties.find((x) => x.id === pid);
      if (p) habits.push(`${BLOC_BY_ID[b]?.name}: ${p.color}${p.name}§r ${v > 0 ? "loyal" : "hostile"}`);
    }
  }
  if (habits.length) lines.push("§6Learned habits: §7" + habits.slice(0, 6).join("; "));
  return lines.join("\n");
}
export { regionProfile };

function regionMenu(player, nation, region) {
  return loop(player, () => {
    if (!nation.regions.includes(region)) return null;
    return {
      title: region.name,
      body: regionProfile(nation, region),
      options: [
        { text: "Name, Population & Power", run: () => regionBasics(player, nation, region) },
        { text: "Voter Group Mix", run: () => regionBlocs(player, region) },
        { text: "Local Issues", run: () => regionIssues(player, region) },
        nation.parties.length && { text: "Party Leanings", run: () => regionLean(player, nation, region) },
        {
          text: "§cDelete Region",
          run: async () => {
            if (!(await confirm(player, "Delete Region", `Delete ${region.name}?`))) return;
            nation.regions = nation.regions.filter((r) => r !== region);
            autoApportion(nation, autoSeatTotal(nation));
            commit();
            return "back";
          },
        },
      ],
    };
  });
}

async function addRegion(player, nation) {
  const r = await modal(player, "Add Region", [
    { key: "tpl", type: "dropdown", label: "Template (sets population, voter mix, wealth, local issues)", options: REGION_TEMPLATES.map((t) => t.name) },
    { key: "name", type: "text", label: "Name (blank = generate)", value: "" },
  ], "Create");
  if (!r) return;
  const taken = new Set(nation.regions.map((x) => x.name));
  const region = generateRegion(S(), nation, rng(), REGION_TEMPLATES[r.tpl].id, taken);
  if (r.name.trim()) region.name = r.name.trim();
  autoApportion(nation, autoSeatTotal(nation));
  commit();
}

async function apportion(player, nation) {
  const autoCount = nation.regions.filter((r) => r.autoPower !== false).length;
  const r = await modal(player, "Apportion Voting Power", [
    { key: "total", type: "slider", label: `Total electors/seats shared by ${autoCount} auto region(s) (each gets at least 1)`, min: Math.max(1, autoCount), max: Math.max(autoCount + 1, 200), value: nation.settings.totalSeats || Math.max(autoCount * 3, 8) },
  ], "Apportion");
  if (!r) return;
  nation.settings.totalSeats = r.total;
  autoApportion(nation, r.total);
  commit();
}

function regionsMenu(player, nation) {
  return loop(player, () => ({
    title: "Regions",
    body: `§7Regions are counties/states/provinces. Each has a population, a mix of voter groups, local issues and voting power.\n§7Total population: §f${fmt(nation.regions.reduce((s, r) => s + r.population, 0))}§7 · Voting power: §f${nation.regions.reduce((s, r) => s + r.power, 0)}`,
    options: [
      ...nation.regions.map((reg) => ({ text: `${reg.name}\n§7pop ${fmt(reg.population)} · power ${reg.power}`, run: () => regionMenu(player, nation, reg) })),
      { text: "§2+ Add Region", run: () => addRegion(player, nation) },
      { text: "Apportion Voting Power", run: () => apportion(player, nation) },
    ],
  }));
}

// ---------- parties ----------

async function editParty(player, nation, party) {
  const r = await modal(player, `Party: ${party.name}`, [
    { key: "name", type: "text", label: "Name", value: party.name },
    { key: "color", type: "dropdown", label: "Color", options: COLORS.map((c) => `${c}${COLOR_NAMES[c]}`), value: Math.max(0, COLORS.indexOf(party.color)) },
    ...ISSUES.map((i) => ({ key: i.id, type: "slider", label: `${i.name}: §7${i.low} <-> ${i.high}`, min: -100, max: 100, step: 5, value: party.positions[i.id] || 0 })),
  ]);
  if (!r) return;
  party.name = r.name.trim() || party.name;
  party.color = COLORS[r.color];
  for (const i of ISSUES) party.positions[i.id] = r[i.id];
  commit();
}

function partiesMenu(player, nation) {
  return loop(player, () => ({
    title: "Parties",
    body: "§7A party's platform shapes coalition bargaining and gives its candidates regional loyalty and learned voter habits.",
    options: [
      ...nation.parties.map((p) => ({
        text: `${p.color}${p.name}\n§7${nationPersons(S(), nation).filter((x) => x.partyId === p.id).length} members`,
        run: () => loop(player, () => ({
          title: p.name,
          body: `${p.color}§l${p.name}§r\n` + ISSUES.filter((i) => Math.abs(p.positions[i.id]) >= 20).map((i) => `§7${i.name}: §f${p.positions[i.id] < 0 ? i.low : i.high} (${p.positions[i.id]})`).join("\n"),
          options: [
            { text: "Edit Name, Color & Platform", run: () => editParty(player, nation, p) },
            {
              text: "§cDelete Party",
              run: async () => {
                if (!(await confirm(player, "Delete Party", `Delete ${p.name}? Members become independents.`))) return;
                nation.parties = nation.parties.filter((x) => x !== p);
                for (const person of nationPersons(S(), nation, true)) if (person.partyId === p.id) person.partyId = null;
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
      {
        text: "§2+ New Party",
        run: async () => {
          const used = new Set(nation.parties.map((p) => p.color));
          const party = createParty(S(), nation, { name: `New Party ${nation.parties.length + 1}`, color: COLORS.find((c) => !used.has(c)) || "§7" });
          await editParty(player, nation, party);
          commit();
        },
      },
    ],
  }));
}

// ---------- notables ----------

async function personBasics(player, nation, p) {
  const state = S();
  const regions = nation.regions;
  const others = nationPersons(state, nation).filter((x) => x.id !== p.id);
  const gov = effectiveGov(nation);
  const r = await modal(player, `Edit: ${p.name}`, [
    { key: "name", type: "text", label: "Name", value: p.name },
    { key: "player", type: "text", label: "Linked player name (lets them use the Leader's Desk when in office)", placeholder: "Gamertag", value: p.player },
    { key: "party", type: "dropdown", label: "Party", options: ["Independent", ...nation.parties.map((x) => x.name)], value: Math.max(0, nation.parties.findIndex((x) => x.id === p.partyId) + 1) },
    { key: "home", type: "dropdown", label: "Home region (home-turf bonus)", options: ["None", ...regions.map((x) => x.name)], value: Math.max(0, regions.findIndex((x) => x.id === p.homeRegion) + 1) },
    { key: "age", type: "slider", label: "Age", min: 0, max: 100, value: p.age },
    { key: "alive", type: "toggle", label: "Alive", value: p.alive },
    { key: "approved", type: "toggle", label: gov.vetting ? "Approved to stand for office (vetting)" : "Approved to stand (only matters under vetting)", value: p.approved },
    { key: "mate", type: "dropdown", label: "Running mate (deputy if elected)", options: ["None", ...others.map((x) => x.name)], value: Math.max(0, others.findIndex((x) => x.id === p.runningMateId) + 1) },
  ]);
  if (!r) return;
  p.name = r.name.trim() || p.name;
  p.player = r.player.trim();
  p.partyId = r.party === 0 ? null : nation.parties[r.party - 1].id;
  p.homeRegion = r.home === 0 ? null : regions[r.home - 1].id;
  p.age = r.age;
  p.alive = r.alive;
  p.approved = r.approved;
  p.runningMateId = r.mate === 0 ? null : others[r.mate - 1].id;
  commit();
}

async function personAttributes(player, p) {
  const fields = [
    ["popularity", "Popularity with the people"],
    ["charisma", "Charisma (matters most to youth & laborers)"],
    ["competence", "Competence (matters most to scholars & merchants)"],
    ["integrity", "Integrity (matters most to clergy & elders)"],
    ["loyalty", "Loyalty to the leadership"],
    ["funds", "Campaign funds / wealth"],
  ];
  const r = await modal(player, `Attributes: ${p.name}`, fields.map(([k, label]) => ({ key: k, type: "slider", label, min: 0, max: 100, value: p[k] })));
  if (!r) return;
  for (const [k] of fields) p[k] = r[k];
  commit();
}

async function personStances(player, p) {
  const r = await modal(player, `Stances: ${p.name}`, ISSUES.map((i) => ({
    key: i.id, type: "slider", label: `${i.name}: §7${i.low} <-> ${i.high}`, min: -100, max: 100, step: 5, value: p.positions[i.id],
  })));
  if (!r) return;
  for (const i of ISSUES) p.positions[i.id] = r[i.id];
  commit();
}

async function personCampaign(player, nation, p) {
  const r = await modal(player, `Campaign: ${p.name}`, [
    ...ISSUES.map((i) => ({ key: `i:${i.id}`, type: "toggle", label: `§eFocus issue:§r ${i.name}`, value: p.focus.includes(i.id) })),
    ...BLOCS.map((b) => ({ key: `b:${b.id}`, type: "toggle", label: `§bCourt group:§r ${b.name}`, value: p.targets.includes(b.id) })),
    ...nation.regions.map((reg) => ({ key: `r:${reg.id}`, type: "toggle", label: `§aCampaign stop:§r ${reg.name}`, value: p.campaignRegions.includes(reg.id) })),
  ]);
  if (!r) return;
  p.focus = ISSUES.filter((i) => r[`i:${i.id}`]).map((i) => i.id).slice(0, 3);
  p.targets = BLOCS.filter((b) => r[`b:${b.id}`]).map((b) => b.id).slice(0, 3);
  p.campaignRegions = nation.regions.filter((reg) => r[`r:${reg.id}`]).map((reg) => reg.id).slice(0, 4);
  commit();
  player.sendMessage("§7Campaign saved (max 3 focus issues, 3 courted groups, 4 campaign stops).");
}

async function personFamily(player, nation, p) {
  const state = S();
  const others = nationPersons(state, nation, true).filter((x) => x.id !== p.id);
  const houses = nationHouses(state, nation);
  const r = await modal(player, `Family: ${p.name}`, [
    { key: "dyn", type: "text", label: "Bloodline / dynasty name (blank = none)", value: p.dynasty },
    { key: "parent", type: "dropdown", label: "Parent", options: ["None", ...others.map((x) => `${x.name}${x.alive ? "" : " (dead)"}`)], value: Math.max(0, others.findIndex((x) => x.id === p.parentId) + 1) },
    { key: "legit", type: "slider", label: "Legitimacy of claim (below 30 = barred from inheriting)", min: 0, max: 100, value: p.legitimacy },
    { key: "clan", type: "dropdown", label: "House / clan", options: ["None", ...houses.map((h) => h.name)], value: Math.max(0, houses.findIndex((h) => h.id === p.clanId) + 1) },
  ]);
  if (!r) return;
  p.dynasty = r.dyn.trim();
  p.parentId = r.parent === 0 ? null : others[r.parent - 1].id;
  p.legitimacy = r.legit;
  p.clanId = r.clan === 0 ? null : houses[r.clan - 1].id;
  commit();
}

function personMenu(player, nation, p) {
  return loop(player, () => {
    if (!S().persons[p.id]) return null;
    return {
      title: p.name,
      body: personCard(S(), nation, p),
      options: [
        { text: "Basics (name, party, player, age)", run: () => personBasics(player, nation, p) },
        { text: "Attributes", run: () => personAttributes(player, p) },
        { text: "Policy Stances", run: () => personStances(player, p) },
        { text: "Campaign Strategy", run: () => personCampaign(player, nation, p) },
        { text: "Family & Clan", run: () => personFamily(player, nation, p) },
        {
          text: "§cDelete",
          run: async () => {
            if (!(await confirm(player, "Delete", `Delete ${p.name} permanently?`))) return;
            deletePerson(S(), p.id);
            commit();
            return "back";
          },
        },
      ],
    };
  });
}

function personsMenu(player, nation) {
  return loop(player, () => {
    const state = S();
    const people = nationPersons(state, nation, true).sort((a, b) => (b.alive - a.alive) || String(a.partyId).localeCompare(String(b.partyId)) || a.name.localeCompare(b.name));
    return {
      title: "Notables & Candidates",
      body: "§7Everyone who can run, serve in the cabinet or inherit. Players can be linked to a notable.",
      options: [
        { text: "§2+ New Notable", run: () => newPerson(player, nation) },
        ...people.map((p) => ({ text: `${personLabel(state, nation, p)}\n§7age ${p.age}${p.alive ? "" : " · deceased"}${p.id === nation.leaderId ? " · §6leader" : ""}`, run: () => personMenu(player, nation, p) })),
      ],
    };
  });
}

async function newPerson(player, nation) {
  const r = await modal(player, "New Notable", [
    { key: "name", type: "text", label: "Name (blank = generate)", value: "" },
    { key: "player", type: "text", label: "Linked player (optional)", value: "" },
    { key: "party", type: "dropdown", label: "Party", options: ["Independent", ...nation.parties.map((x) => x.name)] },
    { key: "copy", type: "toggle", label: "Start from the party platform's stances", value: true },
  ], "Create");
  if (!r) return;
  const g = rng();
  const party = r.party ? nation.parties[r.party - 1] : null;
  const positions = {};
  for (const id of ISSUE_IDS) positions[id] = clamp(Math.round((party && r.copy ? party.positions[id] : 0) + g.normal(0, 10)), -100, 100);
  const p = createPerson(S(), nation, {
    name: r.name.trim() || personName(g),
    player: r.player.trim(),
    partyId: party ? party.id : null,
    positions,
    homeRegion: nation.regions[0]?.id ?? null,
    dynasty: "",
  });
  commit();
  return personMenu(player, nation, p);
}

// ---------- houses ----------

function housesMenu(player, nation) {
  return loop(player, () => {
    const houses = nationHouses(S(), nation);
    return {
      title: "Houses & Clans",
      body: "§7Great houses / clan heads vote in hereditary councils: confirming heirs, or choosing among bloodline members by consensus. Influence = voting weight. Loyalty = support for the ruler's chosen heir.",
      options: [
        ...houses.map((h) => ({ text: `${h.name}\n§7influence ${h.influence} · loyalty ${h.loyalty}`, run: () => houseMenu(player, nation, h) })),
        {
          text: "§2+ New House / Clan",
          run: async () => {
            const h = createHouse(S(), nation, { name: `House ${nationHouses(S(), nation).length + 1}`, regionId: nation.regions[0]?.id ?? null });
            commit();
            return houseMenu(player, nation, h);
          },
        },
      ],
    };
  });
}

function houseMenu(player, nation, h) {
  return loop(player, () => {
    if (!S().houses[h.id]) return null;
    const region = nation.regions.find((r) => r.id === h.regionId);
    const ops = Object.entries(h.opinions).filter(([, v]) => v).map(([id, v]) => `${getPerson(S(), id)?.name || "?"}: ${v > 0 ? "§a+" : "§c"}${v}`);
    return {
      title: h.name,
      body: `§l${h.name}§r\n§7Seat: §f${region?.name || "none"}§7 · Influence §f${h.influence}§7 · Loyalty §f${h.loyalty}\n§7Stances: §f${h.positions ? "custom" : "from home region"}\n§7Opinions: ${ops.join("§7, ") || "neutral"}`,
      options: [
        {
          text: "Name, Seat, Influence & Loyalty",
          run: async () => {
            const r = await modal(player, h.name, [
              { key: "name", type: "text", label: "Name", value: h.name },
              { key: "region", type: "dropdown", label: "Seat (home region)", options: ["None", ...nation.regions.map((x) => x.name)], value: Math.max(0, nation.regions.findIndex((x) => x.id === h.regionId) + 1) },
              { key: "influence", type: "slider", label: "Influence (council voting weight)", min: 1, max: 100, value: h.influence },
              { key: "loyalty", type: "slider", label: "Loyalty to the ruler", min: 0, max: 100, value: h.loyalty },
            ]);
            if (!r) return;
            h.name = r.name.trim() || h.name;
            h.regionId = r.region ? nation.regions[r.region - 1].id : null;
            h.influence = r.influence;
            h.loyalty = r.loyalty;
            commit();
          },
        },
        {
          text: "Opinions of Notables",
          run: async () => {
            const people = nationPersons(S(), nation).filter((p) => p.age >= 16).slice(0, 30);
            const r = await modal(player, `${h.name}: Opinions`, people.map((p) => ({ key: p.id, type: "slider", label: p.name, min: -100, max: 100, step: 10, value: h.opinions[p.id] || 0 })));
            if (!r) return;
            for (const p of people) {
              if (r[p.id]) h.opinions[p.id] = r[p.id];
              else delete h.opinions[p.id];
            }
            commit();
          },
        },
        {
          text: "Stances",
          run: async () => {
            const region = nation.regions.find((x) => x.id === h.regionId);
            const base = h.positions || (region ? regionIdeal(S(), nation, region) : {});
            const r = await modal(player, `${h.name}: Stances`, [
              { key: "custom", type: "toggle", label: "Use custom stances (off = follow home region)", value: !!h.positions },
              ...ISSUES.map((i) => ({ key: i.id, type: "slider", label: `${i.name}: §7${i.low} <-> ${i.high}`, min: -100, max: 100, step: 5, value: Math.round(base[i.id] || 0) })),
            ]);
            if (!r) return;
            h.positions = r.custom ? Object.fromEntries(ISSUES.map((i) => [i.id, r[i.id]])) : null;
            commit();
          },
        },
        {
          text: "§cDelete",
          run: async () => {
            if (!(await confirm(player, "Delete", `Delete ${h.name}?`))) return;
            delete S().houses[h.id];
            for (const p of nationPersons(S(), nation, true)) if (p.clanId === h.id) p.clanId = null;
            commit();
            return "back";
          },
        },
      ],
    };
  });
}

// ---------- offices ----------

export function officesMenu(player, nation, leaderMode = false) {
  return loop(player, () => {
    const state = S();
    const gov = effectiveGov(nation);
    const people = nationPersons(state, nation).filter((p) => p.age >= 16);
    const pins = Object.entries(nation.cabinetPins).map(([o, id]) => `${o === "deputy" ? gov.deputyTitle : officeTitle(gov, o)} -> ${getPerson(state, id)?.name}`);
    return {
      title: leaderMode ? "Leader's Desk" : "Offices",
      body: `§7Pinned appointments are respected whenever a government forms. Unpinned posts are filled automatically (${CABINET_STYLES[gov.cabinetStyle]}).\n\n§6Pins:§r ${pins.join(", ") || "§7none"}`,
      options: [
        !leaderMode && {
          text: `Set ${gov.leaderTitle}`,
          run: async () => {
            const r = await modal(player, `Set ${gov.leaderTitle}`, [
              { key: "who", type: "dropdown", label: "Person", options: people.map((p) => p.name), value: Math.max(0, people.findIndex((p) => p.id === nation.leaderId)) },
            ], "Install");
            if (!r || !people[r.who]) return;
            installLeader(state, nation, people[r.who].id, Math.floor(Math.random() * 1e9), { continuity: true, keepDeputy: true });
            commit();
          },
        },
        {
          text: "Appoint to an Office",
          run: async () => {
            const offices = ["deputy", ...gov.offices];
            const r = await modal(player, "Appoint", [
              { key: "office", type: "dropdown", label: "Office", options: offices.map((o) => (o === "deputy" ? gov.deputyTitle : officeTitle(gov, o))) },
              { key: "who", type: "dropdown", label: "Appointee", options: ["(automatic)", ...people.map((p) => p.name)] },
            ], "Appoint");
            if (!r) return;
            const office = offices[r.office];
            if (r.who === 0) delete nation.cabinetPins[office];
            else {
              const pid = people[r.who - 1].id;
              for (const [o, id] of Object.entries(nation.cabinetPins)) if (id === pid) delete nation.cabinetPins[o];
              nation.cabinetPins[office] = pid;
            }
            if (nation.leaderId) installLeader(state, nation, nation.leaderId, Math.floor(Math.random() * 1e9), { continuity: true, keepDeputy: office !== "deputy", reshuffle: true });
            commit();
          },
        },
        (gov.succession === "designated" || gov.succession === "bloodline") && {
          text: "Designate Heir / Successor",
          run: async () => {
            const r = await modal(player, "Designate Heir", [
              { key: "who", type: "dropdown", label: "Heir", options: ["(none)", ...people.filter((p) => p.id !== nation.leaderId).map((p) => p.name)] },
            ]);
            if (!r) return;
            const pool = people.filter((p) => p.id !== nation.leaderId);
            nation.heirId = r.who === 0 ? null : pool[r.who - 1].id;
            commit();
          },
        },
        {
          text: "Reshuffle Cabinet (auto)",
          run: async () => {
            if (!nation.leaderId) return notice(player, "Reshuffle", "There is no leader.");
            installLeader(state, nation, nation.leaderId, Math.floor(Math.random() * 1e9), { keepDeputy: true, reshuffle: true });
            commit();
          },
        },
        !leaderMode && { text: "Clear All Pins", run: () => { nation.cabinetPins = {}; commit(); } },
      ],
    };
  });
}

// ---------- government rules ----------

async function governmentSettings(player, nation) {
  const r1 = await modal(player, "Government Type", [
    { key: "gov", type: "dropdown", label: GOVERNMENTS.map((g) => `§e${g.name}§r: §7${g.description}`).join("\n\n") + "\n\nType:", options: GOVERNMENTS.map((g) => g.name), value: Math.max(0, GOVERNMENTS.findIndex((g) => g.id === nation.gov)) },
    { key: "reset", type: "toggle", label: "Reset custom rule overrides to this type's defaults", value: false },
  ], "Next");
  if (!r1) return;
  const changed = GOVERNMENTS[r1.gov].id !== nation.gov;
  nation.gov = GOVERNMENTS[r1.gov].id;
  if (r1.reset || changed) {
    const keep = { totalSeats: nation.settings.totalSeats };
    nation.settings = keep;
  }
  if (changed && nation.election) nation.election = null;
  const gov = effectiveGov(nation);
  const base = GOV_BY_ID[nation.gov];
  const methods = Object.keys(METHODS);
  const laws = Object.keys(SUCCESSION_LAWS);
  const styles = Object.keys(CABINET_STYLES);
  const r = await modal(player, `${base.name}: Rules`, [
    { key: "method", type: "dropdown", label: "Counting method (popular systems)", options: methods.map((m) => METHODS[m].name), value: methods.indexOf(gov.method) },
    { key: "integrity", type: "slider", label: "Election integrity % (100 = free & fair; lower = managed counts for the endorsed candidate)", min: 0, max: 100, step: 5, value: Math.round(gov.integrity * 100) },
    { key: "compulsory", type: "slider", label: "Enforced turnout % (0 = voluntary voting)", min: 0, max: 99, step: 1, value: Math.round(gov.compulsory * 100) },
    { key: "protection", type: "slider", label: "Leader protection % (shield against losing / removal)", min: 0, max: 100, step: 5, value: Math.round(gov.protection * 100) },
    { key: "consensus", type: "slider", label: "Council consensus threshold %", min: 50, max: 100, step: 1, value: Math.round(gov.consensus * 100) },
    { key: "law", type: "dropdown", label: "Succession law (hereditary systems)", options: laws.map((l) => SUCCESSION_LAWS[l]), value: Math.max(0, laws.indexOf(gov.successionLaw)) },
    { key: "confirm", type: "toggle", label: "Heir must be confirmed by the houses", value: !!gov.confirmation },
    { key: "style", type: "dropdown", label: "Cabinet selection", options: styles.map((s) => CABINET_STYLES[s]), value: Math.max(0, styles.indexOf(gov.cabinetStyle)) },
    { key: "termLimit", type: "slider", label: "Term limit for the leader (0 = none)", min: 0, max: 10, value: gov.termLimit },
    { key: "threshold", type: "slider", label: "Proportional seat threshold %", min: 0, max: 20, value: Math.round(gov.threshold * 100) },
    { key: "mate", type: "toggle", label: "Candidates run with a running mate", value: !!gov.runningMate },
    { key: "ballot", type: "slider", label: "Votes per player ballot", min: 1, max: 500, step: 1, value: gov.ballotWeight },
    { key: "autofill", type: "toggle", label: "Auto-appoint new officials when no one fits a post", value: gov.autoFill },
  ]);
  if (!r) return commit();
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
  set("successionLaw", laws[r.law], base.successionLaw ?? "primogeniture");
  set("confirmation", r.confirm, !!base.confirmation);
  set("cabinetStyle", styles[r.style], base.cabinetStyle);
  set("termLimit", r.termLimit, base.termLimit);
  set("threshold", r.threshold / 100, base.threshold ?? 0.05);
  set("runningMate", r.mate, !!base.runningMate);
  s.ballotWeight = r.ballot;
  s.autoFill = r.autofill;
  if (methods[r.method] === "proportional" && !GOV_BY_ID[nation.gov].methods.includes("proportional")) {
    player.sendMessage("§eProportional counting forms coalitions; consider Coalition cabinet selection.");
  }
  commit();
  player.sendMessage(`§aGovernment rules saved. ${nation.name} is now a ${base.name}.`);
}

// ---------- top level ----------

export function manageNation(player, nation) {
  return loop(player, () => {
    const state = S();
    if (!state.nations[nation.id]) return null;
    const gov = effectiveGov(nation);
    return {
      title: `Manage: ${nation.name}`,
      body: `${nation.color}§l${nation.name}§r §7· ${GOV_BY_ID[nation.gov].name}\n§7${nation.regions.length} regions · ${nation.parties.length} parties · ${nationPersons(state, nation).length} notables · ${nationHouses(state, nation).length} houses`,
      options: [
        { text: "Performance Sliders", icon: "textures/items/clock_item", run: () => performanceMenu(player, nation) },
        { text: "Elections & Succession", icon: "textures/items/paper", run: () => electionsMenu(player, nation) },
        { text: "Regions & Voters", icon: "textures/items/map_filled", run: () => regionsMenu(player, nation) },
        (gov.multiParty || nation.parties.length > 0) && { text: "Parties", icon: "textures/items/banner_pattern", run: () => partiesMenu(player, nation) },
        { text: "Notables & Candidates", icon: "textures/items/name_tag", run: () => personsMenu(player, nation) },
        { text: "Houses & Clans", icon: "textures/items/totem", run: () => housesMenu(player, nation) },
        { text: "Offices & Cabinet", icon: "textures/items/book_written", run: () => officesMenu(player, nation) },
        { text: "Government Type & Rules", icon: "textures/items/iron_sword", run: () => governmentSettings(player, nation) },
        {
          text: "Name & Color",
          run: async () => {
            const r = await modal(player, "Identity", [
              { key: "name", type: "text", label: "Nation name", value: nation.name },
              { key: "color", type: "dropdown", label: "Color", options: COLORS.map((c) => `${c}${COLOR_NAMES[c]}`), value: Math.max(0, COLORS.indexOf(nation.color)) },
            ]);
            if (!r) return;
            nation.name = r.name.trim() || nation.name;
            nation.color = COLORS[r.color];
            commit();
          },
        },
        {
          text: "§cDelete Nation",
          run: async () => {
            if (!(await confirm(player, "Delete Nation", `Permanently delete ${nation.name} and everyone in it?`, "§cDelete"))) return;
            deleteNation(S(), nation.id);
            commit();
            return CLOSE;
          },
        },
      ],
    };
  });
}
