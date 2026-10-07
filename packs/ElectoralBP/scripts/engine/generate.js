// Quick-start generators: build a playable nation (regions, parties, notables,
// houses, dynasty, leadership) in one click, then let admins tweak it.

import { ISSUE_IDS } from "../data/issues.js";
import { REGION_TEMPLATES } from "../data/blocs.js";
import { GOV_BY_ID } from "../data/governments.js";
import { METRIC_IDS } from "../data/metrics.js";
import { createHouse, createNation, createParty, createPerson, createRegion } from "../core/state.js";
import { clamp, createRng } from "../core/random.js";
import { COLORS, firstName, nationName, partyName, placeName, surname, uniqueName } from "../data/names.js";
import { installLeader } from "./apply.js";

const PARTY_ARCHETYPES = [
  { key: "workers", positions: { labor: 70, welfare: 60, economy: -40, settlers: 10, tradition: -10, order: -10, infrastructure: 40 }, targets: ["laborers", "miners"] },
  { key: "heritage", positions: { tradition: 60, order: 50, economy: 40, welfare: -20, labor: -30, settlers: -40, military: 40, authority: 30 }, targets: ["clergy", "nobility", "elders"] },
  { key: "market", positions: { economy: 70, trade: 70, infrastructure: 30, labor: -40, tradition: -20, settlers: 30 }, targets: ["merchants", "artisans"] },
  { key: "green", positions: { environment: 70, settlers: 40, tradition: -40, order: -40, military: -40, welfare: 30 }, targets: ["youth", "scholars", "farmers"] },
  { key: "frontier", positions: { expansion: 60, military: 50, settlers: 60, authority: -40, infrastructure: 50 }, targets: ["frontier", "soldiers"] },
];
const STATE_PARTY = { key: "state", positions: { authority: 75, order: 60, economy: -40, welfare: 40, military: 50, labor: 40, tradition: 10 }, targets: ["laborers", "soldiers"] };

const jitterPositions = (rng, base, sd) => {
  const out = {};
  for (const id of ISSUE_IDS) out[id] = clamp(Math.round((base[id] ?? 0) + rng.normal(0, sd)), -100, 100);
  return out;
};
const topIssues = (positions, k) =>
  Object.entries(positions).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, k).map(([id]) => id);

export function autoApportion(nation, totalSeats = null) {
  const regions = nation.regions.filter((r) => r.autoPower !== false);
  if (!regions.length) return;
  const seats = totalSeats ?? Math.max(regions.length * 3, 8);
  const base = regions.length; // every region gets at least one
  const pop = regions.reduce((s, r) => s + r.population, 0) || 1;
  const rows = regions.map((r) => {
    const exact = ((seats - base) * r.population) / pop;
    return { r, n: 1 + Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = seats - rows.reduce((s, x) => s + x.n, 0);
  rows.sort((a, b) => b.rem - a.rem);
  for (const row of rows) if (left-- > 0) row.n++;
  for (const row of rows) row.r.power = row.n;
}

export function generateRegion(state, nation, rng, templateId = null, taken = new Set()) {
  const tpl = REGION_TEMPLATES.find((t) => t.id === templateId) || rng.pick(REGION_TEMPLATES);
  const blocs = {};
  for (const [b, v] of Object.entries(tpl.mix)) blocs[b] = Math.max(1, Math.round(v * rng.range(0.7, 1.3)));
  const issueMods = {};
  for (const [i, v] of Object.entries(tpl.focus)) issueMods[i] = Math.round(v * rng.range(0.7, 1.3) * 100) / 100;
  return createRegion(state, nation, {
    name: uniqueName(rng, placeName, taken),
    template: tpl.id,
    population: Math.round(rng.range(tpl.pop[0], tpl.pop[1]) / 10) * 10,
    blocs,
    wealth: clamp(Math.round(tpl.wealth + rng.normal(0, 8)), 5, 100),
    urban: tpl.urban,
    issueMods,
  });
}

function makeNotable(state, nation, rng, taken, data) {
  const positions = jitterPositions(rng, data.base || {}, data.sd ?? 18);
  return createPerson(state, nation, {
    name: data.name || uniqueName(rng, (r) => `${firstName(r)} ${data.surname || surname(r)}`, taken),
    positions,
    focus: data.focus || topIssues(positions, 2),
    targets: data.targets || [],
    charisma: rng.int(30, 85),
    popularity: rng.int(30, 75),
    competence: rng.int(30, 85),
    integrity: rng.int(30, 90),
    loyalty: data.loyalty ?? rng.int(40, 85),
    funds: rng.int(20, 80),
    age: data.age ?? rng.int(30, 70),
    homeRegion: data.homeRegion ?? rng.pick(nation.regions).id,
    partyId: data.partyId ?? null,
    dynasty: data.dynasty || "",
    parentId: data.parentId ?? null,
    legitimacy: data.legitimacy ?? 80,
    clanId: data.clanId ?? null,
    alive: data.alive ?? true,
  });
}

export function generateNation(state, opts = {}) {
  const rng = createRng(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
  const gov = GOV_BY_ID[opts.gov] || GOV_BY_ID.democracy;
  const usedColors = new Set(Object.values(state.nations).map((n) => n.color));
  const color = COLORS.find((c) => !usedColors.has(c)) || rng.pick(COLORS);
  const nation = createNation(state, { name: opts.name || nationName(rng), gov: gov.id, color });
  for (const id of METRIC_IDS) nation.metrics[id] = rng.int(35, 70);

  const taken = new Set();
  const count = clamp(opts.regions ?? 6, 1, 24);
  generateRegion(state, nation, rng, "capital", taken);
  const others = rng.shuffle(REGION_TEMPLATES.filter((t) => t.id !== "capital"));
  for (let i = 1; i < count; i++) generateRegion(state, nation, rng, others[(i - 1) % others.length].id, taken);
  autoApportion(nation);

  const people = new Set();
  let leader = null;

  if (gov.selection === "hereditary") {
    const dyn = surname(rng);
    nation.dynasty = dyn;
    const houseKind = gov.id === "clan" ? "Clan" : "House";
    const houses = [];
    const ruling = createHouse(state, nation, { name: `${houseKind} ${dyn}`, regionId: nation.regions[0].id, influence: 70, loyalty: 85 });
    houses.push(ruling);
    const houseCount = clamp(Math.ceil(nation.regions.length * 0.75), 3, 7);
    for (let i = 1; i < houseCount; i++) {
      houses.push(createHouse(state, nation, {
        name: `${houseKind} ${surname(rng)}`,
        regionId: nation.regions[i % nation.regions.length].id,
        influence: rng.int(20, 70),
        loyalty: rng.int(30, 85),
      }));
    }
    const fam = (data) => makeNotable(state, nation, rng, people, { surname: dyn, dynasty: dyn, clanId: ruling.id, homeRegion: nation.regions[0].id, sd: 30, ...data });
    const founder = fam({ age: 82, alive: false });
    leader = fam({ age: 56, parentId: founder.id, loyalty: 100 });
    const sibling = fam({ age: 51, parentId: founder.id });
    const eldest = fam({ age: 31, parentId: leader.id });
    fam({ age: 27, parentId: leader.id });
    fam({ age: 19, parentId: leader.id, legitimacy: 40 });
    fam({ age: 7, parentId: eldest.id });
    fam({ age: 24, parentId: sibling.id });
    for (const h of houses.slice(1)) {
      makeNotable(state, nation, rng, people, { clanId: h.id, homeRegion: h.regionId, sd: 35 });
    }
    for (let i = 0; i < 2; i++) makeNotable(state, nation, rng, people, { sd: 35 });
  } else if (gov.selection === "council") {
    const lean = gov.id === "theocracy" ? { tradition: 70, order: 40, welfare: 30 } : { military: 70, order: 60, authority: 50 };
    const pool = [];
    for (let i = 0; i < 7; i++) pool.push(makeNotable(state, nation, rng, people, { base: lean, sd: 30 }));
    leader = pool[0];
  } else if (!gov.multiParty) {
    const party = createParty(state, nation, { name: partyName(rng, "authority"), color, positions: jitterPositions(rng, STATE_PARTY.positions, 5) });
    const members = [];
    for (let i = 0; i < 7; i++) {
      members.push(makeNotable(state, nation, rng, people, { base: party.positions, sd: 22, partyId: party.id, targets: rng.shuffle(STATE_PARTY.targets).slice(0, 1), loyalty: rng.int(55, 95) }));
    }
    leader = members[0];
    leader.popularity = Math.max(leader.popularity, 60);
    nation.heirId = members[1].id;
  } else {
    const n = gov.id === "parliament" ? 4 : 3;
    const archetypes = rng.shuffle(PARTY_ARCHETYPES).slice(0, n);
    const usedPartyColors = new Set();
    const leaders = [];
    for (const arch of archetypes) {
      const positions = jitterPositions(rng, arch.positions, 8);
      const pColor = COLORS.find((c) => !usedPartyColors.has(c) && c !== "§7");
      usedPartyColors.add(pColor);
      const party = createParty(state, nation, { name: partyName(rng, topIssues(positions, 1)[0]), color: pColor, positions });
      const chief = makeNotable(state, nation, rng, people, { base: positions, sd: 14, partyId: party.id, targets: rng.shuffle(arch.targets).slice(0, 2) });
      const mate = makeNotable(state, nation, rng, people, { base: positions, sd: 18, partyId: party.id, targets: arch.targets.slice(0, 1) });
      chief.runningMateId = gov.runningMate ? mate.id : null;
      makeNotable(state, nation, rng, people, { base: positions, sd: 20, partyId: party.id });
      leaders.push(chief);
    }
    // a couple of independents
    for (let i = 0; i < 2; i++) makeNotable(state, nation, rng, people, { sd: 40 });
    // Regional party leanings from how well each region's voters match each party.
    for (const region of nation.regions) {
      for (const party of nation.parties) region.lean[party.id] = Math.round(rng.normal(0, 0.25) * 100) / 100;
    }
    leader = leaders[0];
  }

  installLeader(state, nation, leader.id, rng.int(1, 1e9), {
    runningMateId: gov.runningMate ? leader.runningMateId : null,
  });
  nation.leaderTerms = 1;
  return nation;
}
