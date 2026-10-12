// Territories, economy and situations.
import test from "node:test";
import assert from "node:assert/strict";
import { newState, createNation } from "../packs/ElectoralBP/scripts/core/state.js";
import { createRng } from "../packs/ElectoralBP/scripts/core/random.js";
import { paintSquare, fillRect, renderMap, ownerAt, transferRegion, neighbours, centroids, reassign } from "../packs/ElectoralBP/scripts/engine/territory.js";
import { ensureEconomy, runEconomyTurn, policyAppeal } from "../packs/ElectoralBP/scripts/engine/economy.js";
import { spawnSituation, respond, respondCounter, advanceSituations, ruleDispute, termRecord } from "../packs/ElectoralBP/scripts/engine/situations.js";
import { runNationTurn } from "../packs/ElectoralBP/scripts/engine/turns.js";
import { setStance } from "../packs/ElectoralBP/scripts/engine/diplomacy.js";
import { SCENARIOS } from "../packs/ElectoralBP/scripts/data/scenarios.js";
import { computeElection, openElection } from "../packs/ElectoralBP/scripts/engine/election.js";
import { effectiveGov } from "../packs/ElectoralBP/scripts/data/governments.js";
import { GLYPH, tile } from "../packs/ElectoralBP/scripts/data/glyphs.js";
import { buildNation } from "./helpers.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);

function twoNations(seed = 1) {
  const s = newState();
  const { n: baza, cands } = buildNation(s, "democracy", seed, "Baza");
  const { n: gorg } = buildNation(s, "democracy", seed + 1, "Gorgonzola");
  // Baza owns x 0..9, Gorgonzola x 10..19, one county per 2-column strip
  baza.regions.forEach((r, i) => fillRect(s, [i * 2, 0], [i * 2 + 1, 9], r.id));
  gorg.regions.forEach((r, i) => fillRect(s, [10 + i * 2, 0], [10 + i * 2 + 1, 9], r.id));
  return { s, baza, gorg, cands };
}

test("borders: paint, render from every perspective, hand a city over", () => {
  const { s, baza, gorg } = twoNations();
  assert.equal(ownerAt(s, 0, 0), baza.regions[0].id);
  const view = { cx: 10, cz: 5, zoom: 1, w: 24, h: 10, persp: null };
  const world = renderMap(s, view);
  assert.equal(world.length, 10);
  assert.ok(world.every((row) => [...row].length === 24));
  assert.ok(world[0].includes(tile(baza.color)) || world[0].includes(tile(baza.color, true)), "neutral view uses nation colours");
  setStance(s, baza.id, gorg.id, "war");
  const mine = renderMap(s, { ...view, persp: baza.id, markers: { [baza.regions[1].id]: 2 } });
  assert.ok(mine.join("").includes(tile("§a")) || mine.join("").includes(tile("§a", true)), "home is green");
  assert.ok(mine.join("").includes(GLYPH.front), "war front line shown");
  assert.ok(mine.join("").includes(GLYPH.situation[2]), "situation marker shown in a nation's view");
  assert.ok(!world.join("").includes(GLYPH.situation[2]), "the neutral world view has no markers");
  const zoomed = renderMap(s, { ...view, zoom: 4 });
  assert.ok(zoomed.join("").replaceAll(GLYPH.wild, "").length > 0, "zoomed out still shows land");
  // neighbours: last Baza county touches first Gorgonzola county
  assert.ok(neighbours(s, baza.regions[4].id).has(gorg.regions[0].id));
  // hand Baza's border county to Gorgonzola - its land goes with it
  const city = baza.regions[4];
  assert.ok(transferRegion(s, city, gorg));
  assert.ok(gorg.regions.includes(city) && !baza.regions.includes(city));
  assert.equal(ownerAt(s, 9, 5), city.id);
  const c = centroids(s);
  assert.ok(c[city.id]);
  assert.equal(reassign(s, city.id, null), 20, "erasing a county clears its land");
  assert.equal(paintSquare(s, 50, 50, 1, `n:${baza.id}`), 9);
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
    setStance(s, baza.id, gorg.id, tpl.needs === "war" ? "war" : tpl.needs === "enemy" ? "rival" : "friendly");
    const rng = createRng(7);
    const res = spawnSituation(s, baza, rng, { tplId: tpl.id });
    assert.ok(res, `${tpl.id} spawned`);
    const sit = res.sit;
    assert.doesNotMatch(sit.text, /\{|undefined/, `${tpl.id} text filled: ${sit.text}`);
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
