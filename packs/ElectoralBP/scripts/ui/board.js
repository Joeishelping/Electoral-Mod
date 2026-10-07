// The Board Table: public entry point for every player.

import { GOVERNMENTS, GOV_BY_ID, effectiveGov } from "../data/governments.js";
import { COLORS, COLOR_NAMES } from "../data/names.js";
import { getPerson, getRegion, nationPersons, personLabel } from "../core/state.js";
import { resetState, stateSize } from "../core/storage.js";
import { generateNation } from "../engine/generate.js";
import { STANCES, STANCE_BY_ID, getStance, setStance } from "../engine/diplomacy.js";
import { confirm, modal, notice } from "./forms.js";
import { announce, canManage, commit, isAdmin, isLeaderOf, loop, S } from "./nav.js";
import { governmentPage, metricsPage, personCard } from "./render.js";
import { castBallot, electionsMenu, forecastMenu, historyMenu, moodMenu, viewResult } from "./elections.js";
import { manageNation, officesMenu, regionProfile } from "./admin.js";

const HELP = [
  "§lThe Board Table§r",
  "",
  "§6Nations§r each pick a government type. The type decides who votes, how votes are counted, how honest the count is, who sits in the cabinet and how power passes on.",
  "",
  "§6Regions§r (counties/provinces) have a population, voting power and a mix of voter groups - farmers, miners, merchants, clergy, youth and more. Each group has its own stances, priorities, turnout habits and taste in leaders.",
  "",
  "§6Candidates§r have stances on 12 issues, focus issues they campaign on, groups they court, campaign stops, a home region, and personal attributes (popularity, charisma, competence, integrity, funds).",
  "",
  "§6Performance sliders§r rate the government. Groups judge the incumbent (and their party) on the metrics tied to issues they care about.",
  "",
  "§6The count§r: every group in every region scores every candidate (policy distance, issue emphasis, personal appeal, local ties, courting, record, party loyalty, kinship) and votes probabilistically with realistic regional and national swings. Then the nation's method counts it: regional electors, popular vote, runoff, ranked choice, proportional seats with coalition bargaining, or council consensus.",
  "",
  "§6After each election§r voters remember who they backed, failing areas become more important, and reputations shift.",
  "",
  "§6Admins§r: operators, or players with the tag §eelectoral_admin§r (/tag @s add electoral_admin).",
  "§6Leaders§r: link a notable to your gamertag to use the Leader's Desk while in office.",
].join("\n");

function notablesView(player, nation) {
  return loop(player, () => {
    const state = S();
    const people = nationPersons(state, nation).sort((a, b) => b.popularity - a.popularity);
    return {
      title: "Notables",
      body: "§7Public figures of the nation.",
      options: people.map((p) => ({ text: `${personLabel(state, nation, p)}\n§7popularity ${p.popularity}`, run: () => loop(player, () => ({ title: p.name, body: personCard(S(), nation, p), options: [] })) })),
    };
  });
}

function votersView(player, nation) {
  return loop(player, () => ({
    title: "Voter Profiles",
    body: "§7Who lives where, what they care about, and which way they lean.",
    options: nation.regions.map((r) => ({ text: `${r.name}\n§7pop ${r.population} · power ${r.power}`, run: () => loop(player, () => ({ title: r.name, body: regionProfile(nation, r), options: [] })) })),
  }));
}

function leaderDesk(player, nation) {
  return loop(player, () => ({
    title: "Leader's Desk",
    body: `§7Welcome, ${effectiveGov(nation).leaderTitle}. Shape your government and foreign policy.`,
    options: [
      { text: "Appointments & Heir", run: () => officesMenu(player, nation, true) },
      { text: "Foreign Policy", run: () => setRelationFlow(player, nation) },
    ],
  }));
}

export function nationView(player, nation) {
  return loop(player, () => {
    const state = S();
    if (!state.nations[nation.id]) return null;
    const e = nation.election;
    const admin = isAdmin(player);
    const residence = state.residents[player.name];
    return {
      title: nation.name,
      body: governmentPage(state, nation),
      options: [
        e && e.kind === "popular" && { text: "§2Cast Your Ballot", icon: "textures/items/paper", run: () => castBallot(player, nation) },
        e && { text: "Polls & Forecast", icon: "textures/items/compass_item", run: () => forecastMenu(player, nation) },
        nation.history[0] && { text: "Latest Results", icon: "textures/items/book_written", run: () => viewResult(player, nation, nation.history[0]) },
        nation.history.length > 0 && { text: "Election History", run: () => historyMenu(player, nation) },
        { text: "Public Mood", icon: "textures/items/emerald", run: () => moodMenu(player, nation) },
        { text: "Government Performance", icon: "textures/items/clock_item", run: () => loop(player, () => ({ title: "Performance", body: metricsPage(nation), options: [] })) },
        nation.regions.length > 0 && { text: "Voter Profiles", icon: "textures/items/map_filled", run: () => votersView(player, nation) },
        { text: "Notables", icon: "textures/items/name_tag", run: () => notablesView(player, nation) },
        residence?.nationId !== nation.id && nation.regions.length > 0 && { text: "Become a Resident", run: () => residenceFlow(player, nation) },
        isLeaderOf(player, nation) && { text: "§6Leader's Desk", icon: "textures/items/gold_ingot", run: () => leaderDesk(player, nation) },
        admin && e && { text: "§eElections (admin)", run: () => electionsMenu(player, nation) },
        admin && { text: "§eManage Nation", icon: "textures/items/iron_sword", run: () => manageNation(player, nation) },
      ],
    };
  });
}

async function residenceFlow(player, nation) {
  const r = await modal(player, `Residency: ${nation.name}`, [
    { key: "region", type: "dropdown", label: "Your home region (where your ballot is counted):", options: nation.regions.map((x) => x.name) },
  ], "Register");
  if (!r) return;
  S().residents[player.name] = { nationId: nation.id, regionId: nation.regions[r.region].id };
  commit();
  player.sendMessage(`§aYou are now a resident of ${nation.regions[r.region].name}, ${nation.name}.`);
}

// ---------- diplomacy ----------

async function setRelationFlow(player, fixedNation = null) {
  const state = S();
  const nations = Object.values(state.nations);
  if (nations.length < 2) return notice(player, "Diplomacy", "At least two nations are needed.");
  const fields = [];
  if (!fixedNation) fields.push({ key: "a", type: "dropdown", label: "Nation", options: nations.map((n) => n.name) });
  const others = fixedNation ? nations.filter((n) => n.id !== fixedNation.id) : nations;
  fields.push({ key: "b", type: "dropdown", label: fixedNation ? `${fixedNation.name}'s relation toward` : "Toward", options: others.map((n) => n.name) });
  fields.push({ key: "stance", type: "dropdown", label: "Stance", options: STANCES.map((s) => `${s.color}${s.name}`), value: 3 });
  const r = await modal(player, "Set Relation", fields, "Declare");
  if (!r) return;
  const a = fixedNation || nations[r.a];
  const b = others[r.b];
  if (!a || !b || a.id === b.id) return notice(player, "Diplomacy", "Pick two different nations.");
  const stance = STANCES[r.stance];
  setStance(state, a.id, b.id, stance.id);
  commit();
  announce(`${a.color}${a.name}§r and ${b.color}${b.name}§r: ${stance.color}${stance.name}§r.`);
}

function diplomacyMenu(player) {
  return loop(player, () => {
    const state = S();
    const nations = Object.values(state.nations);
    const lines = ["§7Wars make security dominate elections and rally voters to incumbents; trade pacts raise the stakes of trade policy.", ""];
    for (const [key, stance] of Object.entries(state.relations)) {
      const [a, b] = key.split("|").map((id) => state.nations[id]);
      if (!a || !b) continue;
      const s = STANCE_BY_ID[stance];
      lines.push(`${a.color}${a.name}§r §7<->§r ${b.color}${b.name}§r: ${s.color}${s.name}`);
    }
    if (lines.length === 2) lines.push("§7All nations are neutral toward each other.");
    const admin = isAdmin(player);
    return {
      title: "Diplomacy Board",
      body: lines.join("\n"),
      options: [
        admin && { text: "§eSet a Relation", run: () => setRelationFlow(player) },
        ...nations.map((n) => ({
          text: `${n.color}${n.name}`,
          run: () => loop(player, () => ({
            title: n.name,
            body: nations.filter((o) => o.id !== n.id).map((o) => {
              const s = STANCE_BY_ID[getStance(state, n.id, o.id)];
              return `${o.color}${o.name}§r: ${s.color}${s.name}`;
            }).join("\n") || "§7No other nations.",
            options: [canManage(player, n) && { text: "Change a Relation", run: () => setRelationFlow(player, n) }],
          })),
        })),
      ],
    };
  });
}

// ---------- founding ----------

async function foundNation(player) {
  const r = await modal(player, "Found a Nation", [
    { key: "name", type: "text", label: "Name (blank = generate)", value: "" },
    { key: "gov", type: "dropdown", label: "Government type", options: GOVERNMENTS.map((g) => `${g.name} - ${g.description}`) },
    { key: "regions", type: "slider", label: "Regions to generate", min: 1, max: 16, value: 6 },
    { key: "color", type: "dropdown", label: "Color", options: ["Automatic", ...COLORS.map((c) => `${c}${COLOR_NAMES[c]}`)] },
  ], "Found");
  if (!r) return;
  const state = S();
  const nation = generateNation(state, { name: r.name.trim() || undefined, gov: GOVERNMENTS[r.gov].id, regions: r.regions });
  if (r.color > 0) nation.color = COLORS[r.color - 1];
  commit();
  announce(`A new nation is founded: ${nation.color}${nation.name}§r (${GOV_BY_ID[nation.gov].name}), led by ${getPerson(state, nation.leaderId)?.name}.`);
  return nationView(player, nation);
}

function boardSettings(player) {
  return loop(player, () => ({
    title: "Board Settings",
    body: `§7Saved data: §f${(stateSize() / 1024).toFixed(1)} KB§7 across ${Object.keys(S().nations).length} nation(s).`,
    options: [
      {
        text: "§cErase ALL Board Data",
        run: async () => {
          if (!(await confirm(player, "Erase Everything", "Delete every nation, person, election and relation? This cannot be undone.", "§cErase"))) return;
          resetState();
          announce("All Board Table data was erased.");
        },
      },
    ],
  }));
}

export function openBoard(player) {
  return loop(player, () => {
    const state = S();
    const nations = Object.values(state.nations);
    const admin = isAdmin(player);
    const res = state.residents[player.name];
    const home = res ? state.nations[res.nationId] : null;
    const open = nations.filter((n) => n.election);
    const lines = ["§7Nations, governments and elections of the realm."];
    if (home) lines.push(`§7Your residence: §f${getRegion(home, res.regionId)?.name || "?"}, ${home.name}`);
    if (open.length) lines.push("", "§a§lOpen elections:§r " + open.map((n) => `${n.color}${n.name}§r (${n.election.title})`).join(", "));
    if (!nations.length) lines.push("", admin ? "§eNo nations yet. Found one to get started." : "§7No nations have been founded yet. Ask an admin.");
    return {
      title: "§lBoard Table",
      body: lines.join("\n"),
      options: [
        ...nations.map((n) => {
          const leader = getPerson(state, n.leaderId);
          return {
            text: `${n.color}${n.name}${n.election ? " §a[VOTE]" : ""}\n§7${GOV_BY_ID[n.gov]?.name} · ${leader ? leader.name : "vacant"}`,
            run: () => nationView(player, n),
          };
        }),
        nations.length > 1 && { text: "Diplomacy Board", icon: "textures/items/compass_item", run: () => diplomacyMenu(player) },
        admin && { text: "§2Found a Nation", icon: "textures/items/banner_pattern", run: () => foundNation(player) },
        { text: "How It Works", icon: "textures/items/book_normal", run: () => loop(player, () => ({ title: "How It Works", body: HELP, options: [] })) },
        admin && { text: "§7Board Settings", run: () => boardSettings(player) },
      ],
    };
  }, "Close");
}

