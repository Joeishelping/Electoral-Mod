// Council elections: Royal Council, Clan Council, Sacred Conclave, Military Junta.
// Each county sends electors (a noble house, a clan, clergy, a garrison). They
// ballot in rounds; weak candidates drop out and electors drift toward the
// frontrunner until someone reaches the threshold. Each council has its own twist:
//   bribery    rich candidates buy wavering houses between rounds
//   walkouts   clans whose candidate was eliminated may storm out
//   relaxAfter after N deadlocked ballots the threshold drops to a majority
//   coup       a strong loser may try to seize power after the vote

import { createRng, clamp } from "../core/random.js";
import { regionBlocShares } from "../core/state.js";
import { BLOC_BY_ID } from "../data/blocs.js";
import { buildContext, blendBlocs, utility } from "./model.js";
import { candidateSummary } from "./election.js";

function buildElectors(ctx) {
  const gov = ctx.gov;
  const cfg = gov.council || {};
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
    // bigger counties send fuller delegations
    const seats = clamp(Math.min(cfg.seats || 1, Math.ceil((region.power || 1) / 2)), 1, 4);
    for (let k = 0; k < seats; k++) {
      out.push({
        key: `${region.id}:${k}`,
        name: cfg.elector ? cfg.elector(region.name, seats > 1 ? k : 0) : `${region.name} Elector`,
        region,
        regionId: region.id,
        weight: (Math.sqrt(region.population) * total * wealth) / seats,
        ideal: blend.ideal,
        salience: blend.salience,
        traits: blend.traits,
        loyalty: 0.6,
        volatility: 0.6,
        retro: blend.retro,
        mix: (() => {
          const t = blend.mix.reduce((a, [, w]) => a + w, 0) || 1;
          return blend.mix.map(([g, w]) => [g, w / t]);
        })(),
        memory: {},
        conviction: 0.6,
      });
    }
  }
  return out;
}

export function computeCouncil(state, nation, election, seed) {
  const rng = createRng(seed);
  const ctx = buildContext(state, nation, election.candidates);
  const gov = ctx.gov;
  const cfg = gov.council || {};
  const cands = ctx.candidates;
  const n = cands.length;
  const electors = buildElectors(ctx);
  const names = cands.map((c) => c.name);
  for (const e of electors) e.base = cands.map((c) => utility(ctx, e, c) + rng.normal(0, e.conviction));

  let threshold = gov.consensus || 0.5;
  const maxRounds = cfg.maxRounds || 8;
  const active = new Set(cands.map((_, i) => i));
  const absent = new Set();
  const rounds = [];
  const votesByRound = [];
  const intrigue = []; // { after: roundIndex, text }
  let shares = new Array(n).fill(1 / n);
  let winner = -1;

  for (let round = 1; round <= maxRounds && winner < 0; round++) {
    const tallies = new Array(n).fill(0);
    const leaderPrev = shares.indexOf(Math.max(...shares));
    const votes = electors.map((e, k) => {
      if (absent.has(k)) return -1;
      let best = -1;
      let bv = -Infinity;
      for (const i of active) {
        const v = e.base[i] + rng.normal(0, 0.55 / (1 + 0.45 * (round - 1))) + ((3.5 * (round - 1)) / maxRounds) * shares[i] + (i === leaderPrev ? 0.08 * (round - 1) : 0);
        if (v > bv) {
          bv = v;
          best = i;
        }
      }
      tallies[best] += e.weight;
      return best;
    });
    votesByRound.push(votes);
    // defections since the last ballot are narrated before this ballot's declarations
    if (round > 1 && !cfg.secret) {
      const prev = votesByRound[round - 2];
      votes.forEach((v, k) => {
        if (v >= 0 && prev[k] >= 0 && prev[k] !== v && rng.chance(0.6)) {
          intrigue.push({ after: round - 2, text: `§b${electors[k].name} abandons ${names[prev[k]]} for ${names[v]}.` });
        }
      });
    }
    const present = electors.reduce((s, e, k) => s + (absent.has(k) ? 0 : e.weight), 0) || 1;
    shares = tallies.map((t) => t / present);
    const order = [...active].sort((a, b) => tallies[b] - tallies[a]);
    const scaled = tallies.map((t) => Math.round((t / present) * 1000));
    const nominating = round < (cfg.minRounds || 1);
    if (!nominating && (shares[order[0]] >= threshold - 1e-9 || active.size === 1)) {
      winner = order[0];
      rounds.push({ label: `Ballot ${round}`, votes: scaled, note: `${(shares[order[0]] * 100).toFixed(0)}% - the ${(threshold * 100).toFixed(0)}% needed is reached.` });
      break;
    }
    let eliminated = null;
    if (nominating) {
      rounds.push({ label: `Ballot ${round}`, votes: scaled, eliminated: null, note: "A nominating ballot - no one can be chosen yet." });
      continue;
    }
    if (active.size > 2) {
      eliminated = order[order.length - 1];
      active.delete(eliminated);
    }
    rounds.push({ label: `Ballot ${round}`, votes: scaled, eliminated, note: `No one has ${(threshold * 100).toFixed(0)}%.` });
    const after = rounds.length - 1;

    // --- this council's twist between ballots ---
    if (cfg.walkouts && eliminated !== null) {
      votes.forEach((v, k) => {
        if (v === eliminated && rng.chance(0.35)) {
          absent.add(k);
          intrigue.push({ after, text: `§c${electors[k].name} storms out of the council after ${names[eliminated]} is eliminated!` });
        }
      });
    }
    if (cfg.bribery) {
      const rich = [...active].sort((a, b) => cands[b].funds - cands[a].funds)[0];
      votes.forEach((v, k) => {
        if (v >= 0 && v !== rich && active.has(rich) && rng.chance(clamp((cands[rich].funds - 45) / 220, 0, 0.3))) {
          electors[k].base[rich] += 1.2;
          intrigue.push({ after, text: `§6Gold changes hands - ${electors[k].name} has been quietly bought by ${names[rich]}.` });
        }
      });
    }
    if (cfg.relaxAfter && round === cfg.relaxAfter && threshold > 0.5) {
      threshold = 0.5;
      intrigue.push({ after, text: "§eAfter so many failed ballots, the council agrees a simple majority will now be enough." });
    }
  }

  let deadlock = false;
  if (winner < 0) {
    deadlock = true;
    const last = rounds[rounds.length - 1].votes;
    winner = last.indexOf(Math.max(...last));
  }

  // Military junta: a strong runner-up may try to take power anyway.
  let coup = null;
  if (cfg.coup && n > 1) {
    const last = rounds[rounds.length - 1].votes;
    const runner = last.map((v, i) => [v, i]).filter(([, i]) => i !== winner).sort((a, b) => b[0] - a[0])[0][1];
    const support = last[winner] / 1000;
    const chance = clamp((0.62 - support) * 1.2 + (cands[runner].competence - 60) / 200, 0, 0.45) * (1 - gov.protection * 0.5);
    if (rng.chance(chance)) {
      const success = rng.chance(clamp(0.35 + (last[runner] / 1000 - support) + (cands[runner].competence - cands[winner].competence) / 200, 0.1, 0.7));
      coup = { by: runner, success };
      if (success) winner = runner;
    }
  }

  const lastVotes = votesByRound[votesByRound.length - 1];
  const result = {
    id: election.id,
    no: (nation.electionCount || 0) + 1,
    kind: "council",
    method: "consensus",
    methodName: `${gov.name} (${Math.round((gov.consensus || 0.5) * 100)}% needed)`,
    gov: nation.gov,
    title: election.title,
    seed,
    candidates: candidateSummary(state, nation, election.candidates),
    national: rounds[rounds.length - 1].votes.slice(),
    regions: ctx.nation.regions.map((region) => {
      const votes = new Array(n).fill(0);
      electors.forEach((e, k) => {
        if (e.regionId === region.id && lastVotes[k] >= 0) votes[lastVotes[k]] += Math.round((e.weight / electors.reduce((s, x) => s + x.weight, 0)) * 1000);
      });
      const cast = votes.reduce((a, b) => a + b, 0);
      return { id: region.id, name: region.name, power: 0, votes, cast, eligible: cast, winner: cast ? votes.indexOf(Math.max(...votes)) : -1, alloc: null };
    }).filter((r) => r.cast > 0),
    blocs: [],
    electors: electors.map((e) => ({ name: e.name, regionId: e.regionId, weight: e.weight })),
    votesByRound,
    intrigue,
    coup,
    rounds,
    winnerIdx: winner,
    trueWinnerIdx: winner,
    totalAlloc: null,
    deadlock,
    cast: 1000,
    eligible: 1000,
    turnout: 1,
  };
  result.winnerId = cands[winner]?.id || null;
  const w = result.candidates[winner];
  result.narrative = [`${w.color}${w.name}§r is chosen after ${rounds.length} ballot${rounds.length > 1 ? "s" : ""}.`];
  if (deadlock) result.narrative.push("§6The council deadlocked; the frontrunner was proclaimed anyway.");
  if (coup) result.narrative.push(coup.success ? `§c${names[coup.by]} seized power in a coup!` : `§c${names[coup.by]} attempted a coup, but it failed.`);
  const backers = electors.map((e, k) => [e, lastVotes[k]]).filter(([, v]) => v === winner).sort((a, b) => b[0].weight - a[0].weight);
  if (backers.length) result.narrative.push(`Key backers: ${backers.slice(0, 3).map(([e]) => e.name).join(", ")}.`);
  if (gov.electorate) result.narrative.push(`§7Voters: ${Object.keys(gov.electorate).map((b) => BLOC_BY_ID[b]?.name).filter(Boolean).join(", ")}.`);
  return result;
}
