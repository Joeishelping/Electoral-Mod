import test from "node:test";
import assert from "node:assert/strict";
import { newState, createNation, createRegion, createParty, createPerson } from "../packs/ElectoralBP/scripts/core/state.js";
import { computeElection, eligibleCandidates, openElection } from "../packs/ElectoralBP/scripts/engine/election.js";
import { surveyApproval } from "../packs/ElectoralBP/scripts/engine/apply.js";
import { beginCount, finishCount, tickNight, liveView } from "../packs/ElectoralBP/scripts/engine/night.js";
import { seedHistoricalLean, countyPattern } from "../packs/ElectoralBP/scripts/engine/generate.js";
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
  const mine = createRegion(s, n, { name: "Mines", population: 10000, power: 6, blocs: { workers: 80, unions: 20 } });
  const port = createRegion(s, n, { name: "Port", population: 4000, power: 3, blocs: { merchants: 70, capitalists: 30 } });
  const workers = createParty(s, n, { name: "Workers" });
  const traders = createParty(s, n, { name: "Traders" });
  const labor = createPerson(s, n, { name: "Labor", partyId: workers.id, positions: { economy: -40, welfare: 60, labor: 80, environment: -50, infrastructure: 60 }, focus: ["labor"], targets: ["workers"] });
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
  const miners = r.blocs.find((b) => b.id === "workers");
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

test("every government type plays a full election night", () => {
  for (const g of GOVERNMENTS) {
    const s = newState();
    const { n, cands } = buildNation(s, g.id, 5);
    n.leaderId = cands[0].id;
    n.termEvents = ["war", "scandal"];
    election(s, n, cands.map((c) => c.id), { endorsedId: cands[0].id });
    const opening = beginCount(s, n, 11, 0, 20);
    assert.ok(opening.length > 0);
    assert.equal(n.count.durationMs, 20 * 60000);
    let headline = null;
    let lastLineAt = 0;
    let chat = [];
    for (let t = 0; n.count && t <= 20 * 60000 + 1000; t += 1000) {
      const r = tickNight(s, n, t);
      for (const l of r.lines) assert.doesNotMatch(l, /undefined|NaN/, `${g.id}: ${l}`);
      if (r.lines.length) lastLineAt = t;
      chat = chat.concat(r.lines);
      if (r.headline) headline = r.headline;
      if (n.count) assert.ok(liveView(s, n));
    }
    assert.ok(headline, `${g.id} announced a winner`);
    assert.ok(lastLineAt >= 19 * 60000, `${g.id} night lasted the full 20 minutes`);
    assert.ok(chat.length >= 12, `${g.id} night had plenty happening (${chat.length} lines)`);
    assert.equal(n.election, null);
    assert.equal(n.history.length, 1);
    assert.equal(n.leaderId, n.history[0].winnerId);
    assert.deepEqual(n.termEvents, [], "a new term starts");
    assert.ok(surveyApproval(s, n, 1));
    JSON.stringify(s);
  }
});

test("each government type has its own election-night flavor", () => {
  const signature = { democracy: "CALL", parliament: "declared", singleparty: "Bulletin", monarchy: "swears fealty", clan: "raises its banner", theocracy: "smoke", junta: "pledges its troops", guild: "shares" };
  for (const [gov, word] of Object.entries(signature)) {
    let seen = false;
    for (let seed = 1; seed <= 4 && !seen; seed++) {
      const s = newState();
      const { n, cands } = buildNation(s, gov, seed);
      election(s, n, cands.map((c) => c.id), { endorsedId: cands[0].id });
      beginCount(s, n, seed, 0, 20);
      const chat = [];
      for (let t = 0; n.count; t += 5000) chat.push(...tickNight(s, n, t).lines);
      seen = chat.some((l) => l.includes(word));
    }
    assert.ok(seen, `${gov} night mentions "${word}"`);
  }
});

test("lead changes, calls, race calls, recounts and exit polls all happen", () => {
  const seen = { lead: 0, call: 0, race: 0, recount: 0, exit: 0 };
  for (let seed = 1; seed <= 30; seed++) {
    const s = newState();
    const { n, cands } = buildNation(s, "democracy", seed);
    election(s, n, cands.map((c) => c.id));
    beginCount(s, n, seed * 31, 0, 20);
    for (let t = 0; n.count; t += 10000) {
      for (const l of tickNight(s, n, t).lines) {
        if (l.includes("LEAD CHANGE")) seen.lead++;
        if (l.includes("CALL:")) seen.call++;
        if (l.includes("RACE CALL")) seen.race++;
        if (l.includes("recount is ordered")) seen.recount++;
        if (l.includes("Exit poll")) seen.exit++;
      }
    }
  }
  for (const [k, v] of Object.entries(seen)) assert.ok(v > 0, `${k} happened (${v})`);
});

test("race calls are never wrong", () => {
  for (let seed = 1; seed <= 25; seed++) {
    for (const gov of ["democracy", "singleparty", "guild"]) {
      const s = newState();
      const { n, cands } = buildNation(s, gov, seed);
      election(s, n, cands.map((c) => c.id), { endorsedId: cands[0].id });
      beginCount(s, n, seed, 0, 20);
      const winner = n.count.result.candidates[n.count.result.winnerIdx].name;
      for (let t = 0; n.count; t += 10000) {
        for (const l of tickNight(s, n, t).lines) {
          if (l.includes("RACE CALL") || l.includes("ANNOUNCES VICTORY")) assert.ok(l.includes(winner), `${gov}: ${l} (winner ${winner})`);
        }
      }
    }
  }
});

test("counties remember who they voted for", () => {
  const s = newState();
  const { n, cands } = buildNation(s, "democracy", 12);
  seedHistoricalLean(n);
  const workers = n.parties[0];
  const mining = n.regions[2];
  assert.ok(mining.lean[workers.id] > 0, "a mining county starts out leaning toward the workers' party");
  for (let i = 0; i < 3; i++) {
    election(s, n, cands.map((c) => c.id));
    beginCount(s, n, 100 + i, 0, 1);
    finishCount(s, n);
  }
  assert.equal(mining.history.length, 3);
  assert.ok(countyPattern(n, mining).length > 0);
});

test("term events change the outcome", () => {
  const shares = [];
  for (const events of [["boom", "reform"], ["recession", "scandal", "famine"]]) {
    const s = newState();
    const { n, cands } = buildNation(s, "democracy", 4);
    n.leaderId = cands[0].id;
    n.termEvents = events;
    const r = computeElection(s, n, election(s, n, cands.map((c) => c.id)), 9, { noDayEvents: true });
    shares.push(r.national[0] / sum(r.national));
  }
  assert.ok(shares[0] - shares[1] > 0.05, `good term beats a bad one: ${shares}`);
});

test("skipping election night gives the same winner", () => {
  const s = newState();
  const { n, cands } = buildNation(s, "democracy", 9);
  election(s, n, cands.map((c) => c.id));
  beginCount(s, n, 21, 0);
  const expected = n.count.result.winnerId;
  const res = finishCount(s, n);
  assert.ok(res.done);
  assert.ok(res.lines[0].includes("RESULT"));
  assert.equal(n.history[0].winnerId, expected);
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

test("the people you choose matter: traits, running mates and backers", async () => {
  const { groupOpinions } = await import("../packs/ElectoralBP/scripts/engine/dossier.js");
  const s = newState();
  const { n, cands } = buildNation(s, "democracy", 3);
  const ada = cands[0];
  const opinion = (g) => groupOpinions(s, n, ada.id).find((o) => o.blocId === g)?.approval ?? 0;
  const vetsBefore = opinion("patriots");
  ada.traits = ["warhero"];
  assert.ok(opinion("patriots") > vetsBefore + 0.05, "a War Hero wins over patriots");
  const relBefore = opinion("religious");
  ada.traits = ["libertine"];
  assert.ok(opinion("religious") < relBefore - 0.05, "a Free Spirit loses religious voters");
  ada.traits = [];
  const unionsBefore = opinion("unions");
  const bizBefore = opinion("capitalists");
  ada.backers = ["capitalists"];
  assert.ok(opinion("capitalists") > bizBefore, "backers' members rally");
  assert.ok(opinion("unions") < unionsBefore, "their rivals resent it");
  ada.backers = [];
  const mate = cands[2]; // devout, squeaky clean
  const relNoMate = opinion("religious");
  ada.runningMateId = mate.id;
  assert.ok(opinion("religious") > relNoMate, "a devout running mate helps with religious voters");
  const ops = groupOpinions(s, n, ada.id);
  assert.ok(ops.length > 5 && ops.every((o) => Array.isArray(o.reasons)));
  assert.ok(ops.some((o) => o.reasons.some((r) => r.text.startsWith("Running mate"))), "the dossier explains the running mate's effect");
});

test("corrupt candidates get caught more often", () => {
  let corrupt = 0;
  let clean = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const s = newState();
    const { n, cands } = buildNation(s, "democracy", seed);
    cands[0].traits = ["corrupt"];
    cands[1].traits = ["clean"];
    const r = computeElection(s, n, election(s, n, cands.map((c) => c.id)), seed);
    for (const e of r.dayEvents) {
      if (e.type === "scandal" && e.text.includes("Ada")) corrupt++;
      if (e.type === "scandal" && e.text.includes("Bram")) clean++;
    }
  }
  assert.ok(corrupt > clean * 3, `corrupt ${corrupt} vs clean ${clean}`);
});
