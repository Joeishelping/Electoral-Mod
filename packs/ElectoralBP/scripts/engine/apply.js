// Recording results and "learning": voter habits, issue priorities and
// reputations shift after every election so the next one remembers this one.
// Nothing here runs the country - that's up to the roleplayers.

import { ISSUE_IDS } from "../data/issues.js";
import { METRICS } from "../data/metrics.js";
import { effectiveGov } from "../data/governments.js";
import { getPerson, HISTORY_LIMIT } from "../core/state.js";
import { clamp, createRng, sigmoid } from "../core/random.js";
import { buildContext, buildGroups, utility } from "./model.js";

function learnFromElection(state, nation, result, gov) {
  // 1. Voting habits: groups drift toward the parties they just backed.
  if (gov.multiParty && result.groupShares) {
    const partyOf = result.candidates.map((c) => c.partyId);
    const parties = [...new Set(partyOf.filter(Boolean))];
    if (parties.length > 1) {
      for (const g of result.groupShares) {
        const region = nation.regions.find((r) => r.id === g.r);
        if (!region) continue;
        const mem = (region.memory[g.b] = region.memory[g.b] || {});
        for (const pid of parties) {
          const share = g.s.reduce((s, v, i) => s + (partyOf[i] === pid ? v : 0), 0);
          mem[pid] = clamp((mem[pid] || 0) * 0.8 + 0.5 * (share - 1 / parties.length), -0.8, 0.8);
        }
      }
    }
  }
  // 2. Issue priorities: failing areas become more important, thriving ones fade.
  for (const id of ISSUE_IDS) nation.salience[id] = nation.salience[id] ?? 1;
  for (const m of METRICS) {
    const dev = (50 - (nation.metrics[m.id] ?? 50)) / 50;
    for (const [issue, w] of Object.entries(m.issues)) {
      const target = 1 + 0.7 * dev * w;
      nation.salience[issue] = nation.salience[issue] * 0.85 + target * 0.15;
    }
  }
  const winner = getPerson(state, result.winnerId);
  if (winner) for (const f of winner.focus) nation.salience[f] += 0.05; // the winner's agenda sticks
  for (const id of ISSUE_IDS) nation.salience[id] = clamp(Math.round(nation.salience[id] * 1000) / 1000, 0.5, 2);

  // 3. Reputations.
  result.candidates.forEach((c, i) => {
    const p = getPerson(state, c.id);
    if (!p) return;
    if (i === result.winnerIdx) p.popularity = clamp(p.popularity + 5, 0, 100);
    else p.popularity = clamp(p.popularity - (c.id === nation.leaderId ? 6 : 2), 0, 100);
  });
}

function compact(result) {
  const r = { ...result };
  delete r.groupShares;
  if (r.explain) r.explain = { best: r.explain.best, worst: r.explain.worst };
  return r;
}

/** Records a finished count. The winner becomes the nation's current officeholder. */
export function applyResult(state, nation, result) {
  const gov = effectiveGov(nation);
  if (result.kind === "popular") learnFromElection(state, nation, result, gov);
  // Managed counts breed resentment; real elections let off steam.
  for (const region of nation.regions) {
    const rr = result.regions.find((x) => x.id === region.id);
    region.unrest = clamp(Math.round((region.unrest || 0) * 0.8 + (rr?.unrestDelta || 0)), 0, 100);
  }
  if (result.winnerId) {
    const winner = getPerson(state, result.winnerId);
    if (result.winnerId === nation.leaderId) nation.leaderTerms = (nation.leaderTerms || 0) + 1;
    else nation.leaderTerms = 1;
    nation.leaderId = result.winnerId;
    if (winner) winner.terms = (winner.terms || 0) + 1;
  }
  nation.electionCount = (nation.electionCount || 0) + 1;
  nation.history.unshift(compact(result));
  for (let i = 2; i < nation.history.length; i++) nation.history[i].blocs = []; // older exit polls are dropped
  if (nation.history.length > HISTORY_LIMIT) nation.history.length = HISTORY_LIMIT;
  return result;
}

// ---------- public mood ----------

export function surveyApproval(state, nation, seed = 1) {
  const leader = getPerson(state, nation.leaderId);
  if (!leader) return null;
  const rng = createRng(seed);
  const gov = effectiveGov(nation);
  const ctx = buildContext(state, nation, [leader.id]);
  ctx.gov = { ...ctx.gov, electorate: null, wealthWeighted: false }; // the whole public, not just voters
  const groups = buildGroups(ctx);
  const regions = {};
  const blocs = {};
  let num = 0;
  let den = 0;
  for (const g of groups) {
    const u = utility(ctx, g, leader);
    const a = clamp(sigmoid(1.6 * (u + 0.55)) + rng.normal(0, 0.02), 0.01, 0.99);
    num += a * g.voters;
    den += g.voters;
    const r = (regions[g.region.id] = regions[g.region.id] || [0, 0]);
    r[0] += a * g.voters;
    r[1] += g.voters;
    const b = (blocs[g.blocId] = blocs[g.blocId] || [0, 0]);
    b[0] += a * g.voters;
    b[1] += g.voters;
  }
  const national = den ? num / den : 0.5;
  const revoltRisk = clamp((1 - national) * (1 - gov.protection) * (0.4 + ctx.avgUnrest / 100) * (national < 0.4 ? 1.5 : 1), 0, 1);
  return {
    at: nation.electionCount,
    leaderId: leader.id,
    national,
    revoltRisk,
    regions: nation.regions.map((r) => ({ id: r.id, name: r.name, approval: regions[r.id] ? regions[r.id][0] / regions[r.id][1] : 0.5, unrest: r.unrest || 0 })),
    blocs: Object.entries(blocs).map(([id, v]) => ({ id, approval: v[0] / v[1], voters: Math.round(v[1]) })),
  };
}

// What the electorate cares about most right now (population-weighted salience).
export function issuePriorities(state, nation, region = null) {
  const ctx = buildContext(state, nation, []);
  const groups = buildGroups(ctx).filter((g) => !region || g.region.id === region.id);
  const totals = Object.fromEntries(ISSUE_IDS.map((id) => [id, 0]));
  let den = 0;
  for (const g of groups) {
    for (const id of ISSUE_IDS) totals[id] += g.salience[id] * g.voters;
    den += g.voters;
  }
  return ISSUE_IDS.map((id) => ({ id, weight: den ? totals[id] / den : 0 })).sort((a, b) => b.weight - a.weight);
}

// Where a region's people sit on average (population-weighted group stances).
export function regionIdeal(state, nation, region) {
  const ctx = buildContext(state, nation, []);
  ctx.gov = { ...ctx.gov, electorate: null, wealthWeighted: false };
  const groups = buildGroups(ctx).filter((g) => g.region.id === region.id);
  const out = Object.fromEntries(ISSUE_IDS.map((id) => [id, 0]));
  const den = groups.reduce((s, g) => s + g.voters, 0) || 1;
  for (const g of groups) for (const id of ISSUE_IDS) out[id] += (g.ideal[id] * g.voters) / den;
  return out;
}
