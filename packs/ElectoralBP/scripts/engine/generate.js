// Region helpers: create a region from a type (sets its population and who lives
// there), and share voting power out by population. People are never generated -
// roleplayers create and name their own candidates.

import { REGION_TEMPLATES } from "../data/blocs.js";
import { createRegion } from "../core/state.js";
import { clamp, createRng, hashSeed } from "../core/random.js";
import { BLOC_BY_ID } from "../data/blocs.js";
import { ISSUE_IDS } from "../data/issues.js";
import { regionBlocShares } from "../core/state.js";
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
  seedHistoricalLean(nation);
  return region;
}

// Historical party loyalty: how well each party's platform fits the people of a
// county, plus some local history. Only fills pairs that have never been set, so
// manual edits and lean earned in past elections are kept.
export function seedHistoricalLean(nation) {
  for (const region of nation.regions) {
    const shares = regionBlocShares(region);
    // how far each party is from each group, weighted by what that group cares about
    const fits = nation.parties.map((p) => {
      let d = 0;
      let w = 0;
      for (const [b, sh] of Object.entries(shares)) {
        const bloc = BLOC_BY_ID[b];
        for (const id of ISSUE_IDS) {
          const sal = (bloc.salience[id] ?? 0.2) * (1 + (region.issueMods[id] || 0));
          d += sh * sal * Math.abs((bloc.ideal[id] ?? 0) - (p.positions[id] || 0));
          w += sh * sal;
        }
      }
      return 1 - d / (w || 1) / 100;
    });
    const mean = fits.reduce((a, b) => a + b, 0) / (fits.length || 1);
    nation.parties.forEach((p, i) => {
      if (region.lean[p.id] !== undefined) return;
      const rng = createRng(hashSeed(region.id, p.id));
      region.lean[p.id] = clamp(Math.round(((fits[i] - mean) * 4 + rng.normal(0, 0.12)) * 100) / 100, -1, 1);
    });
  }
}

export function countyPattern(nation, region) {
  const entries = nation.parties.map((p) => [p, region.lean[p.id] || 0]).sort((a, b) => b[1] - a[1]);
  const hist = (region.history || []).slice(0, 4);
  const sameParty = hist.length >= 2 && hist.every((h) => h.partyId && h.partyId === hist[0].partyId);
  if (!entries.length) return hist.length ? (sameParty ? "Loyal" : "Unpredictable") : "No history yet";
  const [top, v] = entries[0];
  const gap = v - (entries[1]?.[1] ?? -1);
  if (gap > 0.45 || (sameParty && hist.length >= 3 && hist[0].partyId === top.id)) return `${top.color}Safe ${top.name}`;
  if (gap > 0.2) return `${top.color}Leans ${top.name}`;
  return "§eSwing county";
}
