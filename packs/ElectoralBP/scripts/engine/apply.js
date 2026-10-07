// Committing outcomes: installing leaders, forming governments, recording history
// and "learning" - voter habits, issue priorities and reputations shift after
// every contest so the next election remembers this one.

import { ISSUE_IDS } from "../data/issues.js";
import { METRICS } from "../data/metrics.js";
import { effectiveGov } from "../data/governments.js";
import { addLog, getPerson, HISTORY_LIMIT } from "../core/state.js";
import { clamp, createRng, sigmoid } from "../core/random.js";
import { formGovernment } from "./cabinet.js";
import { buildContext, buildGroups, utility } from "./model.js";

export function installLeader(state, nation, leaderId, seed, opts = {}) {
  const gov = effectiveGov(nation);
  const rng = createRng(seed ^ 0x9e3779b9);
  const leader = getPerson(state, leaderId);
  const sameLeader = nation.leaderId === leaderId;
  if (!opts.reshuffle) {
    if (sameLeader) nation.leaderTerms = (nation.leaderTerms || 0) + 1;
    else nation.leaderTerms = 1;
    if (leader) leader.terms = (leader.terms || 0) + 1;
  }

  // Continuity: a re-elected leader or an orderly succession keeps sitting officials
  // unless someone better fits, so treat the current cabinet as soft pins.
  const savedPins = nation.cabinetPins;
  if (opts.continuity) {
    const keep = {};
    const allowed = opts.coalition ? new Set(opts.coalition.map((c) => c.key)) : null;
    for (const [office, id] of Object.entries(nation.cabinet)) {
      const p = getPerson(state, id);
      if (id === leaderId || !p?.alive) continue;
      if (allowed && !allowed.has(p.partyId || `ind:${p.id}`)) continue; // ministers outside the new coalition go
      keep[office] = id;
    }
    nation.cabinetPins = { ...keep, ...savedPins };
  }
  nation.leaderId = leaderId;
  if (nation.heirId === leaderId) nation.heirId = null;
  if (leader && gov.selection === "hereditary" && leader.dynasty) nation.dynasty = leader.dynasty;
  const formed = formGovernment(state, nation, gov, leaderId, rng, {
    runningMateId: opts.runningMateId,
    coalition: opts.coalition,
    keepDeputy: opts.keepDeputy,
  });
  nation.cabinetPins = savedPins;
  nation.deputyId = formed.deputyId;
  nation.cabinet = formed.cabinet;
  return { leaderId, deputyId: formed.deputyId, cabinet: { ...formed.cabinet }, notes: formed.notes };
}

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
    if (i === result.winnerIdx) p.popularity = clamp(p.popularity + 6, 0, 100);
    else p.popularity = clamp(p.popularity - (c.id === nation.leaderId ? 8 : 3), 0, 100);
  });
}

function compact(result) {
  const r = { ...result };
  delete r.groupShares;
  if (r.explain) r.explain = { best: r.explain.best, worst: r.explain.worst };
  return r;
}

function pushHistory(nation, result) {
  nation.history.unshift(compact(result));
  // Older entries lose their bulky per-group exit polls.
  for (let i = 2; i < nation.history.length; i++) nation.history[i].blocs = [];
  if (nation.history.length > HISTORY_LIMIT) nation.history.length = HISTORY_LIMIT;
}

/** Commits an election / council result. Mutates state. */
export function applyResult(state, nation, result) {
  const gov = effectiveGov(nation);
  if (result.kind === "popular") learnFromElection(state, nation, result, gov);
  // Unrest: managed counts breed resentment; real elections let off steam.
  for (const region of nation.regions) {
    const rr = result.regions.find((x) => x.id === region.id);
    region.unrest = clamp(Math.round((region.unrest || 0) * (result.kind === "popular" ? 0.8 : 0.95) + (rr?.unrestDelta || 0)), 0, 100);
  }
  let outcome = null;
  if (result.winnerId) {
    const winner = getPerson(state, result.winnerId);
    const same = result.winnerId === nation.leaderId;
    outcome = installLeader(state, nation, result.winnerId, result.seed || 1, {
      runningMateId: gov.runningMate && result.kind === "popular" ? winner?.runningMateId : null,
      coalition: result.coalition ? result.coalition.parties.map((p) => ({ key: p.key, seats: p.seats, name: p.name })) : null,
      continuity: same,
    });
    addLog(nation, `#${result.no} ${result.title}: ${winner?.name || "?"} ${same ? "retains" : "takes"} office.`);
  }
  result.outcome = outcome;
  nation.electionCount = (nation.electionCount || 0) + 1;
  nation.election = null;
  pushHistory(nation, result);
  return result;
}

/** Commits a succession. reason: death | abdication | removal | resignation */
export function applySuccession(state, nation, result, reason) {
  const departing = getPerson(state, nation.leaderId);
  if (departing && reason === "death") departing.alive = false;
  if (departing && reason !== "death") departing.popularity = clamp(departing.popularity - 10, 0, 100);
  const succeededFromCabinet = result.winnerId;
  if (!succeededFromCabinet) {
    nation.leaderId = null;
    nation.leaderTerms = 0;
    result.outcome = null;
  } else {
    // The successor leaves their old post; everyone else stays.
    for (const [office, id] of Object.entries(nation.cabinet)) if (id === succeededFromCabinet) delete nation.cabinet[office];
    if (nation.deputyId === succeededFromCabinet) nation.deputyId = null;
    nation.leaderId = null; // fresh term count for the successor
    result.outcome = installLeader(state, nation, succeededFromCabinet, result.seed || nation.electionCount + 7, {
      continuity: true,
      keepDeputy: true,
    });
  }
  addLog(nation, `${result.title}: ${departing?.name || "vacancy"} -> ${getPerson(state, result.winnerId)?.name || "nobody"}.`);
  for (const region of nation.regions) region.unrest = clamp((region.unrest || 0) + (result.title.includes("Contested") || result.narrative.some((l) => l.includes("Contested")) ? 8 : 0), 0, 100);
  nation.electionCount = (nation.electionCount || 0) + 1;
  pushHistory(nation, result);
  return result;
}

// ---------- public mood ----------

export function surveyApproval(state, nation, seed = 1) {
  const leader = getPerson(state, nation.leaderId);
  if (!leader) return null;
  const rng = createRng(seed);
  const gov = effectiveGov(nation);
  const ctx = buildContext(state, nation, [leader.id]);
  // Under a popular system the electorate is everyone; councils still care about the public mood.
  ctx.gov = { ...ctx.gov, electorate: null, wealthWeighted: false };
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
  const avgUnrest = ctx.avgUnrest;
  const revoltRisk = clamp((1 - national) * (1 - gov.protection) * (0.4 + avgUnrest / 100) * (national < 0.4 ? 1.5 : 1), 0, 1);
  const survey = {
    at: nation.electionCount,
    leaderId: leader.id,
    national,
    revoltRisk,
    regions: nation.regions.map((r) => ({ id: r.id, name: r.name, approval: regions[r.id] ? regions[r.id][0] / regions[r.id][1] : 0.5, unrest: r.unrest || 0 })),
    blocs: Object.entries(blocs).map(([id, v]) => ({ id, approval: v[0] / v[1], voters: Math.round(v[1]) })),
  };
  return survey;
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

// Where a region's voters sit on average (population-weighted bloc ideals).
export function regionIdeal(state, nation, region) {
  const ctx = buildContext(state, nation, []);
  ctx.gov = { ...ctx.gov, electorate: null, wealthWeighted: false };
  const groups = buildGroups(ctx).filter((g) => g.region.id === region.id);
  const out = Object.fromEntries(ISSUE_IDS.map((id) => [id, 0]));
  const den = groups.reduce((s, g) => s + g.voters, 0) || 1;
  for (const g of groups) for (const id of ISSUE_IDS) out[id] += (g.ideal[id] * g.voters) / den;
  return out;
}
