// World state model. Pure data + helpers, no Minecraft imports (testable in Node).

import { blankPositions, ISSUE_IDS } from "../data/issues.js";
import { defaultMetrics } from "../data/metrics.js";
import { BLOC_IDS } from "../data/blocs.js";
import { clamp } from "./random.js";

export const STATE_VERSION = 1;
export const ADULT_AGE = 16;
export const HISTORY_LIMIT = 8;

export function newState() {
  return { v: STATE_VERSION, seq: 1, nations: {}, persons: {}, houses: {}, relations: {}, residents: {} };
}

export function nextId(state, prefix) {
  const id = `${prefix}${(state.seq++).toString(36)}`;
  return id;
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
    leaderId: null,
    deputyId: null,
    cabinet: {},
    cabinetPins: {},
    heirId: null,
    dynasty: "",
    leaderTerms: 0,
    election: null,
    history: [],
    electionCount: 0,
    approval: null,
    log: [],
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
    name: data.name || `Party ${nation.parties.length + 1}`,
    color: data.color || "§7",
    positions: data.positions || blankPositions(0),
  };
  nation.parties.push(party);
  return party;
}

export function createPerson(state, nation, data = {}) {
  const person = {
    id: nextId(state, "c"),
    nationId: nation.id,
    name: data.name || "Unnamed",
    player: data.player || "",
    partyId: data.partyId ?? null,
    positions: data.positions || blankPositions(0),
    focus: data.focus || [],
    targets: data.targets || [],
    charisma: data.charisma ?? 50,
    popularity: data.popularity ?? 50,
    competence: data.competence ?? 50,
    integrity: data.integrity ?? 60,
    loyalty: data.loyalty ?? 60,
    funds: data.funds ?? 40,
    homeRegion: data.homeRegion ?? null,
    campaignRegions: data.campaignRegions || [],
    runningMateId: data.runningMateId ?? null,
    age: data.age ?? 40,
    alive: data.alive ?? true,
    dynasty: data.dynasty || "",
    parentId: data.parentId ?? null,
    legitimacy: data.legitimacy ?? 80,
    clanId: data.clanId ?? null,
    terms: 0,
    approved: data.approved ?? true,
  };
  state.persons[person.id] = person;
  return person;
}

export function createHouse(state, nation, data = {}) {
  const house = {
    id: nextId(state, "h"),
    nationId: nation.id,
    name: data.name || "New House",
    regionId: data.regionId ?? null,
    influence: data.influence ?? 50,
    loyalty: data.loyalty ?? 60,
    positions: data.positions ?? null,
    opinions: data.opinions || {},
  };
  state.houses[house.id] = house;
  return house;
}

// ---------- queries ----------

export const nationPersons = (state, nation, includeDead = false) =>
  Object.values(state.persons).filter((p) => p.nationId === nation.id && (includeDead || p.alive));

export const nationHouses = (state, nation) => Object.values(state.houses).filter((h) => h.nationId === nation.id);

export const getPerson = (state, id) => (id ? state.persons[id] || null : null);
export const getParty = (nation, id) => nation.parties.find((p) => p.id === id) || null;
export const getRegion = (nation, id) => nation.regions.find((r) => r.id === id) || null;

export function personLabel(state, nation, personOrId) {
  const p = typeof personOrId === "string" ? getPerson(state, personOrId) : personOrId;
  if (!p) return "§7(vacant)";
  const party = getParty(nation, p.partyId);
  const color = party ? party.color : "§f";
  const tag = party ? ` §7(${party.name})` : "";
  return `${color}${p.name}§r${tag}`;
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
  for (const [id, h] of Object.entries(state.houses)) if (h.nationId === nationId) delete state.houses[id];
  for (const key of Object.keys(state.relations)) if (key.split("|").includes(nationId)) delete state.relations[key];
  for (const [name, r] of Object.entries(state.residents)) if (r.nationId === nationId) delete state.residents[name];
}

export function deletePerson(state, personId) {
  const person = state.persons[personId];
  if (!person) return;
  const nation = state.nations[person.nationId];
  delete state.persons[personId];
  for (const p of Object.values(state.persons)) {
    if (p.runningMateId === personId) p.runningMateId = null;
    if (p.parentId === personId) p.parentId = null;
  }
  if (!nation) return;
  if (nation.leaderId === personId) nation.leaderId = null;
  if (nation.deputyId === personId) nation.deputyId = null;
  if (nation.heirId === personId) nation.heirId = null;
  for (const [office, id] of Object.entries(nation.cabinet)) if (id === personId) delete nation.cabinet[office];
  for (const [office, id] of Object.entries(nation.cabinetPins)) if (id === personId) delete nation.cabinetPins[office];
  if (nation.election) nation.election.candidates = nation.election.candidates.filter((id) => id !== personId);
}

export function addLog(nation, text) {
  nation.log.unshift(text);
  if (nation.log.length > 20) nation.log.length = 20;
}

// Repairs / fills fields so older or hand-edited saves keep working.
export function normalizeState(state) {
  if (!state || typeof state !== "object") return newState();
  state.v = STATE_VERSION;
  state.seq = state.seq || 1;
  for (const key of ["nations", "persons", "houses", "relations", "residents"]) state[key] = state[key] || {};
  for (const nation of Object.values(state.nations)) {
    nation.metrics = { ...defaultMetrics(), ...(nation.metrics || {}) };
    for (const k of ["settings", "salience", "cabinet", "cabinetPins"]) nation[k] = nation[k] || {};
    for (const k of ["regions", "parties", "history", "log"]) nation[k] = nation[k] || [];
    for (const region of nation.regions) {
      region.issueMods = region.issueMods || {};
      region.lean = region.lean || {};
      region.memory = region.memory || {};
      region.unrest = clamp(region.unrest || 0, 0, 100);
    }
  }
  for (const person of Object.values(state.persons)) {
    person.positions = { ...blankPositions(0), ...(person.positions || {}) };
    for (const id of ISSUE_IDS) person.positions[id] = clamp(Number(person.positions[id]) || 0, -100, 100);
    person.focus = person.focus || [];
    person.targets = person.targets || [];
    person.campaignRegions = person.campaignRegions || [];
  }
  return state;
}
