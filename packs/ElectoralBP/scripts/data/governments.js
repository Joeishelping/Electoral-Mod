// Government types. Each one votes differently AND plays out differently on
// election night (see engine/night.js). What happens after the vote is up to
// the roleplayers running the nation.
//
//   night: "count"   counties report partial results live (Democracy, Guild)
//          "seats"   counties fill assembly seats, then coalition talks (Parliament)
//          "bulletin" official bulletins arrive fast; the true count is hidden (Single-Party)
//          "council" electors declare one by one over ballot rounds (Royal, Clan, Conclave, Junta)

export const METHODS = {
  electoral: { name: "Regional Electors", desc: "Each county gives all its electors to its winner. A majority of electors wins." },
  plurality: { name: "Popular Vote", desc: "Most votes nationwide wins." },
  runoff: { name: "Two-Round Runoff", desc: "If nobody gets over 50%, the top two go to a second round." },
  ranked: { name: "Ranked Choice", desc: "Last place drops out and their voters move to their next choice until someone has 50%." },
  proportional: { name: "Proportional Seats", desc: "Each county's seats are split by party vote; parties form a majority coalition." },
};

const W = { policy: 1, valence: 1, retro: 1, group: 1, party: 1, competence: 1, money: 0.5, kin: 0, integrity: 1 };

export const GOVERNMENTS = [
  {
    id: "democracy", name: "Democracy", leaderTitle: "President", night: "count",
    tagline: "Counties award electors. Results come in live, races get called, close counties get recounted.",
    selection: "popular", method: "electoral", methods: ["electoral", "plurality", "runoff", "ranked"],
    multiParty: true, integrity: 1, compulsory: 0, protection: 0, electorate: null, wealthWeighted: false,
    weights: { ...W },
    words: { report: "counted", unit: "votes", county: "County", counties: "counties" },
  },
  {
    id: "parliament", name: "Parliament", leaderTitle: "Premier", night: "seats",
    tagline: "Counties fill assembly seats by party vote. Then the parties bargain live until a government forms - or doesn't.",
    selection: "popular", method: "proportional", methods: ["proportional"],
    multiParty: true, integrity: 1, compulsory: 0, protection: 0, electorate: null, wealthWeighted: false, threshold: 0.05,
    weights: { ...W, party: 1.4 },
    words: { report: "counted", unit: "votes", county: "Constituency", counties: "constituencies" },
  },
  {
    id: "singleparty", name: "Single-Party State", leaderTitle: "Chairman", night: "bulletin",
    tagline: "Turnout is enforced and bulletins arrive suspiciously fast. The true count is secret, crowds may protest, and the Party can step in.",
    selection: "popular", method: "plurality", methods: ["plurality"],
    multiParty: false, integrity: 0.35, compulsory: 0.96, protection: 0.85, electorate: null, wealthWeighted: false,
    weights: { ...W, policy: 0.6, retro: 0.8, party: 0 },
    words: { report: "reported", unit: "votes", county: "District", counties: "districts" },
  },
  {
    id: "monarchy", name: "Royal Council", leaderTitle: "Monarch", night: "council",
    tagline: "The noble house of each county swears fealty in rounds until 60% agree. Gold buys loyalty and blood ties matter.",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, integrity: 1, compulsory: 0, protection: 0.7, electorate: { wealthy: 1, retirees: 0.4, religious: 0.3 }, wealthWeighted: true, consensus: 0.6,
    weights: { ...W, kin: 1.4, retro: 0.5, money: 1.2 },
    council: { elector: (r, k) => (k ? `The ${["Baron", "Count", "Duke"][k - 1]} of ${r}` : `House of ${r}`), seats: 3, verb: "swears fealty to", bribery: true, maxRounds: 7, minRounds: 2,
      flavor: ["Envoys whisper in the palace corridors...", "{a} hosts a lavish feast for the undecided houses.", "Old grudges between the houses resurface.", "{a}'s claim is questioned in the great hall.", "Servants carry sealed letters between the houses."] },
  },
  {
    id: "clan", name: "Clan Council", leaderTitle: "High Chieftain", night: "council",
    tagline: "Every county's clan raises its banner. Two-thirds must agree, clans back their own, and slighted clans walk out.",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, integrity: 1, compulsory: 0, protection: 0.5, electorate: null, wealthWeighted: false, consensus: 0.66,
    weights: { ...W, kin: 2.2, competence: 1.2 },
    council: { elector: (r, k) => (k ? `${r} Elder ${["I", "II", "III"][k - 1]}` : `Clan of ${r}`), seats: 3, verb: "raises its banner for", walkouts: true, maxRounds: 8,
      flavor: ["The elders tell stories of the old chieftains.", "{a} challenges {b} to prove their strength.", "Drums beat as the clans argue late into the night.", "{a} reminds the council of an old debt.", "A shaman reads the signs in the fire."] },
  },
  {
    id: "theocracy", name: "Sacred Conclave", leaderTitle: "High Prophet", night: "council",
    tagline: "Religious electors ballot in silence. Dark smoke means no choice; bright fire means a Prophet. Piety outweighs charm.",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, integrity: 1, compulsory: 0, protection: 0.75, electorate: { religious: 1, retirees: 0.25 }, wealthWeighted: false, consensus: 0.66,
    weights: { ...W, policy: 1.3, money: 0, integrity: 2.2, valence: 0.6 },
    council: { elector: (r, k) => `Elector of ${r}${k ? ` ${["I", "II", "III", "IV"][k]}` : ""}`, seats: 3, verb: "writes the name of", secret: true, relaxAfter: 5, maxRounds: 9, minRounds: 3,
      flavor: ["The electors fast and pray.", "A sermon by {a} moves several electors.", "Crowds keep vigil outside, watching the chimney.", "The electors walk the cloisters in silence.", "Old scriptures are read aloud between ballots."] },
  },
  {
    id: "junta", name: "Military Junta", leaderTitle: "Marshal", night: "council",
    tagline: "Garrison commanders pick the Marshal. Competence and security rule - and a sore loser may attempt a coup.",
    selection: "council", method: "plurality", methods: ["plurality"],
    multiParty: false, integrity: 1, compulsory: 0, protection: 0.6, electorate: { military: 1, patriots: 0.3, gunowners: 0.15 }, wealthWeighted: false, consensus: 0.5,
    weights: { ...W, competence: 2, valence: 0.6, retro: 1.3 },
    council: { elector: (r, k) => (k ? `${r} ${["Cavalry", "Artillery", "Fleet"][k - 1]}` : `${r} Garrison`), seats: 3, verb: "pledges its troops to", coup: true, maxRounds: 6, minRounds: 2,
      flavor: ["{a} briefs the officers on the border situation.", "{b}'s staff officers lobby the undecided commanders.", "Cavalry units are seen moving near the capital.", "The officers argue over the last campaign.", "{a} promises promotions to loyal commanders."] },
  },
  {
    id: "guild", name: "Guild Oligarchy", leaderTitle: "Grand Magistrate", night: "count",
    tagline: "Only the Business Lobby, merchants and the wealthy vote - weighted by wealth. Exchanges report shares live; money talks loudest.",
    selection: "popular", method: "ranked", methods: ["ranked", "plurality"],
    multiParty: true, integrity: 0.92, compulsory: 0, protection: 0.2, electorate: { capitalists: 1, merchants: 0.8, wealthy: 0.7, middle: 0.2 }, wealthWeighted: true,
    weights: { ...W, money: 2.4 },
    words: { report: "of shares tallied", unit: "shares", county: "Exchange", counties: "exchanges" },
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
  gov.consensus = gov.consensus ?? 0.5;
  gov.threshold = gov.threshold ?? 0.05;
  gov.ballotWeight = s.ballotWeight ?? 25;
  gov.nightMinutes = s.nightMinutes ?? 20;
  gov.words = gov.words || { report: "counted", unit: "votes", county: "County", counties: "counties" };
  return gov;
}
