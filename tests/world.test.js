// Territories, economy and situations.
import test from "node:test";
import assert from "node:assert/strict";
import { newState, createNation } from "../packs/ElectoralBP/scripts/core/state.js";
import { createRng } from "../packs/ElectoralBP/scripts/core/random.js";
import { paintSquare, fillRect, computeCells, ownerAt, transferRegion, neighbours, centroids, reassign } from "../packs/ElectoralBP/scripts/engine/territory.js";
import { planTable } from "../packs/ElectoralBP/scripts/engine/wartable.js";
import { fillBlock, edgeBlock, FRONT_BLOCK, MARKERS, TERRAIN, UNKNOWN_BLOCK, classify } from "../packs/ElectoralBP/scripts/data/mapblocks.js";
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
  // Baza owns x 0..9, Gorgonzola x 10..19, one county per 2-column strip
  baza.regions.forEach((r, i) => fillRect(s, [i * 2, 0], [i * 2 + 1, 9], r.id));
  gorg.regions.forEach((r, i) => fillRect(s, [10 + i * 2, 0], [10 + i * 2 + 1, 9], r.id));
  return { s, baza, gorg, cands };
}

test("borders: paint, render from every perspective, hand a city over", () => {
  const { s, baza, gorg } = twoNations();
  assert.equal(ownerAt(s, 0, 0), baza.regions[0].id);
  const table = { x0: 100, y: 63, z0: 200, w: 24, h: 10, cx: 10, cz: 5, zoom: 1, persp: null };
  const terrain = { "-2,0": classify("minecraft:water", 62), "-2,1": classify("minecraft:oak_leaves", 70) };
  const world = planTable(s, terrain, table);
  assert.equal(world.floor.length, 240);
  const blocks = new Set(world.floor);
  assert.ok(blocks.has(fillBlock(baza.color)) && blocks.has(edgeBlock(baza.color)), "countries in their own colour, with outlines");
  assert.ok(blocks.has(TERRAIN.w.block) && blocks.has(TERRAIN.f.block), "explored terrain shows as water and forest");
  assert.ok(blocks.has(UNKNOWN_BLOCK), "unexplored land is fogged");
  assert.ok(world.top.every((t) => t === null), "the world view has no situation markers");
  assert.ok(world.labels.some((l) => l.text.includes("BAZA")) && world.labels.some((l) => l.text.includes(baza.regions[0].name)), "country and city labels");
  setStance(s, baza.id, gorg.id, "war");
  const { sit } = spawnSituation(s, baza, createRng(1), { tplId: "plague", regionIds: [baza.regions[1].id] });
  sit.severity = 4.5;
  const mine = planTable(s, terrain, { ...table, persp: baza.id });
  assert.ok(mine.floor.includes(fillBlock("§a")), "home is green");
  assert.ok(mine.floor.includes(fillBlock("§c")) || mine.floor.includes(edgeBlock("§c")), "the enemy is red");
  assert.ok(mine.floor.includes(FRONT_BLOCK), "war front line shown");
  assert.ok(mine.top.includes(MARKERS[2]), "critical situation marker in a nation's view");
  const zoomed = planTable(s, terrain, { ...table, zoom: 4 });
  assert.ok(zoomed.floor.some((b) => b === fillBlock(baza.color) || b === edgeBlock(baza.color)), "zoomed out still shows land");
  assert.equal(computeCells(s, { cx: 10, cz: 5, zoom: 1, w: 24, h: 10 })[5][4].owner, ownerAt(s, 2, 5));
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
