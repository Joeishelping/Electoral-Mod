// One "turn" of a nation's life between elections: situations progress, the
// economy runs, and new situations may strike.

import { ensureEconomy, runEconomyTurn } from "./economy.js";
import { paperDue, writePaper } from "./newspaper.js";
import { advanceSituations, ensureSituations, spawnChance, spawnFollowUps, spawnSituation } from "./situations.js";

export function runNationTurn(state, nation, rng, now = Date.now()) {
  const e = ensureEconomy(nation);
  ensureSituations(state, nation);
  const situ = advanceSituations(state, nation, rng);
  const lines = [...situ.lines, ...runEconomyTurn(state, nation, rng, situ)];
  lines.push(...spawnFollowUps(state, nation, rng)); // consequences of earlier choices
  if (nation.regions.length && rng.chance(spawnChance(state, nation))) {
    const s = spawnSituation(state, nation, rng);
    if (s) lines.push(...s.lines);
  }
  if (paperDue(nation)) lines.push(...writePaper(state, nation, rng)); // the country's newspaper
  e.nextTurnAt = now + Math.max(1, e.turnMinutes) * 60000;
  return lines;
}
