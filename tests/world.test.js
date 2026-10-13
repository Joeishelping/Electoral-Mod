// Territories, economy and situations.
import test from "node:test";
import assert from "node:assert/strict";
import { newState, createNation } from "../packs/ElectoralBP/scripts/core/state.js";
import { createRng } from "../packs/ElectoralBP/scripts/core/random.js";
import { transferRegion } from "../packs/ElectoralBP/scripts/engine/territory.js";
import { ensureEconomy, runEconomyTurn, policyAppeal } from "../packs/ElectoralBP/scripts/engine/economy.js";
import { spawnSituation, respond, respondCounter, advanceSituations, ruleDispute, termRecord } from "../packs/ElectoralBP/scripts/engine/situations.js";
import { runNationTurn } from "../packs/ElectoralBP/scripts/engine/turns.js";
import { setStance } from "../packs/ElectoralBP/scripts/engine/diplomacy.js";
import { SCENARIOS } from "../packs/ElectoralBP/scripts/data/scenarios.js";
import { computeElection, openElection } from "../packs/ElectoralBP/scripts/engine/election.js";
import { effectiveGov } from "../packs/ElectoralBP/scripts/data/governments.js";
import { buildNation } from "./helpers.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);

function twoNations(seed = 1) {
  const s = newState();
  const { n: baza, cands } = buildNation(s, "democracy", seed, "Baza");
  const { n: gorg } = buildNation(s, "democracy", seed + 1, "Gorgonzola");
  baza.color = "§9";
  gorg.color = "§6";
  return { s, baza, gorg, cands };
}

test("a county can be handed to another country with its people", () => {
  const { s, baza, gorg } = twoNations();
  const city = baza.regions[4];
  assert.ok(transferRegion(s, city, gorg));
  assert.ok(gorg.regions.includes(city) && !baza.regions.includes(city));
  assert.ok(!transferRegion(s, city, gorg), "already theirs");
});

test("economy: taxes fill the treasury, war and debt hurt, groups notice", () => {
  const { s, baza, gorg } = twoNations();
  const rng = createRng(3);
  const e = ensureEconomy(baza);
  runEconomyTurn(s, baza, rng);
  assert.ok(e.gdp > 0 && e.treasury > 0);
  const calm = e.gdp;
  for (let i = 0; i < 6; i++) runEconomyTurn(s, baza, rng);
  setStance(s, baza.id, gorg.id, "war");
  for (let i = 0; i < 6; i++) runEconomyTurn(s, baza, rng);
  assert.ok(e.gdp < calm * 1.05, "war drags the economy");
  e.businessTax = 50;
  assert.ok(policyAppeal(baza, "capitalists") < -0.1, "business hates high business tax");
  assert.ok(policyAppeal(baza, "unions") > 0, "unions like it");
  e.alloc.military = 60;
  assert.ok(policyAppeal(baza, "military") > 0.2, "veterans love a military budget");
  const before = baza.metrics.security;
  for (let i = 0; i < 8; i++) runEconomyTurn(s, baza, rng);
  assert.ok(baza.metrics.security > before - 5, "military funding props up security");
});

test("every scenario can be spawned, answered, and resolved", () => {
  for (const tpl of SCENARIOS) {
    const { s, baza, gorg } = twoNations(4);
    baza.leaderId = Object.values(s.persons).find((p) => p.nationId === baza.id).id;
    setStance(s, baza.id, gorg.id, tpl.needs === "war" ? "war" : tpl.needs === "enemy" ? "rival" : tpl.needs === "ally" ? "alliance" : "friendly");
    const rng = createRng(7);
    const res = spawnSituation(s, baza, rng, { tplId: tpl.id });
    assert.ok(res, `${tpl.id} spawned`);
    const sit = res.sit;
    assert.doesNotMatch(sit.text, /\{|undefined/, `${tpl.id} text filled: ${sit.text}`);
    assert.doesNotMatch(sit.title, /\{|undefined/, `${tpl.id} title filled: ${sit.title}`);
    assert.equal(tpl.options.length, 3, `${tpl.id} has three options`);
    respond(s, baza, sit, 0, 5);
    for (let i = 0; i < 12 && sit.status === "active"; i++) {
      ensureEconomy(baza).turn++;
      advanceSituations(s, baza, rng);
    }
    assert.notEqual(sit.status, "active", `${tpl.id} ended`);
    if (sit.status === "ruling") {
      const d = s.disputes.find((x) => x.sitId === sit.id);
      assert.ok(d, `${tpl.id} opened a ruling`);
      ruleDispute(s, d, 0, rng);
    }
    assert.ok(baza.record.length >= 1 || sit.status === "expired", `${tpl.id} recorded`);
    for (const line of res.lines) assert.doesNotMatch(line, /undefined|NaN|\{/);
  }
});

test("scenario data only uses real groups, sliders, budget lines, county types and governments", async () => {
  const { BLOCS, REGION_TEMPLATES } = await import("../packs/ElectoralBP/scripts/data/blocs.js");
  const { METRIC_IDS } = await import("../packs/ElectoralBP/scripts/data/metrics.js");
  const { BUDGET_IDS } = await import("../packs/ElectoralBP/scripts/engine/economy.js");
  const { GOVERNMENTS } = await import("../packs/ElectoralBP/scripts/data/governments.js");
  const groups = new Set(BLOCS.map((b) => b.id));
  const types = new Set(REGION_TEMPLATES.map((t) => t.id));
  const govs = new Set(GOVERNMENTS.map((g) => g.id));
  const personKeys = new Set(["popularity", "charisma", "competence", "integrity", "funds"]);
  assert.ok(SCENARIOS.length >= 200, `plenty of scenarios (${SCENARIOS.length})`);
  for (const t of SCENARIOS) {
    for (const p of t.prefer || []) assert.ok(types.has(p), `${t.id}: county type ${p}`);
    for (const g of t.govs || []) assert.ok(govs.has(g), `${t.id}: government ${g}`);
    for (const m of Object.keys(t.metrics || {})) assert.ok(METRIC_IDS.includes(m), `${t.id}: slider ${m}`);
    for (const o of [...t.options, ...(t.counter?.options || [])]) {
      for (const g of Object.keys(o.groups)) assert.ok(groups.has(g), `${t.id}: group ${g}`);
      for (const m of Object.keys(o.fx.metrics || {})) assert.ok(METRIC_IDS.includes(m), `${t.id}: slider ${m}`);
      for (const k of Object.keys(o.fx.stock || {})) assert.ok(BUDGET_IDS.includes(k), `${t.id}: budget ${k}`);
      for (const k of [...Object.keys(o.fx.person || {}), ...Object.keys(o.fx.ruler || {})]) assert.ok(personKeys.has(k), `${t.id}: person stat ${k}`);
      if (o.fx.person) assert.ok(t.person, `${t.id}: changes a person but names none`);
    }
  }
});

test("doing nothing lets a crisis escalate and fail", () => {
  const { s, baza } = twoNations(5);
  const rng = createRng(9);
  const { sit } = spawnSituation(s, baza, rng, { tplId: "plague" });
  respond(s, baza, sit, -1, 0);
  const lines = [];
  for (let i = 0; i < 15 && sit.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    lines.push(...advanceSituations(s, baza, rng).lines);
  }
  assert.ok(sit.escalated, "it escalated");
  assert.equal(sit.grade, "F");
  assert.ok(lines.some((l) => l.includes("ESCALATION")));
});

test("Gorgonzola reacts to Baza's resource strike, and a seizure goes to a ruling", () => {
  const { s, baza, gorg } = twoNations(6);
  const rng = createRng(11);
  const { sit } = spawnSituation(s, baza, rng, { tplId: "deposit" });
  const counter = gorg.situations.find((c) => c.kind === "counter" && c.originSitId === sit.id);
  assert.ok(counter, "Gorgonzola got a counter-situation");
  const seize = 1; // "Seize the deposit"
  const lines = respondCounter(s, gorg, counter, seize, rng);
  assert.ok(lines.some((l) => l.includes("dispute")));
  const d = s.disputes.find((x) => x.status === "open" && x.kind === "contest");
  assert.ok(d && d.odds > 0 && d.odds < 1);
  const city = baza.regions.find((r) => r.id === d.regionId);
  respond(s, baza, sit, 0, 5);
  for (let i = 0; i < 8 && sit.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    advanceSituations(s, baza, rng);
  }
  assert.ok(sit.heldFx, "rewards are held until the ruling");
  ruleDispute(s, d, 1, rng); // Gorgonzola takes it
  assert.ok(gorg.regions.includes(city), "the city changed hands");
  assert.ok(sit.involvement.some((i) => i.text.includes("Gorgonzola")), "the resolution lists every side's move");
});

test("a botched crisis comes back to bite in the debate", () => {
  const { s, baza, cands } = twoNations(8);
  const rng = createRng(13);
  baza.leaderId = cands[0].id;
  const { sit } = spawnSituation(s, baza, rng, { tplId: "flood" });
  respond(s, baza, sit, -1, 0);
  for (let i = 0; i < 15 && sit.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    advanceSituations(s, baza, rng);
  }
  assert.equal(termRecord(baza)[0].grade, "F");
  let attacked = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = computeElection(s, baza, openElection(s, baza, effectiveGov(baza), { candidates: cands.map((c) => c.id) }), seed);
    if (r.dayEvents.some((e) => e.type === "attack" && e.text.includes("botched"))) attacked++;
  }
  assert.ok(attacked >= 10, `challengers attacked the record (${attacked}/20)`);
});

test("turns run the whole loop without errors", () => {
  const { s, baza, gorg } = twoNations(9);
  const rng = createRng(17);
  setStance(s, baza.id, gorg.id, "rival");
  let lines = [];
  for (let i = 0; i < 40; i++) {
    lines = lines.concat(runNationTurn(s, baza, rng, i * 1000), runNationTurn(s, gorg, rng, i * 1000));
    for (const n of [baza, gorg]) for (const sit of n.situations) if (sit.status === "active" && sit.choice === null) {
      if (sit.kind === "counter") lines.push(...respondCounter(s, n, sit, rng.int(-1, 2), rng));
      else lines.push(...respond(s, n, sit, rng.int(-1, 2), rng.int(0, 5)));
    }
    for (const d of s.disputes.filter((x) => x.status === "open")) lines.push(...ruleDispute(s, d, rng.int(0, d.choices.length - 1), rng));
  }
  for (const l of lines) assert.doesNotMatch(l, /undefined|NaN|\{city|\{other/, l);
  assert.ok(Number.isFinite(baza.economy.gdp) && Number.isFinite(baza.economy.treasury));
  assert.ok(baza.record.length + gorg.record.length > 5, "situations happened and were graded");
  JSON.stringify(s);
});

test("situations name the real counties and the other country's real cities", () => {
  const { s, baza, gorg } = twoNations(12);
  baza.regions[0].name = "Northvale";
  gorg.regions.forEach((r, i) => (r.name = ["Kesh", "Dunmar", "Orrow", "Velt", "Pyre"][i]));
  for (const tplId of ["refugees", "border_raid", "spies", "deposit"]) {
    setStance(s, baza.id, gorg.id, "rival");
    const { sit } = spawnSituation(s, baza, createRng(3), { tplId, regionIds: [baza.regions[0].id], otherId: tplId === "deposit" ? null : gorg.id });
    assert.ok(sit.text.includes("Northvale"), `${tplId}: ${sit.text}`);
    if (tplId !== "deposit") {
      assert.ok(gorg.regions.some((r) => sit.text.includes(r.name)), `${tplId} names a real Gorgonzolan city: ${sit.text}`);
      assert.ok(sit.text.includes("Gorgonzola"));
    }
  }
});

test("scenarios about people change the real candidates", () => {
  const { s, baza } = twoNations(5);
  const people = Object.values(s.persons).filter((p) => p.nationId === baza.id);
  baza.leaderId = people[0].id;
  const rng = createRng(3);
  const { sit } = spawnSituation(s, baza, rng, { tplId: "rival_scandal" });
  const rival = s.persons[sit.personId];
  assert.ok(rival && rival.id !== baza.leaderId, "a challenger, not the ruler");
  assert.ok(sit.text.includes(rival.name), `names them: ${sit.text}`);
  const before = rival.popularity;
  respond(s, baza, sit, 0, 5); // leak it to the press
  for (let i = 0; i < 12 && sit.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    advanceSituations(s, baza, rng);
  }
  assert.ok(rival.popularity < before, "the leak hurts them");
});
