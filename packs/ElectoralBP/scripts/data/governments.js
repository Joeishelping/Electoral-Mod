// Government profiles. The election engine is generic; a profile decides who votes,
// how ballots are counted, how honest the count is, how the cabinet is chosen and
// how power passes on. Every field can be overridden per nation (nation.settings).

export const OFFICES = [
  { id: "treasury", name: "Treasury", issues: ["economy", "trade"] },
  { id: "defense", name: "Defense", issues: ["military", "expansion"] },
  { id: "foreign", name: "Foreign Affairs", issues: ["trade", "military", "expansion"] },
  { id: "justice", name: "Justice", issues: ["order"] },
  { id: "interior", name: "the Interior", issues: ["authority", "settlers"] },
  { id: "labor", name: "Labor", issues: ["labor", "welfare"] },
  { id: "agriculture", name: "Agriculture", issues: ["environment", "trade"] },
  { id: "works", name: "Public Works", issues: ["infrastructure"] },
  { id: "welfare", name: "Welfare", issues: ["welfare"] },
  { id: "faith", name: "Faith & Culture", issues: ["tradition"] },
];
export const OFFICE_BY_ID = Object.fromEntries(OFFICES.map((o) => [o.id, o]));

export const METHODS = {
  electoral: { name: "Regional Electors", desc: "Each region awards its voting power to its winner; a majority of electors wins." },
  plurality: { name: "Popular Vote", desc: "Most votes nationwide wins." },
  runoff: { name: "Two-Round Runoff", desc: "If nobody passes 50%, the top two face a second round." },
  ranked: { name: "Ranked Choice", desc: "Last place is eliminated and their voters' next choices transfer until someone passes 50%." },
  proportional: { name: "Proportional Seats", desc: "Each region's seats are split by party vote; parties then form a governing coalition." },
};

export const SUCCESSION_LAWS = {
  primogeniture: "Eldest child's line first",
  seniority: "Eldest living member of the bloodline",
  elective: "Clan consensus among eligible bloodline members",
  designated: "Ruler names an heir",
};

export const CABINET_STYLES = {
  merit: "Merit (competence & expertise)",
  loyalty: "Loyalty (trusted allies)",
  coalition: "Coalition (seats shared by party strength)",
  family: "Family (kin & clan first)",
  patronage: "Patronage (wealthy backers)",
};

const BASE_WEIGHTS = { policy: 1, valence: 1, retro: 1, group: 1, party: 1, competence: 1, money: 0.5, kin: 0, legitimacy: 0 };

export const GOVERNMENTS = [
  {
    id: "democracy",
    name: "Democracy",
    description: "Competing parties and candidates, regional electors, a cabinet chosen on merit and a clear line of succession.",
    leaderTitle: "President", deputyTitle: "Vice President", officePrefix: "Secretary of", assemblyName: "Congress",
    selection: "popular", method: "electoral", methods: ["electoral", "plurality", "runoff", "ranked"],
    multiParty: true, vetting: false, integrity: 1, compulsory: 0, protection: 0,
    succession: "line", cabinetStyle: "merit", runningMate: true, termLimit: 2,
    electorate: null, wealthWeighted: false, consensus: 0.5,
    offices: ["treasury", "defense", "foreign", "justice", "interior", "labor", "agriculture", "works"],
    weights: { ...BASE_WEIGHTS },
  },
  {
    id: "parliament",
    name: "Parliamentary Assembly",
    description: "Regions fill assembly seats proportionally; parties bargain into a coalition that names the Premier and splits the ministries.",
    leaderTitle: "Premier", deputyTitle: "Deputy Premier", officePrefix: "Minister of", assemblyName: "Assembly",
    selection: "popular", method: "proportional", methods: ["proportional"],
    multiParty: true, vetting: false, integrity: 1, compulsory: 0, protection: 0.1,
    succession: "party", cabinetStyle: "coalition", runningMate: false, termLimit: 0,
    electorate: null, wealthWeighted: false, consensus: 0.5, threshold: 0.05,
    offices: ["treasury", "defense", "foreign", "justice", "interior", "labor", "welfare", "works", "agriculture"],
    weights: { ...BASE_WEIGHTS, party: 1.3 },
  },
  {
    id: "singleparty",
    name: "Single-Party State",
    description: "Only vetted party candidates run. Turnout is enforced, counts are 'managed', and the Chairman is shielded unless true support collapses.",
    leaderTitle: "Chairman", deputyTitle: "First Secretary", officePrefix: "Commissioner of", assemblyName: "People's Congress",
    selection: "popular", method: "plurality", methods: ["plurality", "runoff"],
    multiParty: false, vetting: true, integrity: 0.35, compulsory: 0.93, protection: 0.85,
    succession: "designated", cabinetStyle: "loyalty", runningMate: false, termLimit: 0,
    electorate: null, wealthWeighted: false, consensus: 0.5,
    offices: ["treasury", "defense", "foreign", "justice", "interior", "labor", "works"],
    weights: { ...BASE_WEIGHTS, policy: 0.6, retro: 0.7, party: 0 },
  },
  {
    id: "monarchy",
    name: "Hereditary Monarchy",
    description: "The crown passes down the bloodline. The great houses must confirm an heir; a weak claim can spark a contested succession.",
    leaderTitle: "Monarch", deputyTitle: "Regent", officePrefix: "Royal Steward of", assemblyName: "Council of Houses",
    selection: "hereditary", method: "plurality", methods: ["plurality"],
    multiParty: false, vetting: false, integrity: 1, compulsory: 0, protection: 0.7,
    succession: "bloodline", successionLaw: "primogeniture", confirmation: true, cabinetStyle: "family", runningMate: false, termLimit: 0,
    electorate: null, wealthWeighted: false, consensus: 0.6,
    offices: ["treasury", "defense", "foreign", "justice", "faith", "agriculture"],
    weights: { ...BASE_WEIGHTS, kin: 1.2, legitimacy: 1.3, retro: 0.6 },
  },
  {
    id: "clan",
    name: "Clan Confederacy",
    description: "Power stays within the ruling bloodline, but the clan heads choose which family member leads by consensus.",
    leaderTitle: "High Chieftain", deputyTitle: "Second Chief", officePrefix: "Elder of", assemblyName: "Clan Moot",
    selection: "hereditary", method: "plurality", methods: ["plurality"],
    multiParty: false, vetting: false, integrity: 1, compulsory: 0, protection: 0.5,
    succession: "bloodline", successionLaw: "elective", confirmation: false, cabinetStyle: "family", runningMate: false, termLimit: 0,
    electorate: null, wealthWeighted: false, consensus: 0.66,
    offices: ["defense", "agriculture", "justice", "foreign", "faith"],
    weights: { ...BASE_WEIGHTS, kin: 1.6, legitimacy: 0.8, competence: 1.2 },
  },
  {
    id: "theocracy",
    name: "Sacred Conclave",
    description: "The faithful of each region send electors who ballot in rounds until one candidate holds a two-thirds supermajority.",
    leaderTitle: "High Prophet", deputyTitle: "First Prelate", officePrefix: "Keeper of", assemblyName: "Conclave",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, vetting: true, integrity: 1, compulsory: 0, protection: 0.75,
    succession: "council", cabinetStyle: "loyalty", runningMate: false, termLimit: 0,
    electorate: { clergy: 1, elders: 0.25 }, wealthWeighted: false, consensus: 0.66,
    offices: ["faith", "justice", "welfare", "treasury", "defense", "agriculture"],
    weights: { ...BASE_WEIGHTS, policy: 1.3, money: 0 },
  },
  {
    id: "junta",
    name: "Military Junta",
    description: "Garrison officers choose the Marshal. Competence and the loyalty of the troops matter more than popularity.",
    leaderTitle: "Marshal", deputyTitle: "Vice Marshal", officePrefix: "Commander of", assemblyName: "Officers' Council",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, vetting: true, integrity: 1, compulsory: 0, protection: 0.6,
    succession: "council", cabinetStyle: "loyalty", runningMate: false, termLimit: 0,
    electorate: { soldiers: 1, frontier: 0.15 }, wealthWeighted: false, consensus: 0.5,
    offices: ["defense", "interior", "justice", "foreign", "treasury", "works"],
    weights: { ...BASE_WEIGHTS, competence: 1.8, valence: 0.7, retro: 1.2 },
  },
  {
    id: "guild",
    name: "Guild Oligarchy",
    description: "Only stakeholders vote, weighted by the wealth of their region. Campaign funds and trade policy dominate.",
    leaderTitle: "Grand Magistrate", deputyTitle: "Treasurer-General", officePrefix: "Guildmaster of", assemblyName: "Guild Senate",
    selection: "popular", method: "ranked", methods: ["ranked", "plurality", "electoral"],
    multiParty: true, vetting: false, integrity: 0.9, compulsory: 0, protection: 0.2,
    succession: "line", cabinetStyle: "patronage", runningMate: false, termLimit: 0,
    electorate: { merchants: 1, artisans: 0.8, nobility: 0.7, sailors: 0.4 }, wealthWeighted: true, consensus: 0.5,
    offices: ["treasury", "foreign", "works", "labor", "defense", "justice"],
    weights: { ...BASE_WEIGHTS, money: 2.2 },
  },
  {
    id: "technocracy",
    name: "Technocracy",
    description: "Educated stakeholders rank candidates; competence outweighs charm and the cabinet is staffed strictly on merit.",
    leaderTitle: "Director", deputyTitle: "Deputy Director", officePrefix: "Director of", assemblyName: "Directorate",
    selection: "popular", method: "ranked", methods: ["ranked", "runoff", "plurality"],
    multiParty: true, vetting: false, integrity: 1, compulsory: 0, protection: 0.3,
    succession: "line", cabinetStyle: "merit", runningMate: false, termLimit: 0,
    electorate: { scholars: 1, artisans: 0.5, merchants: 0.35, elders: 0.2 }, wealthWeighted: false, consensus: 0.5,
    offices: ["treasury", "works", "welfare", "agriculture", "defense", "foreign", "justice"],
    weights: { ...BASE_WEIGHTS, competence: 2.5, valence: 0.6 },
  },
  {
    id: "commune",
    name: "Commune",
    description: "Every resident ranks candidates directly. No electors, no parties required, and a Speaker who serves short terms.",
    leaderTitle: "Speaker", deputyTitle: "Deputy Speaker", officePrefix: "Delegate for", assemblyName: "Commune Assembly",
    selection: "popular", method: "ranked", methods: ["ranked", "runoff", "plurality"],
    multiParty: true, vetting: false, integrity: 1, compulsory: 0, protection: 0,
    succession: "line", cabinetStyle: "merit", runningMate: false, termLimit: 3,
    electorate: null, wealthWeighted: false, consensus: 0.5,
    offices: ["labor", "welfare", "works", "agriculture", "justice"],
    weights: { ...BASE_WEIGHTS, group: 1.3, party: 0.6 },
  },
];

export const GOV_BY_ID = Object.fromEntries(GOVERNMENTS.map((g) => [g.id, g]));

// Settings a nation may override on top of its profile.
export const OVERRIDABLE = [
  "method", "integrity", "compulsory", "protection", "successionLaw", "confirmation",
  "consensus", "cabinetStyle", "termLimit", "threshold", "runningMate",
];

export function effectiveGov(nation) {
  const base = GOV_BY_ID[nation.gov] || GOV_BY_ID.democracy;
  const s = nation.settings || {};
  const gov = { ...base, weights: { ...base.weights } };
  for (const key of OVERRIDABLE) if (s[key] !== undefined && s[key] !== null) gov[key] = s[key];
  gov.ballotWeight = s.ballotWeight ?? 25;
  gov.autoFill = s.autoFill ?? true;
  gov.threshold = gov.threshold ?? 0.05;
  gov.successionLaw = gov.successionLaw ?? "primogeniture";
  if (gov.method === "proportional") gov.cabinetStyle = s.cabinetStyle ?? "coalition";
  return gov;
}

export function officeTitle(gov, officeId) {
  const office = OFFICE_BY_ID[officeId];
  return office ? `${gov.officePrefix} ${office.name}` : officeId;
}
