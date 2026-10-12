// Territories, economy and situations.
import test from "node:test";
import assert from "node:assert/strict";
import { newState, createNation } from "../packs/ElectoralBP/scripts/core/state.js";
import { createRng } from "../packs/ElectoralBP/scripts/core/random.js";
import { paintSquare, fillRect, floodFill, ownerAt, transferRegion, neighbours, centroids, reassign } from "../packs/ElectoralBP/scripts/engine/territory.js";
import * as MV from "../packs/ElectoralBP/scripts/engine/mapview.js";
import { blockColor, seeThrough } from "../packs/ElectoralBP/scripts/data/blockcolors.js";
import { fontText, textWidth } from "../packs/ElectoralBP/scripts/engine/pixelfont.js";
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
  // Baza owns x 0..9, Gorgonzola x 10..19, one county per 2-column strip
  baza.regions.forEach((r, i) => fillRect(s, [i * 2, 0], [i * 2 + 1, 9], r.id));
  gorg.regions.forEach((r, i) => fillRect(s, [10 + i * 2, 0], [10 + i * 2 + 1, 9], r.id));
  return { s, baza, gorg, cands };
}

// a little world: water west of x=0, forest below z=0, everything else unexplored
const fakeTerrain = {
  color: (cx, cz) => (cx < 0 && cx >= -20 ? MV.pack(...blockColor("minecraft:water")) : cz < 0 && cz >= -10 ? MV.pack(...blockColor("minecraft:oak_leaves")) : -1),
  height: (cx, cz) => (cx < 0 && cx >= -20 ? 62 : cz < 0 && cz >= -10 ? 70 + (cx % 3) : null),
};

function drawn(s, view) {
  const frame = MV.newFrame(view);
  MV.finish(MV.drawBase(s, fakeTerrain, frame));
  return frame;
}

test("borders: paint, draw the map from every perspective, hand a city over", () => {
  const { s, baza, gorg } = twoNations();
  assert.equal(ownerAt(s, 0, 0), baza.regions[0].id);
  // Baza's land is chunks x 0..9, z 0..9 = blocks 0..159
  const view = { x: 160, z: 80, zoom: 2, mode: "political", persp: null };
  const frame = drawn(s, view);
  const at = (f, x, z) => {
    const { i, j } = MV.worldToPixel(f.view, x, z);
    return f.pix[j * MV.W + i];
  };
  assert.deepEqual(MV.worldToPixel(view, MV.pixelToWorld(view, 37, 21).x, MV.pixelToWorld(view, 37, 21).z), { i: 37, j: 21 });
  const inside = at(frame, 40, 80);
  assert.notEqual(inside, at(frame, 200, 80), "two countries in two colours");
  const fogTint = [0x1a1c22, 0x20232b].map((f) => MV.mix(MV.hex(f), MV.formatColor(baza.color), 0.6));
  assert.ok(fogTint.includes(inside), "unexplored land still shows the owner's colour");
  assert.equal(at(frame, -10, 80), MV.pack(...blockColor("minecraft:water")), "explored water shows as water");
  assert.notEqual(at(frame, 300, -4), at(frame, 330, 163), "explored forest differs from fog");
  // the border between Baza and Gorgonzola (x = 160) is drawn darker than the land either side
  const edge = at(frame, 159, 80);
  assert.ok(MV.R(edge) + MV.Gc(edge) + MV.B(edge) < MV.R(inside) + MV.Gc(inside) + MV.B(inside), "country borders are darker");
  // names and situation markers
  const deco = MV.decorations(s, frame);
  assert.ok(deco.length > 50, "country and city names are written on the map");
  setStance(s, baza.id, gorg.id, "war");
  const { sit } = spawnSituation(s, baza, createRng(1), { tplId: "plague", regionIds: [baza.regions[1].id] });
  sit.severity = 4.5;
  const mine = drawn(s, { ...view, mode: "diplomatic", persp: baza.id });
  const home = at(mine, 40, 80);
  const enemy = at(mine, 250, 80);
  assert.ok(MV.Gc(home) > MV.R(home), "home is green");
  assert.ok(MV.R(enemy) > MV.Gc(enemy), "the enemy is red");
  const front = at(mine, 159, 80);
  assert.ok([MV.hex(0xe02020), MV.hex(0x200808)].includes(front), "war front line shown");
  const markers = MV.decorations(s, mine).filter((p) => p.color === MV.hex(0xff2020));
  assert.ok(markers.length >= 4, "critical situation marker in a nation's view");
  assert.equal(MV.decorations(s, frame).filter((p) => p.color === MV.hex(0xff2020)).length, 0, "no markers in the world view");
  const terrainOnly = drawn(s, { ...view, mode: "terrain" });
  assert.equal(at(terrainOnly, -10, 80), at(frame, -10, 80));
  assert.notEqual(at(terrainOnly, 40, 80), inside, "terrain view drops the country fill");
  // the whole screen is valid glyph text
  const text = MV.compose(frame, [deco, MV.cursorPixels(90, 40, [80, 30, 100, 50])], ["PAINT BAZA", "WORLD 1:2"], ["BAZA - SOMEWHERE", "40 80"]);
  assert.ok(text.startsWith(MV.HEADER));
  const rows = text.slice(MV.HEADER.length).split("\n");
  assert.equal(rows.length, MV.H);
  for (const r of rows) {
    assert.equal(r.length, MV.W);
    for (const ch of r) {
      const c = ch.charCodeAt(0);
      assert.ok(c >> 8 >= 0xe1 && c >> 8 <= 0xf0 && (c & 15) >= 1 && (c & 15) <= 14 && ((c >> 4) & 15) >= 1 && ((c >> 4) & 15) <= 14, `bad glyph ${c.toString(16)}`);
    }
  }
  // a partial redraw after painting matches a full redraw
  paintSquare(s, 3, 3, 1, gorg.regions[0].id);
  MV.finish(MV.drawBase(s, fakeTerrain, frame, MV.chunkBox(view, 2, 2, 4, 4)));
  const full = drawn(s, view);
  assert.deepEqual([...frame.pix], [...full.pix], "incremental redraw = full redraw");
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
  // paint bucket fills the joined patch only, inside the box
  assert.equal(floodFill(s, 9, 5, `n:${gorg.id}`, () => true, [8, 0, 9, 9]), 20, "the erased strip refills");
  assert.equal(ownerAt(s, 8, 0), `n:${gorg.id}`);
  assert.equal(floodFill(s, 100, 100, baza.regions[0].id, () => true, [95, 95, 104, 104]), 100, "unclaimed land fills up to the box");
  assert.equal(floodFill(s, 0, 0, null, () => false), 0, "no rights, no fill");
});

test("map pieces: block colours, see-through plants, pixel font", () => {
  const grass = blockColor("minecraft:grass_block");
  assert.ok(grass[1] > grass[0] && grass[1] > grass[2], "grass is green");
  assert.ok(blockColor("minecraft:water")[2] > 0.6, "water is blue");
  assert.ok(blockColor("minecraft:red_wool")[0] > 0.5 && blockColor("minecraft:red_wool")[1] < 0.3, "dyed blocks take their colour");
  assert.ok(blockColor("somemod:weird_block").every((v) => v >= 0 && v <= 1), "unknown blocks get a colour");
  assert.ok(seeThrough("minecraft:short_grass") && seeThrough("minecraft:poppy") && !seeThrough("minecraft:grass_block") && !seeThrough("minecraft:oak_leaves"));
  assert.equal(fontText("Baza §cÉire"), "BAZA EIRE");
  assert.equal(textWidth("ABC"), 11);
  assert.equal(MV.glyph(MV.pack(1, 1, 1)), String.fromCharCode(0xf0ee), "white is the last page, row and column 14");
  assert.equal(MV.glyph(0), String.fromCharCode(0xe111), "black avoids the edge rows");
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
