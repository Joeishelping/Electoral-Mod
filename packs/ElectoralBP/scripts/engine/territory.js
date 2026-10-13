// Handing a county (with its people and voting history) from one country to another.

import { autoApportion, seedHistoricalLean } from "./generate.js";

/**
 * Hands a county (with its land, people and voting history) to another country.
 * Party loyalties reset: the new country's parties are strangers there.
 */
export function transferRegion(state, region, to) {
  const from = Object.values(state.nations).find((n) => n.regions.includes(region));
  if (!from || !to || from === to) return false;
  from.regions = from.regions.filter((r) => r !== region);
  to.regions.push(region);
  region.lean = {};
  region.memory = {};
  region.favor = 0;
  for (const p of Object.values(state.persons)) {
    if (p.nationId !== from.id) continue;
    if (p.homeRegion === region.id) p.homeRegion = null;
    p.campaignRegions = (p.campaignRegions || []).filter((id) => id !== region.id);
  }
  if (from.election) for (const [name, b] of Object.entries(from.election.ballots)) if (b.regionId === region.id) delete from.election.ballots[name];
  for (const r of Object.values(state.residents)) if (r.regionId === region.id) r.nationId = to.id;
  autoApportion(from);
  autoApportion(to);
  seedHistoricalLean(to);
  return true;
}
