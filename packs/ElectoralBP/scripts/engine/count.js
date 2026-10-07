// Election night. The full result is computed when polls close, then revealed one
// region (or council ballot) at a time on a timer, with a running total and a
// projection once the leader can no longer be caught. Pure logic: the caller
// broadcasts the returned lines. Survives restarts because it lives in state.

import { effectiveGov } from "../data/governments.js";
import { createRng } from "../core/random.js";
import { computeElection } from "./election.js";
import { applyResult } from "./apply.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function regionVotes(result, region) {
  return result.official ? result.official.regions[region.id] || region.votes : region.votes;
}

function candName(result, i) {
  const c = result.candidates[i];
  return `${c.color}${c.name}§r`;
}

function shareLine(result, votes, alloc = null, label = "") {
  const total = sum(votes) || 1;
  return votes
    .map((v, i) => [v, i])
    .filter(([v]) => v > 0 || alloc)
    .sort((a, b) => b[0] - a[0])
    .map(([v, i]) => `${candName(result, i)} ${pct(v / total)}${alloc ? ` §7(${alloc[i]} ${label})§r` : ""}`)
    .join(" §8|§r ");
}

/** Closes the polls, computes the result and schedules the reveal. */
export function beginCount(state, nation, seed, now) {
  const election = nation.election;
  const gov = effectiveGov(nation);
  const result = computeElection(state, nation, election, seed);
  const rng = createRng(seed ^ 0x51ed);
  const steps = [];
  if (result.kind === "council") {
    result.rounds.forEach((_, i) => steps.push({ type: "round", i }));
  } else {
    // smaller regions tend to report first, with some randomness
    const order = result.regions
      .filter((r) => r.cast > 0)
      .map((r) => [r, r.eligible * rng.range(0.4, 1.6)])
      .sort((a, b) => a[1] - b[1])
      .map(([r]) => r.id);
    for (const id of order) steps.push({ type: "region", id });
    result.rounds.slice(1).forEach((_, k) => steps.push({ type: "round", i: k + 1 }));
    if (result.coalition) steps.push({ type: "coalition" });
  }
  steps.push({ type: "final" });
  election.status = "counting";
  nation.count = {
    result,
    steps,
    step: 0,
    revealed: [],
    projected: false,
    intervalMs: Math.max(1, gov.revealSeconds) * 1000,
    nextAt: now + Math.max(1, gov.revealSeconds) * 1000,
  };
  const n = result.kind === "council" ? `${result.rounds.length} ballot round(s)` : `${steps.filter((s) => s.type === "region").length} regions`;
  return [`${nation.color}§l${nation.name}§r §6- Polls are closed for §e${result.title}§6. Counting ${n}...`];
}

// Can the current leader still be caught with the votes not yet revealed?
function projection(result, count) {
  const revealed = new Set(count.revealed);
  const rest = result.regions.filter((r) => !revealed.has(r.id));
  if (!rest.length) return null;
  const tally = new Array(result.candidates.length).fill(0);
  for (const r of result.regions) if (revealed.has(r.id)) regionVotes(result, r).forEach((v, i) => (tally[i] += v));
  if (result.method === "electoral") {
    const ev = new Array(result.candidates.length).fill(0);
    for (const r of result.regions) if (revealed.has(r.id) && r.alloc) r.alloc.forEach((v, i) => (ev[i] += v));
    const lead = ev.indexOf(Math.max(...ev));
    return ev[lead] * 2 > result.totalAlloc ? lead : null;
  }
  if (result.method === "plurality") {
    // Called like a real election night: once 40% of counties are in and the
    // runner-up would need to win the uncounted vote by 40+ points.
    if (revealed.size < result.regions.filter((r) => r.cast > 0).length * 0.4) return null;
    const order = tally.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const remaining = sum(rest.map((r) => sum(regionVotes(result, r))));
    return order.length > 1 && order[0][0] - order[1][0] > remaining * 0.4 ? order[0][1] : null;
  }
  return null; // runoffs, ranked and seats are only clear at the end
}

/**
 * Advances the count if its next reveal is due (or immediately with force).
 * Returns { lines, done, headline } - headline is { title, subtitle } for the final call.
 */
export function tickCount(state, nation, now, force = false) {
  const count = nation.count;
  if (!count || (!force && now < count.nextAt)) return { lines: [], done: false };
  const result = count.result;
  const step = count.steps[count.step++];
  count.nextAt = now + count.intervalMs;
  const tag = `${nation.color}[${nation.name}]§r`;
  const lines = [];

  if (step.type === "region") {
    const r = result.regions.find((x) => x.id === step.id);
    count.revealed.push(r.id);
    const done = count.revealed.length;
    const total = count.steps.filter((s) => s.type === "region").length;
    const votes = regionVotes(result, r);
    const w = votes.indexOf(Math.max(...votes));
    const award = r.alloc && r.alloc.some((v) => v > 0)
      ? ` §7- ${r.alloc.map((v, i) => (v ? `${result.candidates[i].name} +${v} ${result.allocLabel || ""}` : null)).filter(Boolean).join(", ")}`
      : "";
    lines.push(`${tag} §b${r.name}§r reports (${done}/${total}): ${candName(result, w)} wins${award}`);
    lines.push(`   ${shareLine(result, votes)}`);
    const run = new Array(result.candidates.length).fill(0);
    const alloc = r.alloc ? new Array(result.candidates.length).fill(0) : null;
    for (const x of result.regions) {
      if (!count.revealed.includes(x.id)) continue;
      regionVotes(result, x).forEach((v, i) => (run[i] += v));
      if (alloc && x.alloc) x.alloc.forEach((v, i) => (alloc[i] += v));
    }
    lines.push(`   §7Running total:§r ${shareLine(result, run, alloc, result.allocLabel || "")}`);
    if (!count.projected) {
      const p = projection(result, count);
      if (p !== null) {
        count.projected = true;
        lines.push(`${tag} §e§lPROJECTION:§r ${candName(result, p)} §eis projected to win.`);
      }
    }
  } else if (step.type === "round") {
    const round = result.rounds[step.i];
    lines.push(`${tag} §e${round.label}:§r ${shareLine(result, round.votes, round.alloc, result.allocLabel || "")}`);
    if (round.eliminated !== undefined && round.eliminated !== null) lines.push(`   §c${result.candidates[round.eliminated].name} is eliminated.`);
    if (round.note) lines.push(`   §7${round.note}`);
  } else if (step.type === "coalition") {
    const co = result.coalition;
    if (co.parties.length === 1 && !co.minority) lines.push(`${tag} §e${co.parties[0].name}§r holds a majority on its own (${co.seats}/${co.totalSeats} seats).`);
    else lines.push(`${tag} §eCoalition formed:§r ${co.parties.map((p) => `${p.name} (${p.seats})`).join(" + ")} = ${co.seats}/${co.totalSeats} seats${co.minority ? " §c(minority government)" : ""}`);
  } else {
    const w = result.winnerIdx;
    const nat = result.official ? result.official.national : result.national;
    const total = sum(nat) || 1;
    const gov = effectiveGov(nation);
    lines.push(`${tag} §a§lRESULT:§r ${candName(result, w)} §awins the ${result.title}!`);
    if (result.deadlock) lines.push("   §6The council deadlocked; the frontrunner was declared by acclamation.");
    if (result.kind === "popular") lines.push(`   ${shareLine(result, nat, result.alloc, result.allocLabel || "")} §7· turnout ${pct(result.official ? result.official.turnout : result.turnout)} · ${fmt(total)} votes`);
    applyResult(state, nation, result);
    nation.count = null;
    nation.election = null;
    return {
      lines,
      done: true,
      headline: { title: `${result.candidates[w].color}${result.candidates[w].name}`, subtitle: `§7wins - ${gov.leaderTitle} of ${nation.name}` },
    };
  }
  return { lines, done: false };
}

/** Runs the rest of the count instantly and returns only the final lines. */
export function finishCount(state, nation, now) {
  let last = { lines: [], done: false };
  while (nation.count) last = tickCount(state, nation, now, true);
  return last;
}
