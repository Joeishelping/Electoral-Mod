// Region helpers: create a region from a type (sets its population and who lives
// there), and share voting power out by population. People are never generated -
// roleplayers create and name their own candidates.

import { REGION_TEMPLATES } from "../data/blocs.js";
import { createRegion } from "../core/state.js";
import { clamp } from "../core/random.js";
import { placeName, uniqueName } from "../data/names.js";

export function autoApportion(nation, totalSeats = null) {
  const regions = nation.regions.filter((r) => r.autoPower !== false);
  if (!regions.length) return;
  const seats = Math.max(regions.length, totalSeats ?? nation.settings?.totalSeats ?? Math.max(regions.length * 3, 8));
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

export function addRegionOfType(state, nation, rng, templateId, name = "") {
  const tpl = REGION_TEMPLATES.find((t) => t.id === templateId) || rng.pick(REGION_TEMPLATES);
  const blocs = {};
  for (const [b, v] of Object.entries(tpl.mix)) blocs[b] = Math.max(1, Math.round(v * rng.range(0.8, 1.2)));
  const issueMods = {};
  for (const [i, v] of Object.entries(tpl.focus)) issueMods[i] = Math.round(v * 100) / 100;
  const taken = new Set(nation.regions.map((r) => r.name));
  const region = createRegion(state, nation, {
    name: name.trim() || uniqueName(rng, placeName, taken),
    template: tpl.id,
    population: Math.round(rng.range(tpl.pop[0], tpl.pop[1]) / 100) * 100,
    blocs,
    wealth: clamp(Math.round(tpl.wealth + rng.normal(0, 6)), 5, 100),
    urban: tpl.urban,
    issueMods,
  });
  autoApportion(nation);
  return region;
}
