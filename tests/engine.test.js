import test from "node:test";
import assert from "node:assert/strict";
import { newState, createNation, createRegion, createParty, createPerson } from "../packs/ElectoralBP/scripts/core/state.js";
import { generateNation } from "../packs/ElectoralBP/scripts/engine/generate.js";
import { computeElection, eligibleCandidates, openElection } from "../packs/ElectoralBP/scripts/engine/election.js";
import { applyResult, applySuccession, surveyApproval } from "../packs/ElectoralBP/scripts/engine/apply.js";
import { computeSuccession, lineOfSuccession } from "../packs/ElectoralBP/scripts/engine/succession.js";
import { runForecastSync } from "../packs/ElectoralBP/scripts/engine/forecast.js";
import { effectiveGov, GOVERNMENTS } from "../packs/ElectoralBP/scripts/data/governments.js";
import { setStance } from "../packs/ElectoralBP/scripts/engine/diplomacy.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);

function election(state, nation, ids, extra = {}) {
  return openElection(state, nation, effectiveGov(nation), { candidates: ids, ...extra });
}

// A two-region toy nation where the right answer is obvious.
function toyNation() {
  const s = newState();
  const n = createNation(s, { name: "Toy", gov: "democracy" });
  const mine = createRegion(s, n, { name: "Mines", population: 10000, power: 6, blocs: { miners: 80, laborers: 20 } });
  const port = createRegion(s, n, { name: "Port", population: 4000, power: 3, blocs: { merchants: 70, sailors: 30 } });
  const workers = createParty(s, n, { name: "Workers", positions: {} });
  const traders = createParty(s, n, { name: "Traders", positions: {} });
  const labor = createPerson(s, n, { name: "Labor Candidate", partyId: workers.id, positions: { economy: -40, welfare: 60, labor: 80, military: 0, order: 0, tradition: 0, environment: -50, trade: -10, expansion: 0, infrastructure: 60, authority: 0, settlers: 0 }, focus: ["labor"], targets: ["miners"] });
  const trade = createPerson(s, n, { name: "Trade Candidate", partyId: traders.id, positions: { economy: 70, welfare: -30, labor: -50, military: 0, order: 20, tradition: 0, environment: 0, trade: 80, expansion: 0, infrastructure: 40, authority: 0, settlers: 30 }, focus: ["trade"], targets: ["merchants"] });
  return { s, n, mine, port, labor, trade };
}

test("voter groups follow their interests", () => {
  const { s, n, mine, port, labor, trade } = toyNation();
  const r = computeElection(s, n, election(s, n, [labor.id, trade.id]), 42);
  const reg = (id) => r.regions.find((x) => x.id === id);
  assert.equal(reg(mine.id).winner, 0, "miners back the labor candidate");
  assert.equal(reg(port.id).winner, 1, "the port backs the trade candidate");
  assert.equal(r.winnerIdx, 0, "bigger mining region carries the electors");
  assert.equal(r.alloc[0], 6);
  const miners = r.blocs.find((b) => b.id === "miners");
  assert.ok(miners.votes[0] / sum(miners.votes) > 0.75);
});

test("performance sliders swing the incumbent", () => {
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

test("war raises the salience of security and rallies the incumbent", () => {
  const { s, n, labor, trade } = toyNation();
  n.leaderId = labor.id;
  const peace = computeElection(s, n, election(s, n, [labor.id, trade.id]), 3);
  const other = createNation(s, { name: "Enemy" });
  setStance(s, n.id, other.id, "war");
  const war = computeElection(s, n, election(s, n, [labor.id, trade.id]), 3);
  assert.ok(war.national[0] / sum(war.national) > peace.national[0] / sum(peace.national));
});

test("every government type runs a full cycle", () => {
  for (const g of GOVERNMENTS) {
    const s = newState();
    const n = generateNation(s, { gov: g.id, seed: 5, regions: 5 });
    const gov = effectiveGov(n);
    assert.ok(n.leaderId, `${g.id} has a leader`);
    assert.equal(Object.keys(n.cabinet).length, gov.offices.length, `${g.id} cabinet filled`);
    if (gov.selection !== "hereditary") {
      const ids = eligibleCandidates(s, n, gov).slice(0, 4).map((p) => p.id);
      const e = election(s, n, ids);
      const r = computeElection(s, n, e, 11);
      assert.ok(r.winnerId, `${g.id} produced a winner`);
      assert.ok(r.narrative.length >= 1);
      applyResult(s, n, r);
      assert.equal(n.leaderId, r.winnerId);
      assert.equal(n.history.length, 1);
      const f = runForecastSync(s, n, election(s, n, ids), 20);
      assert.ok(Math.abs(sum(f.winProb) - 1) < 1e-9);
    }
    const line = lineOfSuccession(s, n);
    const succ = computeSuccession(s, n, "death", 9);
    const before = n.leaderId;
    applySuccession(s, n, succ, "death");
    assert.equal(s.persons[before].alive, false);
    if (succ.winnerId) assert.equal(n.leaderId, succ.winnerId);
    assert.ok(line.length > 0 || gov.succession === "council", `${g.id} has a line of succession`);
    assert.ok(surveyApproval(s, n, 1) || !n.leaderId);
    JSON.stringify(s);
  }
});

test("monarchy primogeniture passes the crown to the eldest child", () => {
  const s = newState();
  const n = generateNation(s, { gov: "monarchy", seed: 77, regions: 4 });
  n.settings.confirmation = false;
  const kids = Object.values(s.persons).filter((p) => p.parentId === n.leaderId).sort((a, b) => b.age - a.age);
  const line = lineOfSuccession(s, n);
  assert.equal(line[0].person.id, kids[0].id);
  // the eldest child's own child comes before the ruler's younger children
  const grandchild = Object.values(s.persons).find((p) => p.parentId === kids[0].id);
  assert.equal(line[1].person.id, grandchild.id);
  const r = computeSuccession(s, n, "death", 1);
  assert.equal(r.winnerId, kids[0].id);
});

test("managed elections publish inflated numbers but keep the truth internally", () => {
  const s = newState();
  const n = generateNation(s, { gov: "singleparty", seed: 21, regions: 5 });
  const ids = eligibleCandidates(s, n, effectiveGov(n)).slice(0, 3).map((p) => p.id);
  if (!ids.includes(n.leaderId)) ids[0] = n.leaderId;
  const r = computeElection(s, n, election(s, n, ids, { endorsedId: n.leaderId }), 4);
  const idx = r.candidates.findIndex((c) => c.id === n.leaderId);
  if (r.official) {
    assert.ok(r.official.national[idx] / sum(r.official.national) > r.national[idx] / sum(r.national));
    assert.ok(r.official.turnout >= r.turnout);
  }
  assert.ok(r.turnout > 0.85, "enforced turnout");
});

test("parliament forms a majority coalition", () => {
  const s = newState();
  const n = generateNation(s, { gov: "parliament", seed: 8, regions: 8 });
  const gov = effectiveGov(n);
  const ids = n.parties.map((p) => eligibleCandidates(s, n, gov).find((c) => c.partyId === p.id).id);
  const r = computeElection(s, n, election(s, n, ids), 5);
  assert.equal(sum(r.alloc), sum(n.regions.map((x) => x.power)));
  if (!r.coalition.minority) assert.ok(r.coalition.seats >= r.coalition.majority);
  applyResult(s, n, r);
  const coalitionParties = new Set(r.coalition.parties.map((p) => p.key));
  const ministers = Object.values(n.cabinet).map((id) => s.persons[id]);
  assert.ok(ministers.filter((m) => coalitionParties.has(m.partyId)).length >= ministers.length / 2);
});

test("results are reproducible from the seed", () => {
  const s = newState();
  const n = generateNation(s, { gov: "democracy", seed: 3, regions: 6 });
  const ids = eligibleCandidates(s, n, effectiveGov(n)).slice(0, 3).map((p) => p.id);
  const e = election(s, n, ids);
  assert.deepEqual(computeElection(s, n, e, 99).national, computeElection(s, n, e, 99).national);
});

test("player ballots are counted in their region", () => {
  const { s, n, mine, labor, trade } = toyNation();
  n.settings.ballotWeight = 1000;
  const e = election(s, n, [labor.id, trade.id]);
  const base = computeElection(s, n, e, 1);
  e.ballots.Alex = { candidateId: trade.id, regionId: mine.id };
  const withBallot = computeElection(s, n, e, 1);
  const a = base.regions.find((r) => r.id === mine.id).votes[1];
  const b = withBallot.regions.find((r) => r.id === mine.id).votes[1];
  assert.equal(b - a, 1000);
});
