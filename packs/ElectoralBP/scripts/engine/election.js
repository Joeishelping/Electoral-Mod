// Popular elections: simulate every voter group, then count the ballots with the
// nation's electoral method. computeElection() is pure (never mutates state), so it
// is also used for polling / Monte Carlo forecasts. applyResult() commits the outcome.

import { BLOC_BY_ID } from "../data/blocs.js";
import { ISSUE_BY_ID } from "../data/issues.js";
import { METHODS } from "../data/governments.js";
import { displayName, getParty, getPerson, getRegion, nationPersons, nextId } from "../core/state.js";
import { createRng, clamp, softmax } from "../core/random.js";
import { buildContext, buildGroups, utility, turnoutFor, FACTOR_LABELS } from "./model.js";
import { computeCouncil } from "./council.js";
import { rollDayEvents } from "../data/events.js";

// ---------- setup ----------

export function eligibleCandidates(state, nation) {
  return nationPersons(state, nation).filter((p) => p.name);
}

export function openElection(state, nation, gov, { candidates, method, title, endorsedId }) {
  nation.election = {
    id: nextId(state, "e"),
    kind: gov.selection === "council" ? "council" : "popular",
    method: method || gov.method,
    title: title || `${gov.leaderTitle} Election`,
    opened: Date.now(),
    candidates: candidates.slice(),
    ballots: {},
    endorsedId: endorsedId || null,
    status: "open",
  };
  return nation.election;
}

// ---------- simulation ----------

function simulateGroups(ctx, rng) {
  const cands = ctx.candidates;
  const groups = buildGroups(ctx);
  const natShock = cands.map(() => rng.normal(0, 0.12));
  const regShock = {};
  for (const r of ctx.nation.regions) regShock[r.id] = cands.map(() => rng.normal(0, 0.14));
  for (const g of groups) {
    g.utils = cands.map((c, i) => utility(ctx, g, c) + natShock[i] + regShock[g.region.id][i] + rng.normal(0, 0.1 * g.volatility));
    g.turnout = turnoutFor(ctx, g, g.utils, rng);
    g.cast = g.voters * g.turnout;
  }
  return groups;
}

function playerBallots(state, nation, election, ctx, gov) {
  const out = [];
  for (const [player, b] of Object.entries(election.ballots || {})) {
    const idx = ctx.candidates.findIndex((c) => c.id === b.candidateId);
    if (idx < 0 || !getRegion(nation, b.regionId)) continue;
    out.push({ player, regionId: b.regionId, idx, weight: gov.ballotWeight });
  }
  return out;
}

// Count all groups with only `active` candidates still in the race.
function tally(ctx, groups, ballots, active, turnoutMul = 1) {
  const n = ctx.candidates.length;
  const regions = {};
  const blocs = {};
  const national = new Array(n).fill(0);
  for (const r of ctx.nation.regions) regions[r.id] = { votes: new Array(n).fill(0), cast: 0, eligible: 0 };
  const idx = [...active];
  for (const g of groups) {
    const probs = softmax(idx.map((i) => g.utils[i]));
    const cast = g.cast * turnoutMul;
    const reg = regions[g.region.id];
    reg.cast += cast;
    reg.eligible += g.voters;
    const b = (blocs[g.blocId] = blocs[g.blocId] || { votes: new Array(n).fill(0), cast: 0, eligible: 0 });
    b.cast += cast;
    b.eligible += g.voters;
    idx.forEach((ci, k) => {
      const v = cast * probs[k];
      reg.votes[ci] += v;
      b.votes[ci] += v;
      national[ci] += v;
    });
  }
  for (const bl of ballots) {
    if (!active.has(bl.idx)) continue; // exhausted ballot
    const reg = regions[bl.regionId];
    reg.votes[bl.idx] += bl.weight;
    reg.cast += bl.weight;
    national[bl.idx] += bl.weight;
    const b = (blocs.players = blocs.players || { votes: new Array(n).fill(0), cast: 0, eligible: 0 });
    b.votes[bl.idx] += bl.weight;
    b.cast += bl.weight;
    b.eligible += bl.weight;
  }
  return { regions, blocs, national };
}

const argmax = (arr, among = null) => {
  let best = -1;
  let bv = -Infinity;
  arr.forEach((v, i) => {
    if (among && !among.has(i)) return;
    if (v > bv) {
      bv = v;
      best = i;
    }
  });
  return best;
};
const sum = (arr) => arr.reduce((s, v) => s + v, 0);
const roundArr = (arr) => arr.map((v) => Math.round(v));

// ---------- counting methods ----------

function countPlurality(ctx, groups, ballots) {
  const all = new Set(ctx.candidates.map((_, i) => i));
  const t = tally(ctx, groups, ballots, all);
  return { first: t, winner: argmax(t.national), rounds: [{ label: "Final count", votes: roundArr(t.national) }] };
}

function countRunoff(ctx, groups, ballots) {
  const all = new Set(ctx.candidates.map((_, i) => i));
  const t = tally(ctx, groups, ballots, all);
  const total = sum(t.national);
  const order = t.national.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const rounds = [{ label: "First round", votes: roundArr(t.national) }];
  if (order[0][0] / total > 0.5 || order.length < 3) return { first: t, winner: order[0][1], rounds };
  const top2 = new Set([order[0][1], order[1][1]]);
  const t2 = tally(ctx, groups, ballots, top2, 0.9);
  rounds.push({ label: "Runoff", votes: roundArr(t2.national), note: "Top two advance; turnout dips in the second round." });
  return { first: t, final: t2, winner: argmax(t2.national, top2), rounds };
}

function countRanked(ctx, groups, ballots) {
  const active = new Set(ctx.candidates.map((_, i) => i));
  const rounds = [];
  let first = null;
  let t = null;
  for (let round = 1; ; round++) {
    t = tally(ctx, groups, ballots, active);
    if (!first) first = t;
    const total = sum(t.national);
    const leader = argmax(t.national, active);
    if (t.national[leader] / total > 0.5 || active.size <= 2) {
      rounds.push({ label: `Round ${round}`, votes: roundArr(t.national) });
      return { first, final: t, winner: leader, rounds };
    }
    let loser = -1;
    let lv = Infinity;
    for (const i of active) if (t.national[i] < lv) {
      lv = t.national[i];
      loser = i;
    }
    rounds.push({ label: `Round ${round}`, votes: roundArr(t.national), eliminated: loser });
    active.delete(loser);
  }
}

function allocateElectors(ctx, t) {
  const n = ctx.candidates.length;
  const alloc = new Array(n).fill(0);
  const perRegion = {};
  for (const r of ctx.nation.regions) {
    const w = argmax(t.regions[r.id].votes);
    const a = new Array(n).fill(0);
    if (w >= 0 && t.regions[r.id].cast > 0) {
      a[w] = r.power;
      alloc[w] += r.power;
    }
    perRegion[r.id] = a;
  }
  return { alloc, perRegion };
}

function countElectoral(ctx, groups, ballots) {
  const all = new Set(ctx.candidates.map((_, i) => i));
  const t = tally(ctx, groups, ballots, all);
  let ev = allocateElectors(ctx, t);
  const totalPower = sum(ctx.nation.regions.map((r) => r.power));
  const rounds = [{ label: "Electors", votes: roundArr(t.national), alloc: ev.alloc.slice() }];
  let winner = argmax(ev.alloc);
  if (ev.alloc[winner] * 2 > totalPower) return { first: t, winner, rounds, ...ev, allocLabel: "Electors", totalAlloc: totalPower };
  // Contingency: no majority of electors -> regional runoff between top two elector-earners.
  const order = ev.alloc.map((v, i) => [v, t.national[i], i]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const top2 = new Set([order[0][2], order[1][2]]);
  const t2 = tally(ctx, groups, ballots, top2, 0.92);
  ev = allocateElectors(ctx, t2);
  winner = argmax(ev.alloc, top2);
  if (ev.alloc[order[0][2]] === ev.alloc[order[1][2]]) winner = argmax(t2.national, top2);
  rounds.push({ label: "Contingent runoff", votes: roundArr(t2.national), alloc: ev.alloc.slice(), note: "No elector majority; the top two met in a regional runoff." });
  return { first: t, final: t2, winner, rounds, ...ev, allocLabel: "Electors", totalAlloc: totalPower };
}

function dhondt(votes, seats) {
  const out = new Array(votes.length).fill(0);
  for (let s = 0; s < seats; s++) {
    let best = -1;
    let bq = -1;
    votes.forEach((v, i) => {
      const q = v / (out[i] + 1);
      if (v > 0 && q > bq) {
        bq = q;
        best = i;
      }
    });
    if (best < 0) break;
    out[best]++;
  }
  return out;
}

function partyKey(c) {
  return c.partyId || `ind:${c.id}`;
}

function platformDistance(a, b) {
  let d = 0;
  let n = 0;
  for (const k of Object.keys(a)) {
    d += Math.abs(a[k] - (b[k] ?? 0));
    n++;
  }
  return n ? d / n / 200 : 0;
}

function countProportional(ctx, groups, ballots) {
  const all = new Set(ctx.candidates.map((_, i) => i));
  const t = tally(ctx, groups, ballots, all);
  const cands = ctx.candidates;
  const keys = [...new Set(cands.map(partyKey))];
  const nat = keys.map((k) => sum(cands.map((c, i) => (partyKey(c) === k ? t.national[i] : 0))));
  const natTotal = sum(nat) || 1;
  const passes = nat.map((v) => v / natTotal >= ctx.gov.threshold);
  if (!passes.some(Boolean)) passes[argmax(nat)] = true;
  const seats = new Array(keys.length).fill(0);
  const perRegion = {};
  for (const r of ctx.nation.regions) {
    const pv = keys.map((k, pi) => (passes[pi] ? sum(cands.map((c, i) => (partyKey(c) === k ? t.regions[r.id].votes[i] : 0))) : 0));
    const s = dhondt(pv, r.power);
    s.forEach((v, pi) => (seats[pi] += v));
    // project party seats back to that party's top candidate for display
    const a = new Array(cands.length).fill(0);
    keys.forEach((k, pi) => {
      const lead = cands.map((c, i) => [c, i]).filter(([c]) => partyKey(c) === k).sort((x, y) => t.regions[r.id].votes[y[1]] - t.regions[r.id].votes[x[1]])[0];
      if (lead) a[lead[1]] += s[pi];
    });
    perRegion[r.id] = a;
  }
  const totalSeats = sum(seats);
  const majority = Math.floor(totalSeats / 2) + 1;
  const platforms = keys.map((k) => {
    const members = cands.filter((c) => partyKey(c) === k);
    const party = getParty(ctx.nation, k);
    const plat = {};
    for (const issue of Object.keys(members[0].positions)) {
      const candAvg = sum(members.map((m) => m.positions[issue])) / members.length;
      plat[issue] = party ? (party.positions[issue] + candAvg * 2) / 3 : candAvg;
    }
    return plat;
  });

  // Coalition bargaining: smallest ideological spread among minimal winning coalitions,
  // with a preference for coalitions led by the largest party.
  const withSeats = keys.map((_, i) => i).filter((i) => seats[i] > 0);
  const largest = argmax(seats);
  let best = null;
  const m = withSeats.length;
  for (let mask = 1; mask < 1 << m; mask++) {
    const members = withSeats.filter((_, j) => mask & (1 << j));
    const s = sum(members.map((i) => seats[i]));
    if (s < majority) continue;
    if (members.some((i) => s - seats[i] >= majority)) continue; // not minimal
    let spread = 0;
    for (const a of members) for (const b of members) spread = Math.max(spread, platformDistance(platforms[a], platforms[b]));
    const score = spread + 0.06 * (members.length - 1) - (members.includes(largest) ? 0.12 : 0) - 0.02 * (s - majority) / totalSeats;
    if (!best || score < best.score) best = { members, score, seats: s, spread };
  }
  if (!best) best = { members: [largest], score: 0, seats: seats[largest], spread: 0, minority: true };
  const formateur = best.members.reduce((a, b) => (seats[b] > seats[a] ? b : a));
  const premierIdx = cands.map((c, i) => [c, i]).filter(([c]) => partyKey(c) === keys[formateur]).sort((x, y) => t.national[y[1]] - t.national[x[1]])[0][1];
  const alloc = new Array(cands.length).fill(0);
  for (const a of Object.values(perRegion)) a.forEach((v, i) => (alloc[i] += v));
  const coalition = {
    parties: best.members.map((pi) => ({ key: keys[pi], name: getParty(ctx.nation, keys[pi])?.name || cands.find((c) => partyKey(c) === keys[pi]).name + " (Ind.)", seats: seats[pi] })),
    seats: best.seats,
    majority,
    totalSeats,
    minority: !!best.minority,
    spread: Math.round(best.spread * 100),
    formateur: keys[formateur],
  };
  const rounds = [{ label: "Seats", votes: roundArr(t.national), alloc: alloc.slice() }];
  return { first: t, winner: premierIdx, rounds, alloc, perRegion, allocLabel: "Seats", totalAlloc: totalSeats, coalition, partySeats: keys.map((k, i) => ({ key: k, seats: seats[i], votes: Math.round(nat[i]) })) };
}

const COUNTERS = { plurality: countPlurality, runoff: countRunoff, ranked: countRanked, electoral: countElectoral, proportional: countProportional };

// ---------- managed counts (low-integrity systems) ----------

function manipulate(ctx, result, regimeIdx, rng) {
  const gov = ctx.gov;
  const fraud = clamp(1 - gov.integrity, 0, 1);
  const n = result.candidates.length;
  const official = { national: new Array(n).fill(0), regions: {}, cast: 0 };
  for (const r of result.regions) {
    const v = r.votes.slice();
    const others = sum(v) - v[regimeIdx];
    const shift = fraud * 0.9;
    for (let i = 0; i < n; i++) if (i !== regimeIdx) v[i] *= 1 - shift;
    v[regimeIdx] += others * shift;
    const trueT = r.eligible ? r.cast / r.eligible : 0;
    const repT = clamp(trueT + fraud * (0.99 - trueT) * 0.6, 0, 0.995);
    v[regimeIdx] += Math.max(0, r.eligible * repT - r.cast);
    const rounded = roundArr(v);
    official.regions[r.id] = rounded;
    rounded.forEach((x, i) => (official.national[i] += x));
    official.cast += sum(rounded);
    const trueShare = r.cast ? r.votes[regimeIdx] / sum(r.votes) : 0;
    const repShare = sum(rounded) ? rounded[regimeIdx] / sum(rounded) : 0;
    r.unrestDelta = Math.round(Math.max(0, repShare - trueShare) * 60);
  }
  official.turnout = result.eligible ? official.cast / result.eligible : 0;
  result.official = official;

  const trueTotal = sum(result.national) || 1;
  const trueShare = result.national[regimeIdx] / trueTotal;
  const trueWinner = result.trueWinnerIdx;
  result.regimeIdx = regimeIdx;
  result.trueRegimeShare = trueShare;
  if (trueWinner === regimeIdx) {
    result.winnerIdx = regimeIdx;
    result.integrityNote = "The establishment candidate genuinely led; the official margin was inflated.";
    return;
  }
  const p = (1 - gov.protection) * clamp((0.5 - trueShare) * 3 + 0.2, 0, 1);
  if (rng.next() < p) {
    result.winnerIdx = trueWinner;
    result.integrityNote = `True support for the establishment collapsed (${(trueShare * 100).toFixed(1)}%). The leadership council forced a transfer of power.`;
    result.official = null; // the real result is published
  } else {
    result.winnerIdx = regimeIdx;
    result.integrityNote = `The establishment candidate actually lost (true share ${(trueShare * 100).toFixed(1)}%), but structural protection held. Unrest is rising.`;
  }
}

// ---------- explanations ----------

function explain(ctx, groups, winnerIdx, runnerIdx) {
  const w = ctx.candidates[winnerIdx];
  const r = ctx.candidates[runnerIdx];
  const national = {};
  const issues = {};
  const byRegion = {};
  for (const g of groups) {
    const a = utility(ctx, g, w, true);
    const b = utility(ctx, g, r, true);
    const reg = (byRegion[g.region.id] = byRegion[g.region.id] || { parts: {}, issues: {} });
    for (const k of Object.keys(FACTOR_LABELS)) {
      const d = (a[k] - b[k]) * g.cast;
      national[k] = (national[k] || 0) + d;
      reg.parts[k] = (reg.parts[k] || 0) + d;
    }
    for (const k of Object.keys(a.issues)) {
      const d = ((a.issues[k] || 0) - (b.issues[k] || 0)) * g.cast;
      issues[k] = (issues[k] || 0) + d;
      reg.issues[k] = (reg.issues[k] || 0) + d;
    }
  }
  const label = (parts, iss, positive) => {
    const sign = positive ? 1 : -1;
    const entries = Object.entries(parts).sort((x, y) => sign * (y[1] - x[1]));
    if (!entries.length || sign * entries[0][1] <= 0) return null;
    const [k] = entries[0];
    if (k === "policy" || k === "emphasis") {
      const top = Object.entries(iss).sort((x, y) => sign * (y[1] - x[1]))[0];
      if (top && sign * top[1] > 0) return `stance on ${ISSUE_BY_ID[top[0]].name}`;
    }
    return FACTOR_LABELS[k];
  };
  const regionFactor = {};
  for (const [id, reg] of Object.entries(byRegion)) regionFactor[id] = label(reg.parts, reg.issues, true);
  return { best: label(national, issues, true), worst: label(national, issues, false), regionFactor };
}

function buildNarrative(ctx, result, prev) {
  const out = [];
  const lines = [];
  const c = result.candidates;
  const total = sum(result.national) || 1;
  const w = result.winnerIdx;
  const share = (v, t) => `${((v / (t || 1)) * 100).toFixed(1)}%`;
  const headNat = result.official ? result.official.national : result.national;
  out.push(`${c[w].color}${c[w].name}§r wins with ${share(headNat[w], sum(headNat))} of the vote${result.official ? " (official)" : ""}.`);
  if (result.explain?.best) lines.push(`Decisive factor: §e${result.explain.best}§r.`);
  if (result.explain?.worst) lines.push(`Biggest liability: §c${result.explain.worst}§r.`);
  const blocRows = result.blocs.filter((b) => b.id !== "players" && sum(b.votes) > total * 0.03);
  if (blocRows.length) {
    const scored = blocRows.map((b) => [b, b.votes[w] / (sum(b.votes) || 1)]).sort((a, b) => b[1] - a[1]);
    const [best, bs] = scored[0];
    const [worst, ws] = scored[scored.length - 1];
    lines.push(`Strongest with §a${best.name}§r (${(bs * 100).toFixed(0)}%), weakest with §c${worst.name}§r (${(ws * 100).toFixed(0)}%).`);
  }
  const voting = result.regions.filter((r) => r.cast > 0);
  if (voting.length > 1) {
    const margins = voting.map((r) => {
      const s = r.votes.slice().sort((a, b) => b - a);
      return [r, (s[0] - (s[1] || 0)) / (sum(r.votes) || 1)];
    }).sort((a, b) => a[1] - b[1]);
    lines.push(`Closest race: §b${margins[0][0].name}§r, decided by ${(margins[0][1] * 100).toFixed(1)}%.`);
    const turn = voting.map((r) => [r, r.eligible ? r.cast / r.eligible : 0]).sort((a, b) => b[1] - a[1]);
    lines.push(`Turnout peaked in §b${turn[0][0].name}§r (${(turn[0][1] * 100).toFixed(0)}%), lowest in ${turn[turn.length - 1][0].name} (${(turn[turn.length - 1][1] * 100).toFixed(0)}%).`);
  }
  if (prev && prev.regions?.length) {
    const flips = [];
    for (const r of result.regions) {
      const pr = prev.regions.find((x) => x.id === r.id);
      if (!pr || pr.winner < 0 || r.winner < 0) continue;
      const before = prev.candidates[pr.winner];
      const now = c[r.winner];
      const bKey = before.partyId || before.id;
      const nKey = now.partyId || now.id;
      if (bKey !== nKey) flips.push(`${r.name} (${before.partyName || before.name} -> ${now.partyName || now.name})`);
    }
    if (flips.length) lines.push(`Flipped: ${flips.slice(0, 4).join(", ")}${flips.length > 4 ? ` +${flips.length - 4} more` : ""}.`);
  }
  if (ctx.dip.wars > 0) lines.push("Wartime mood pushed security to the top of voters' minds.");
  // Under a managed count, everything derived from the true tallies is internal only.
  return out.concat(result.official ? lines.map((l) => `§8[Internal]§r ${l}`) : lines);
}

// ---------- entry points ----------

export function candidateSummary(state, nation, ids) {
  return ids.map((id) => {
    const p = getPerson(state, id);
    const party = getParty(nation, p?.partyId);
    return { id, name: displayName(p), partyId: p?.partyId || null, partyName: party?.name || "", color: party?.color || "§f" };
  });
}

function dayMods(events, cands) {
  const day = { nat: {}, bloc: {}, region: {}, turnoutRegion: {}, turnoutBloc: {} };
  for (const e of events) {
    const id = e.cand !== undefined ? cands[e.cand].id : null;
    if (e.type === "scandal" || e.type === "debate" || e.type === "gaffe") day.nat[id] = (day.nat[id] || 0) + e.swing;
    else if (e.type === "endorse") day.bloc[`${id}:${e.blocId}`] = e.swing;
    else if (e.type === "ground") day.region[`${id}:${e.regionId}`] = e.swing;
    else if (e.regionId) day.turnoutRegion[e.regionId] = (day.turnoutRegion[e.regionId] || 1) * e.turnout;
    else if (e.blocId) day.turnoutBloc[e.blocId] = (day.turnoutBloc[e.blocId] || 1) * e.turnout;
  }
  return day;
}

export function computeElection(state, nation, election, seed, opts = {}) {
  if (election.kind === "council") return computeCouncil(state, nation, election, seed, opts);
  const rng = createRng(seed);
  const ctx = buildContext(state, nation, election.candidates);
  const gov = ctx.gov;
  const blocNames = Object.fromEntries(Object.values(BLOC_BY_ID).map((b) => [b.id, b.name]));
  const dayEvents = opts.noDayEvents ? [] : rollDayEvents(rng, nation, ctx.candidates, blocNames);
  ctx.day = dayMods(dayEvents, ctx.candidates);
  const method = COUNTERS[election.method] ? election.method : gov.method;
  const groups = simulateGroups(ctx, rng);
  const ballots = playerBallots(state, nation, election, ctx, gov);
  const counted = COUNTERS[method](ctx, groups, ballots);
  const first = counted.first;
  const n = ctx.candidates.length;

  const result = {
    id: election.id,
    no: (nation.electionCount || 0) + 1,
    kind: "popular",
    method,
    methodName: METHODS[method].name,
    gov: nation.gov,
    title: election.title,
    seed,
    candidates: candidateSummary(state, nation, election.candidates),
    national: roundArr(first.national),
    regions: nation.regions.map((r) => {
      const t = (counted.final || first).regions[r.id];
      const f = first.regions[r.id];
      return {
        id: r.id,
        name: r.name,
        power: r.power,
        votes: roundArr(f.votes),
        cast: Math.round(f.cast),
        eligible: Math.round(f.eligible),
        winner: f.cast > 0 ? argmax(t.votes) : -1,
        alloc: counted.perRegion ? counted.perRegion[r.id] : null,
      };
    }),
    blocs: Object.entries(first.blocs).map(([id, b]) => ({
      id,
      name: id === "players" ? "Player Ballots" : BLOC_BY_ID[id].name,
      votes: roundArr(b.votes),
      turnout: b.eligible ? b.cast / b.eligible : 0,
    })),
    rounds: counted.rounds,
    alloc: counted.alloc || null,
    allocLabel: counted.allocLabel || null,
    totalAlloc: counted.totalAlloc || null,
    coalition: counted.coalition || null,
    partySeats: counted.partySeats || null,
    winnerIdx: counted.winner,
    trueWinnerIdx: counted.winner,
    playerBallots: ballots.length,
    dayEvents: dayEvents.map((e) => ({ type: e.type, text: e.text, regionId: e.regionId || null })),
  };
  result.cast = sum(result.regions.map((r) => r.cast));
  result.eligible = sum(result.regions.map((r) => r.eligible));
  result.turnout = result.eligible ? result.cast / result.eligible : 0;

  if (gov.integrity < 0.999 && n > 1) {
    let regimeIdx = election.endorsedId ? ctx.candidates.findIndex((c) => c.id === election.endorsedId) : -1;
    if (regimeIdx < 0) regimeIdx = ctx.candidates.findIndex((c) => c.id === nation.leaderId);
    if (regimeIdx >= 0) manipulate(ctx, result, regimeIdx, rng);
  }

  if (opts.detail !== false && n > 1) {
    const order = result.national.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const runner = order.find(([, i]) => i !== result.winnerIdx)[1];
    result.explain = explain(ctx, groups, result.winnerIdx, runner);
    for (const r of result.regions) r.factor = result.explain.regionFactor[r.id] || null;
    result.groupShares = groups.map((g) => ({ r: g.region.id, b: g.blocId, s: softmax(g.utils).map((x) => Math.round(x * 1000) / 1000) }));
    result.narrative = buildNarrative(ctx, result, nation.history[0]);
    if (result.coalition) {
      const co = result.coalition;
      result.narrative.splice(1, 0, co.minority
        ? `No majority possible: §e${co.parties[0].name}§r forms a minority government.`
        : `Coalition: §e${co.parties.map((p) => `${p.name} (${p.seats})`).join(" + ")}§r = ${co.seats}/${co.totalSeats} seats.`);
    }
    if (result.integrityNote) result.narrative.push(`§8[Internal] ${result.integrityNote}`);
  }
  result.winnerId = result.candidates[result.winnerIdx]?.id || null;
  return result;
}
