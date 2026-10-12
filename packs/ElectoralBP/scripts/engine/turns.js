// One "turn" of a nation's life between elections: situations progress, the
// economy runs, and new situations may strike.

import { ensureEconomy, runEconomyTurn } from "./economy.js";
import { advanceSituations, ensureSituations, spawnChance, spawnSituation } from "./situations.js";

export function runNationTurn(state, nation, rng, now = Date.now()) {
  const e = ensureEconomy(nation);
  ensureSituations(state, nation);
  const situ = advanceSituations(state, nation, rng);
  const lines = [...situ.lines, ...runEconomyTurn(state, nation, rng, situ)];
  if (nation.regions.length && rng.chance(spawnChance(state, nation))) {
    const s = spawnSituation(state, nation, rng);
    if (s) lines.push(...s.lines);
  }
  e.nextTurnAt = now + Math.max(1, e.turnMinutes) * 60000;
  return lines;
}
