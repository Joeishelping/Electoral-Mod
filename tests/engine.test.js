import test from "node:test";
import assert from "node:assert/strict";
import { newState, createNation, createRegion, createParty, createPerson } from "../packs/ElectoralBP/scripts/core/state.js";
import { computeElection, eligibleCandidates, openElection } from "../packs/ElectoralBP/scripts/engine/election.js";
import { surveyApproval } from "../packs/ElectoralBP/scripts/engine/apply.js";
import { beginCount, finishCount, tickCount } from "../packs/ElectoralBP/scripts/engine/count.js";
import { runForecastSync } from "../packs/ElectoralBP/scripts/engine/forecast.js";
import { effectiveGov, GOVERNMENTS } from "../packs/ElectoralBP/scripts/data/governments.js";
import { setStance } from "../packs/ElectoralBP/scripts/engine/diplomacy.js";
import { buildNation } from "./helpers.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);
const election = (state, nation, ids, extra = {}) => openElection(state, nation, effectiveGov(nation), { candidates: ids, ...extra });

// Two counties where the right answer is obvious.
function toyNation() {
  const s = newState();
  const n = createNation(s, { name: "Toy", gov: "democracy" });
  const mine = createRegion(s, n, { name: "Mines", population: 10000, power: 6, blocs: { miners: 80, laborers: 20 } });
  const port = createRegion(s, n, { name: "Port", population: 4000, power: 3, blocs: { merchants: 70, sailors: 30 } });
  const workers = createParty(s, n, { name: "Workers" });
  const traders = createParty(s, n, { name: "Traders" });
  const labor = createPerson(s, n, { name: "Labor", partyId: workers.id, positions: { economy: -40, welfare: 60, labor: 80, environment: -50, infrastructure: 60 }, focus: ["labor"], targets: ["miners"] });
  const trade = createPerson(s, n, { name: "Trade", partyId: traders.id, positions: { economy: 70, welfare: -30, labor: -50, trade: 80, infrastructure: 40, settlers: 30 }, focus: ["trade"], targets: ["merchants"] });
  return { s, n, mine, port, labor, trade };
}

test("voter groups follow their interests", () => {
  const { s, n, mine, port, labor, trade } = toyNation();
  const r = computeElection(s, n, election(s, n, [labor.id, trade.id]), 42);
  const reg = (id) => r.regions.find((x) => x.id === id);
  assert.equal(reg(mine.id).winner, 0, "miners back the labor candidate");
  assert.equal(reg(port.id).winner, 1, "the port backs the trade candidate");
  assert.equal(r.winnerIdx, 0, "bigger mining county carries the electors");
  const miners = r.blocs.find((b) => b.id === "miners");
  assert.ok(miners.votes[0] / sum(miners.votes) > 0.75);
});

test("performance sliders swing the officeholder", () => {
  const shares = [];
  for (const level of [10, 90]) {
    const { s, n, labor, trade } = toyNation();
    n.leaderId = labor.id;
    for (const k of Object.keys(n.metrics)) n.metrics[k] = level;
    const r = computeElection(s, n, election(s, n, [labor.id, trade.id]), 7);
    shares.push(r.national[0] / sum(r.national));
  }
  assert.ok(shares[1] - shares[0] > 0.1, `good record should help: ${shares}`);
});

test("war rallies voters behind the officeholder", () => {
  const { s, n, labor, trade } = toyNation();
  n.leaderId = labor.id;
  const peace = computeElection(s, n, election(s, n, [labor.id, trade.id]), 3);
  setStance(s, n.id, createNation(s, { name: "Enemy" }).id, "war");
  const war = computeElection(s, n, election(s, n, [labor.id, trade.id]), 3);
  assert.ok(war.national[0] / sum(war.national) > peace.national[0] / sum(peace.national));
});

test("unnamed candidates never reach the ballot", () => {
  const s = newState();
  const { n } = buildNation(s, "democracy");
  assert.equal(eligibleCandidates(s, n).length, 3);
});

test("every voting style counts live from start to finish", () => {
  for (const g of GOVERNMENTS) {
    const s = newState();
    const { n, cands } = buildNation(s, g.id, 5);
    n.leaderId = cands[0].id;
    election(s, n, cands.map((c) => c.id), { endorsedId: cands[0].id });
    const opening = beginCount(s, n, 11, 0);
    assert.ok(opening[0].includes("Polls are closed"));
    let t = 0;
    let steps = 0;
    let headline = null;
    while (n.count) {
      assert.deepEqual(tickCount(s, n, t).lines, [], "nothing is revealed before it is due");
      t += n.count.intervalMs;
      const r = tickCount(s, n, t);
      assert.ok(r.lines.length > 0);
      for (const l of r.lines) assert.doesNotMatch(l, /undefined|NaN/);
      if (r.headline) headline = r.headline;
      steps++;
    }
    assert.ok(steps >= 2, `${g.id} revealed in steps`);
    assert.ok(headline, `${g.id} announced a winner`);
    assert.equal(n.election, null);
    assert.equal(n.history.length, 1);
    assert.equal(n.leaderId, n.history[0].winnerId);
    assert.ok(surveyApproval(s, n, 1));
    const e2 = election(s, n, cands.map((c) => c.id));
    const f = runForecastSync(s, n, e2, 20);
    assert.ok(Math.abs(sum(f.winProb) - 1) < 1e-9);
    JSON.stringify(s);
  }
});

test("skipping the count gives the same winner", () => {
  const s = newState();
  const { n, cands } = buildNation(s, "democracy", 9);
  election(s, n, cands.map((c) => c.id));
  beginCount(s, n, 21, 0);
  const expected = n.count.result.winnerId;
  const res = finishCount(s, n, 0);
  assert.ok(res.done);
  assert.equal(n.history[0].winnerId, expected);
});

test("the projection is called before the last county reports", () => {
  let called = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = newState();
    const { n, cands } = buildNation(s, "singleparty", seed);
    n.leaderId = cands[0].id;
    election(s, n, cands.map((c) => c.id), { endorsedId: cands[0].id });
    beginCount(s, n, seed, 0);
    let t = 0;
    while (n.count) {
      t += 1e6;
      const r = tickCount(s, n, t);
      if (r.lines.some((l) => l.includes("PROJECTION"))) called++;
    }
  }
  assert.ok(called > 10, `managed elections are called early (${called}/20)`);
});

test("managed elections publish inflated numbers but keep the truth", () => {
  const s = newState();
  const { n, cands } = buildNation(s, "singleparty", 21);
  n.leaderId = cands[0].id;
  const r = computeElection(s, n, election(s, n, cands.map((c) => c.id), { endorsedId: cands[0].id }), 4);
  assert.ok(r.official, "official figures exist");
  assert.ok(r.official.national[0] / sum(r.official.national) > r.national[0] / sum(r.national));
  assert.ok(r.turnout > 0.85, "enforced turnout");
});

test("parliament forms a majority government", () => {
  const s = newState();
  const { n, cands } = buildNation(s, "parliament", 8);
  const r = computeElection(s, n, election(s, n, cands.map((c) => c.id)), 5);
  assert.equal(sum(r.alloc), sum(n.regions.map((x) => x.power)));
  if (!r.coalition.minority) assert.ok(r.coalition.seats >= r.coalition.majority);
});

test("results are reproducible from the seed", () => {
  const s = newState();
  const { n, cands } = buildNation(s, "democracy", 3);
  const e = election(s, n, cands.map((c) => c.id));
  assert.deepEqual(computeElection(s, n, e, 99).national, computeElection(s, n, e, 99).national);
});

test("player ballots are counted in their county", () => {
  const { s, n, mine, labor, trade } = toyNation();
  n.settings.ballotWeight = 1000;
  const e = election(s, n, [labor.id, trade.id]);
  const base = computeElection(s, n, e, 1);
  e.ballots.Alex = { candidateId: trade.id, regionId: mine.id };
  const withBallot = computeElection(s, n, e, 1);
  assert.equal(withBallot.regions.find((r) => r.id === mine.id).votes[1] - base.regions.find((r) => r.id === mine.id).votes[1], 1000);
});
