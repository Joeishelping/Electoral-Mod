// Government styles. These only decide HOW a vote works (who votes, how it is
// counted, how honest the count is). What happens after the vote is up to the
// roleplayers running the nation.

export const METHODS = {
  electoral: { name: "Regional Electors", desc: "Each region gives all its voting power to its winner. Most electors wins." },
  plurality: { name: "Popular Vote", desc: "Most votes nationwide wins." },
  runoff: { name: "Two-Round Runoff", desc: "If nobody gets over 50%, the top two face a second round." },
  ranked: { name: "Ranked Choice", desc: "Last place drops out and their voters move to their next choice, until someone has 50%." },
  proportional: { name: "Proportional Seats", desc: "Seats are split by party vote; parties form a majority coalition." },
};

const W = { policy: 1, valence: 1, retro: 1, group: 1, party: 1, competence: 1, money: 0.5, kin: 0 };

export const GOVERNMENTS = [
  {
    id: "democracy", name: "Democracy", leaderTitle: "President",
    description: "Everyone votes. Regions award electors to their winner.",
    selection: "popular", method: "electoral", methods: ["electoral", "plurality", "runoff", "ranked"],
    multiParty: true, integrity: 1, compulsory: 0, protection: 0, electorate: null, wealthWeighted: false, consensus: 0.5,
    weights: { ...W },
  },
  {
    id: "parliament", name: "Parliament", leaderTitle: "Premier",
    description: "Everyone votes for parties. Seats are shared out and a coalition picks the Premier.",
    selection: "popular", method: "proportional", methods: ["proportional"],
    multiParty: true, integrity: 1, compulsory: 0, protection: 0, electorate: null, wealthWeighted: false, consensus: 0.5, threshold: 0.05,
    weights: { ...W, party: 1.3 },
  },
  {
    id: "singleparty", name: "Single-Party State", leaderTitle: "Chairman",
    description: "Turnout is enforced and the count is managed for the endorsed candidate. The leader is hard to beat.",
    selection: "popular", method: "plurality", methods: ["plurality", "runoff"],
    multiParty: false, integrity: 0.35, compulsory: 0.93, protection: 0.85, electorate: null, wealthWeighted: false, consensus: 0.5,
    weights: { ...W, policy: 0.6, retro: 0.7, party: 0 },
  },
  {
    id: "monarchy", name: "Royal Council", leaderTitle: "Monarch",
    description: "Nobles and elders of each region vote in rounds until 60% agree. Family ties to a region count.",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, integrity: 1, compulsory: 0, protection: 0.7, electorate: { nobility: 1, elders: 0.5, clergy: 0.3 }, wealthWeighted: true, consensus: 0.6,
    weights: { ...W, kin: 1.2, retro: 0.6 },
  },
  {
    id: "clan", name: "Clan Council", leaderTitle: "High Chieftain",
    description: "Each region's clan votes as a group. Rounds continue until two-thirds agree. Clans favor their own.",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, integrity: 1, compulsory: 0, protection: 0.5, electorate: null, wealthWeighted: false, consensus: 0.66,
    weights: { ...W, kin: 2, competence: 1.2 },
  },
  {
    id: "theocracy", name: "Sacred Conclave", leaderTitle: "High Prophet",
    description: "The faithful of each region send electors, who vote in rounds until two-thirds agree.",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, integrity: 1, compulsory: 0, protection: 0.75, electorate: { clergy: 1, elders: 0.25 }, wealthWeighted: false, consensus: 0.66,
    weights: { ...W, policy: 1.3, money: 0 },
  },
  {
    id: "junta", name: "Military Junta", leaderTitle: "Marshal",
    description: "Garrison officers vote. Competence matters more than charm.",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, integrity: 1, compulsory: 0, protection: 0.6, electorate: { soldiers: 1, frontier: 0.15 }, wealthWeighted: false, consensus: 0.5,
    weights: { ...W, competence: 1.8, valence: 0.7, retro: 1.2 },
  },
  {
    id: "guild", name: "Guild Oligarchy", leaderTitle: "Grand Magistrate",
    description: "Only merchants, artisans and landholders vote, weighted by their region's wealth. Money talks.",
    selection: "popular", method: "ranked", methods: ["ranked", "plurality", "electoral"],
    multiParty: true, integrity: 0.9, compulsory: 0, protection: 0.2, electorate: { merchants: 1, artisans: 0.8, nobility: 0.7, sailors: 0.4 }, wealthWeighted: true, consensus: 0.5,
    weights: { ...W, money: 2.2 },
  },
  {
    id: "technocracy", name: "Technocracy", leaderTitle: "Director",
    description: "Educated voters rank the candidates. Competence beats charm.",
    selection: "popular", method: "ranked", methods: ["ranked", "runoff", "plurality"],
    multiParty: true, integrity: 1, compulsory: 0, protection: 0.3, electorate: { scholars: 1, artisans: 0.5, merchants: 0.35, elders: 0.2 }, wealthWeighted: false, consensus: 0.5,
    weights: { ...W, competence: 2.5, valence: 0.6 },
  },
  {
    id: "commune", name: "Commune", leaderTitle: "Speaker",
    description: "Everyone ranks the candidates directly. Courting groups matters most.",
    selection: "popular", method: "ranked", methods: ["ranked", "runoff", "plurality"],
    multiParty: true, integrity: 1, compulsory: 0, protection: 0, electorate: null, wealthWeighted: false, consensus: 0.5,
    weights: { ...W, group: 1.3, party: 0.6 },
  },
];

export const GOV_BY_ID = Object.fromEntries(GOVERNMENTS.map((g) => [g.id, g]));

export const OVERRIDABLE = ["method", "integrity", "compulsory", "protection", "consensus", "threshold"];

export function effectiveGov(nation) {
  const base = GOV_BY_ID[nation.gov] || GOV_BY_ID.democracy;
  const s = nation.settings || {};
  const gov = { ...base, weights: { ...base.weights } };
  for (const key of OVERRIDABLE) if (s[key] !== undefined && s[key] !== null) gov[key] = s[key];
  if (!gov.methods.includes(gov.method)) gov.methods = [gov.method, ...gov.methods];
  gov.threshold = gov.threshold ?? 0.05;
  gov.ballotWeight = s.ballotWeight ?? 25;
  gov.revealSeconds = s.revealSeconds ?? 8;
  return gov;
}
