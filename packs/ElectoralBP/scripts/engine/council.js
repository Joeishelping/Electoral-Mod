// Council / consensus selection. Used by royal, clan, religious and officer councils. Electors ballot in rounds; weak
// candidates drop out, and electors drift toward the frontrunner (bandwagoning)
// until someone reaches the required consensus threshold.

import { createRng, clamp } from "../core/random.js";
import { regionBlocShares } from "../core/state.js";
import { BLOC_BY_ID } from "../data/blocs.js";
import { buildContext, blendBlocs, utility } from "./model.js";
import { candidateSummary } from "./election.js";

function regionalElectors(ctx) {
  const gov = ctx.gov;
  const out = [];
  for (const region of ctx.nation.regions) {
    const shares = regionBlocShares(region);
    const weights = {};
    let total = 0;
    for (const [b, s] of Object.entries(shares)) {
      const w = s * (gov.electorate ? gov.electorate[b] || 0 : 1);
      if (w > 0) {
        weights[b] = w;
        total += w;
      }
    }
    const blend = blendBlocs(ctx, region, weights);
    if (!blend || total <= 0) continue;
    const wealth = gov.wealthWeighted ? clamp(region.wealth / 50, 0.2, 3) : 1;
    // Each region sends a small delegation; delegates share a background but not a mind.
    const seats = clamp(region.power || 1, 1, 4);
    for (let k = 0; k < seats; k++) out.push({
      key: `${region.id}:${k}`,
      name: seats > 1 ? `${region.name} Elector ${k + 1}` : `${region.name} Elector`,
      region,
      regionId: region.id,
      weight: (region.population * total * wealth) / seats,
      ideal: blend.ideal,
      salience: blend.salience,
      traits: blend.traits,
      loyalty: 0.6,
      volatility: 0.6,
      retro: blend.retro,
      memory: {},
      conviction: 0.5,
    });
  }
  return out;
}

export function buildElectors(ctx) {
  return regionalElectors(ctx);
}

export function computeCouncil(state, nation, election, seed, opts = {}) {
  const rng = createRng(seed);
  const ctx = buildContext(state, nation, election.candidates);
  const gov = ctx.gov;
  const cands = ctx.candidates;
  const n = cands.length;
  const electors = buildElectors(ctx);
  const totalWeight = electors.reduce((s, e) => s + e.weight, 0) || 1;

  for (const e of electors) {
    e.base = cands.map((c) => utility(ctx, e, c) + rng.normal(0, e.conviction)); // personal leanings
  }

  const threshold = gov.consensus || 0.5;
  const active = new Set(cands.map((_, i) => i));
  const rounds = [];
  let shares = new Array(n).fill(1 / n);
  let winner = -1;
  let lastVotes = null;
  const maxRounds = 8;
  for (let round = 1; round <= maxRounds && winner < 0; round++) {
    const tallies = new Array(n).fill(0);
    const leaderPrev = shares.indexOf(Math.max(...shares));
    lastVotes = electors.map((e) => {
      let best = -1;
      let bv = -Infinity;
      for (const i of active) {
        const v = e.base[i] + rng.normal(0, 0.15) + ((3.5 * (round - 1)) / maxRounds) * shares[i] + (i === leaderPrev ? 0.08 * (round - 1) : 0);
        if (v > bv) {
          bv = v;
          best = i;
        }
      }
      tallies[best] += e.weight;
      return best;
    });
    shares = tallies.map((t) => t / totalWeight);
    const order = [...active].sort((a, b) => tallies[b] - tallies[a]);
    const scaled = tallies.map((t) => Math.round((t / totalWeight) * 1000));
    if (shares[order[0]] >= threshold - 1e-9 || active.size === 1) {
      winner = order[0];
      rounds.push({ label: `Ballot ${round}`, votes: scaled, note: `${(shares[order[0]] * 100).toFixed(0)}% reaches the ${(threshold * 100).toFixed(0)}% threshold.` });
      break;
    }
    let eliminated = null;
    if (active.size > 2) {
      eliminated = order[order.length - 1];
      active.delete(eliminated);
    }
    rounds.push({ label: `Ballot ${round}`, votes: scaled, eliminated });
  }

  let deadlock = false;
  if (winner < 0) {
    deadlock = true;
    const lastTallies = rounds[rounds.length - 1].votes;
    winner = lastTallies.indexOf(Math.max(...lastTallies));
  }

  const finalVotes = rounds[rounds.length - 1].votes;
  const result = {
    id: election.id,
    no: (nation.electionCount || 0) + 1,
    kind: "council",
    method: "consensus",
    methodName: `Council consensus (${Math.round(threshold * 100)}%)`,
    gov: nation.gov,
    title: opts.title || election.title,
    seed,
    candidates: candidateSummary(state, nation, election.candidates),
    national: finalVotes.slice(),
    regions: ctx.nation.regions.map((region) => {
      const votes = new Array(n).fill(0);
      electors.forEach((e, k) => {
        if (e.regionId === region.id && !e.kinId) votes[lastVotes[k]] += Math.round((e.weight / totalWeight) * 1000);
      });
      const cast = votes.reduce((a, b) => a + b, 0);
      return { id: region.id, name: region.name, power: 0, votes, cast, eligible: cast, winner: cast ? votes.indexOf(Math.max(...votes)) : -1, alloc: null };
    }).filter((r) => r.cast > 0),
    blocs: [],
    electors: electors.map((e, k) => ({ name: e.name, weight: Math.round((e.weight / totalWeight) * 1000) / 10, vote: lastVotes[k] })),
    rounds,
    winnerIdx: winner,
    totalAlloc: null,
    trueWinnerIdx: winner,
    deadlock,
    cast: 1000,
    eligible: 1000,
    turnout: 1,
  };
  result.winnerId = cands[winner]?.id || null;
  const w = result.candidates[winner];
  result.narrative = [
    `${w.color}${w.name}§r is chosen by the council after ${rounds.length} ballot${rounds.length > 1 ? "s" : ""}.`,
  ];
  if (deadlock) result.narrative.push("§6The council deadlocked; the leading candidate was declared by acclamation.");
  const backers = electors.map((e, k) => [e, lastVotes[k]]).filter(([, v]) => v === winner).sort((a, b) => b[0].weight - a[0].weight);
  if (backers.length) result.narrative.push(`Key backers: ${backers.slice(0, 3).map(([e]) => e.name).join(", ")}.`);
  const opp = electors.map((e, k) => [e, lastVotes[k]]).filter(([, v]) => v !== winner).sort((a, b) => b[0].weight - a[0].weight);
  if (opp.length) result.narrative.push(`Holdouts: ${opp.slice(0, 3).map(([e, v]) => `${e.name} (for ${result.candidates[v].name})`).join(", ")}.`);
  if (gov.electorate) {
    const names = Object.keys(gov.electorate).map((b) => BLOC_BY_ID[b]?.name).filter(Boolean);
    result.narrative.push(`§7Electorate: ${names.join(", ")}.`);
  }
  return result;
}
