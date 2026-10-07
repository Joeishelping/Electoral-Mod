// World state model. Pure data + helpers, no Minecraft imports (testable in Node).

import { blankPositions, ISSUE_IDS } from "../data/issues.js";
import { defaultMetrics } from "../data/metrics.js";
import { BLOC_IDS } from "../data/blocs.js";
import { clamp } from "./random.js";

export const STATE_VERSION = 2;
export const HISTORY_LIMIT = 10;

export function newState() {
  return { v: STATE_VERSION, seq: 1, nations: {}, persons: {}, relations: {}, residents: {} };
}

export function nextId(state, prefix) {
  return `${prefix}${(state.seq++).toString(36)}`;
}

export function createNation(state, { name, gov = "democracy", color = "§9" }) {
  const nation = {
    id: nextId(state, "n"),
    name,
    color,
    gov,
    settings: {},
    regions: [],
    parties: [],
    metrics: defaultMetrics(),
    salience: {},
    leaderId: null, // the candidate currently in office (for performance voting)
    leaderTerms: 0,
    election: null, // open election, taking ballots
    count: null, // live count in progress
    history: [],
    electionCount: 0,
    approval: null,
  };
  state.nations[nation.id] = nation;
  return nation;
}

export function createRegion(state, nation, data = {}) {
  const region = {
    id: nextId(state, "r"),
    name: data.name || `Region ${nation.regions.length + 1}`,
    template: data.template || "custom",
    population: data.population ?? 3000,
    power: data.power ?? 3,
    autoPower: data.autoPower ?? true,
    blocs: data.blocs || { farmers: 40, laborers: 20, merchants: 15, elders: 15, youth: 10 },
    wealth: data.wealth ?? 50,
    urban: data.urban ?? 0.4,
    issueMods: data.issueMods || {},
    lean: data.lean || {},
    favor: data.favor ?? 0,
    memory: {},
    unrest: 0,
  };
  nation.regions.push(region);
  return region;
}

export function createParty(state, nation, data = {}) {
  const party = {
    id: nextId(state, "p"),
    name: data.name || "",
    color: data.color || "§7",
    positions: { ...blankPositions(0), ...(data.positions || {}) },
  };
  nation.parties.push(party);
  return party;
}

// Candidates. Names start empty: roleplayers name their own people.
export function createPerson(state, nation, data = {}) {
  const person = {
    id: nextId(state, "c"),
    nationId: nation.id,
    name: data.name ?? "",
    partyId: data.partyId ?? null,
    positions: { ...blankPositions(0), ...(data.positions || {}) },
    focus: data.focus || [],
    targets: data.targets || [],
    charisma: data.charisma ?? 50,
    popularity: data.popularity ?? 50,
    competence: data.competence ?? 50,
    integrity: data.integrity ?? 50,
    funds: data.funds ?? 50,
    homeRegion: data.homeRegion ?? null,
    campaignRegions: data.campaignRegions || [],
    terms: 0,
  };
  state.persons[person.id] = person;
  return person;
}

// ---------- queries ----------

export const nationPersons = (state, nation) => Object.values(state.persons).filter((p) => p.nationId === nation.id);
export const getPerson = (state, id) => (id ? state.persons[id] || null : null);
export const getParty = (nation, id) => nation.parties.find((p) => p.id === id) || null;
export const getRegion = (nation, id) => nation.regions.find((r) => r.id === id) || null;

export function displayName(p) {
  return p && p.name ? p.name : "§7(unnamed)";
}

export function personLabel(state, nation, personOrId) {
  const p = typeof personOrId === "string" ? getPerson(state, personOrId) : personOrId;
  if (!p) return "§7(nobody)";
  const party = getParty(nation, p.partyId);
  return `${party ? party.color : "§f"}${displayName(p)}§r${party ? ` §7(${party.name})` : ""}`;
}

export function regionBlocShares(region) {
  const total = BLOC_IDS.reduce((s, id) => s + Math.max(0, region.blocs[id] || 0), 0) || 1;
  const out = {};
  for (const id of BLOC_IDS) {
    const v = Math.max(0, region.blocs[id] || 0);
    if (v > 0) out[id] = v / total;
  }
  return out;
}

export function relationKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function deleteNation(state, nationId) {
  delete state.nations[nationId];
  for (const [id, p] of Object.entries(state.persons)) if (p.nationId === nationId) delete state.persons[id];
  for (const key of Object.keys(state.relations)) if (key.split("|").includes(nationId)) delete state.relations[key];
  for (const [name, r] of Object.entries(state.residents)) if (r.nationId === nationId) delete state.residents[name];
}

export function deletePerson(state, personId) {
  const person = state.persons[personId];
  if (!person) return;
  const nation = state.nations[person.nationId];
  delete state.persons[personId];
  if (!nation) return;
  if (nation.leaderId === personId) nation.leaderId = null;
  if (nation.election) {
    nation.election.candidates = nation.election.candidates.filter((id) => id !== personId);
    for (const [p, b] of Object.entries(nation.election.ballots)) if (b.candidateId === personId) delete nation.election.ballots[p];
  }
}

// Repairs / fills fields so older or hand-edited saves keep working.
export function normalizeState(state) {
  if (!state || typeof state !== "object") return newState();
  state.v = STATE_VERSION;
  state.seq = state.seq || 1;
  for (const key of ["nations", "persons", "relations", "residents"]) state[key] = state[key] || {};
  delete state.houses;
  for (const nation of Object.values(state.nations)) {
    nation.metrics = { ...defaultMetrics(), ...(nation.metrics || {}) };
    for (const k of Object.keys(nation.metrics)) if (!(k in defaultMetrics())) delete nation.metrics[k];
    for (const k of ["settings", "salience"]) nation[k] = nation[k] || {};
    for (const k of ["regions", "parties", "history"]) nation[k] = nation[k] || [];
    nation.count = nation.count || null;
    for (const k of ["cabinet", "cabinetPins", "deputyId", "heirId", "dynasty", "log"]) delete nation[k];
    for (const region of nation.regions) {
      region.issueMods = region.issueMods || {};
      region.lean = region.lean || {};
      region.memory = region.memory || {};
      region.unrest = clamp(region.unrest || 0, 0, 100);
    }
  }
  for (const person of Object.values(state.persons)) {
    person.name = person.name ?? "";
    person.positions = { ...blankPositions(0), ...(person.positions || {}) };
    for (const id of ISSUE_IDS) person.positions[id] = clamp(Number(person.positions[id]) || 0, -100, 100);
    person.focus = person.focus || [];
    person.targets = person.targets || [];
    person.campaignRegions = person.campaignRegions || [];
  }
  return state;
}
