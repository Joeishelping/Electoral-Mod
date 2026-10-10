// Builds test nations the way an admin would in game (no generated people).
import { createNation, createParty, createPerson } from "../packs/ElectoralBP/scripts/core/state.js";
import { addRegionOfType } from "../packs/ElectoralBP/scripts/engine/generate.js";
import { createRng } from "../packs/ElectoralBP/scripts/core/random.js";

export function buildNation(state, gov, seed = 1, name = `Test ${gov}`) {
  const rng = createRng(seed);
  const n = createNation(state, { name, gov });
  for (const t of ["capital", "farmland", "mining", "port", "temple"]) addRegionOfType(state, n, rng, t);
  const a = createParty(state, n, { name: "Workers", color: "§c", positions: { labor: 70, welfare: 60, economy: -40 } });
  const b = createParty(state, n, { name: "Traders", color: "§9", positions: { trade: 70, economy: 60 } });
  const c1 = createPerson(state, n, { name: "Ada", partyId: a.id, positions: { labor: 70, welfare: 50, economy: -30 }, focus: ["labor"], targets: ["workers"], traits: ["unionman", "populist"], homeRegion: n.regions[2].id });
  const c2 = createPerson(state, n, { name: "Bram", partyId: b.id, positions: { trade: 70, economy: 60 }, focus: ["trade"], targets: ["merchants"], traits: ["mogul"], backers: ["capitalists"], homeRegion: n.regions[3].id });
  const c3 = createPerson(state, n, { name: "Cyra", positions: { tradition: 70, order: 40 }, focus: ["tradition"], targets: ["religious"], traits: ["devout", "clean"] });
  createPerson(state, n, {}); // an unnamed candidate: must never reach a ballot
  return { n, cands: [c1, c2, c3] };
}
