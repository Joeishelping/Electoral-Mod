// Monte Carlo polling: re-run the whole election many times with different random
// shocks to estimate win probabilities, expected vote shares and how safe each
// region is. Written as a generator so Minecraft can spread it across ticks.

import { computeElection } from "./election.js";
import { hashSeed } from "../core/random.js";

export function* forecastJob(state, nation, election, sims, out) {
  const n = election.candidates.length;
  out.sims = 0;
  out.wins = new Array(n).fill(0);
  out.share = new Array(n).fill(0);
  out.shareSq = new Array(n).fill(0);
  out.alloc = new Array(n).fill(0);
  out.regions = {};
  out.officialShare = null;
  const base = hashSeed("forecast", election.id, nation.electionCount, Object.keys(election.ballots || {}).length);
  for (let s = 0; s < sims; s++) {
    const r = computeElection(state, nation, election, base + s * 7919, { detail: false });
    const total = r.national.reduce((a, b) => a + b, 0) || 1;
    if (r.winnerIdx >= 0) out.wins[r.winnerIdx]++;
    r.national.forEach((v, i) => {
      out.share[i] += v / total;
      out.shareSq[i] += (v / total) ** 2;
    });
    if (r.alloc) r.alloc.forEach((v, i) => (out.alloc[i] += v));
    if (r.official) {
      out.officialShare = out.officialShare || new Array(n).fill(0);
      const ot = r.official.national.reduce((a, b) => a + b, 0) || 1;
      r.official.national.forEach((v, i) => (out.officialShare[i] += v / ot));
    }
    for (const reg of r.regions) {
      const row = (out.regions[reg.id] = out.regions[reg.id] || { name: reg.name, wins: new Array(n).fill(0), share: new Array(n).fill(0) });
      if (reg.winner >= 0) row.wins[reg.winner]++;
      const t = reg.votes.reduce((a, b) => a + b, 0) || 1;
      reg.votes.forEach((v, i) => (row.share[i] += v / t));
    }
    out.allocLabel = r.allocLabel;
    out.sims++;
    yield;
  }
  const k = out.sims || 1;
  out.winProb = out.wins.map((w) => w / k);
  out.meanShare = out.share.map((v) => v / k);
  out.sdShare = out.shareSq.map((v, i) => Math.sqrt(Math.max(0, v / k - out.meanShare[i] ** 2)));
  out.meanAlloc = out.alloc.map((v) => v / k);
  if (out.officialShare) out.officialShare = out.officialShare.map((v) => v / k);
  for (const row of Object.values(out.regions)) {
    row.share = row.share.map((v) => v / k);
    const lead = row.wins.indexOf(Math.max(...row.wins));
    const p = row.wins[lead] / k;
    row.lead = lead;
    row.prob = p;
    row.rating = p >= 0.95 ? "Safe" : p >= 0.8 ? "Likely" : p >= 0.6 ? "Lean" : "Toss-up";
  }
  out.done = true;
}

export function runForecastSync(state, nation, election, sims) {
  const out = {};
  for (const _ of forecastJob(state, nation, election, sims, out));
  return out;
}
