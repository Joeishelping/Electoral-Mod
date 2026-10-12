// Drives every Board Table menu with random clicks and inputs, checking nothing
// throws, form arguments are valid and no text shows "undefined"/"NaN". Also runs
// the once-a-second ticker so timed polls and live counts happen during the walk.

import test from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../packs/ElectoralBP/scripts/core/random.js";
import { getState, saveState } from "../packs/ElectoralBP/scripts/core/storage.js";
import { GOVERNMENTS } from "../packs/ElectoralBP/scripts/data/governments.js";
import { openBoard } from "../packs/ElectoralBP/scripts/ui/board.js";
import { tick } from "../packs/ElectoralBP/scripts/ui/ticker.js";
import { _hooks, _messages, _players, _props } from "@minecraft/server";
import { buildNation } from "./helpers.js";
import { fillRect } from "../packs/ElectoralBP/scripts/engine/territory.js";
import { setStance } from "../packs/ElectoralBP/scripts/engine/diplomacy.js";
import { respondCounter, spawnSituation } from "../packs/ElectoralBP/scripts/engine/situations.js";

const BAD = /undefined|NaN|\[object Object\]|§k|§(?![0-9a-gk-or])/;
let clock = Date.now();

function makePlayer(rng, budget, admin = true) {
  const seen = [];
  const player = {
    id: "p1",
    name: "Tester",
    typeId: "minecraft:player",
    seen,
    hasTag: (t) => admin && t === "electoral_admin",
    location: { x: rng.int(-40, 400), y: 64, z: rng.int(-40, 200) },
    dimension: { id: "minecraft:overworld" },
    onScreenDisplay: { setTitle: (t) => assert.doesNotMatch(String(t), BAD) },
    playSound: () => {},
    music: null,
    playMusic(track, opts) {
      assert.equal(track, "electoral.night_theme");
      assert.equal(opts.loop, true);
      this.music = track;
    },
    stopMusic() {
      this.music = null;
    },
    sendMessage: (m) => assert.doesNotMatch(String(m), BAD, `message: ${m}`),
    async respond(form) {
      const texts = [form._title, form._body, ...(form.buttons || []), ...(form.fields || []).map((f) => f.label), ...(form.fields || []).flatMap((f) => f.items || [])];
      for (const t of texts) if (typeof t === "string") assert.doesNotMatch(t, BAD, `form text: ${t.slice(0, 300)}`);
      // keep forms readable on a phone screen: no walls of text crammed into one control
      const plain = (t) => String(t).replace(/§./g, "");
      for (const f of form.fields || []) {
        assert.ok(plain(f.label).length <= 260, `label too long (${plain(f.label).length}): ${plain(f.label).slice(0, 80)}`);
        for (const it of f.items || []) assert.ok(plain(it).length <= 64, `dropdown option too long: ${plain(it)}`);
      }
      for (const b of form.buttons || []) for (const line of plain(b).split("\n")) assert.ok(line.length <= 64, `button line too long: ${line}`);
      seen.push(form._title);
      // time passes while the player clicks around
      clock += rng.int(0, 90000);
      tick(clock);
      if (budget-- <= 0) return null;
      if (rng.chance(0.03)) return null;
      if (form.kind === "action") {
        const n = form.buttons.length;
        if (n === 1) return 0;
        return rng.chance(0.18) ? n - 1 : rng.int(0, n - 2);
      }
      if (form.kind === "message") return rng.chance(0.6) ? 0 : 1;
      return form.fields.map((f) => {
        if (rng.chance(0.4)) return f.value;
        switch (f.type) {
          case "text": return rng.pick(["", "Test Name", "12000", "abc", f.value]);
          case "slider": return f.min + rng.int(0, Math.floor((f.max - f.min) / f.step)) * f.step;
          case "dropdown": return rng.int(0, f.items.length - 1);
          case "toggle": return rng.chance(0.5);
        }
      });
    },
  };
  return player;
}

test("main.js registers the block, script event and ticker", async () => {
  await import("../packs/ElectoralBP/scripts/main.js");
  let registered = null;
  for (const cb of _hooks.startup) cb({ blockComponentRegistry: { registerCustomComponent: (name, comp) => (registered = { name, comp }) } });
  assert.equal(registered.name, "electoral:board_table");
  assert.equal(_hooks.scriptEvent.length, 1);
  for (const cb of _hooks.worldLoad) cb();
  assert.equal(_hooks.interval.length, 1);
  assert.equal(_hooks.playerSpawn.length, 1);
});

test("random walks through every menu never crash", { timeout: 600000 }, async () => {
  const state = getState();
  const seedRng = createRng(99);
  const built = [];
  for (const g of GOVERNMENTS) built.push(buildNation(state, g.id, seedRng.int(1, 1e9), g.name).n);
  // paint each nation's counties side by side, set up rivalries, wars and situations
  built.forEach((n, k) => n.regions.forEach((r, i) => fillRect(state, [k * 10 + i * 2, 0], [k * 10 + i * 2 + 1, 9], r.id)));
  setStance(state, built[0].id, built[1].id, "war");
  setStance(state, built[0].id, built[2].id, "rival");
  setStance(state, built[0].id, built[3].id, "alliance");
  const srng = createRng(5);
  for (const n of built) for (let i = 0; i < 2; i++) spawnSituation(state, n, srng);
  const dep = spawnSituation(state, built[0], srng, { tplId: "deposit" });
  const counter = built.flatMap((n) => n.situations).find((c) => c.kind === "counter" && c.originSitId === dep?.sit.id);
  if (counter) respondCounter(state, state.nations[counter.nationId], counter, 1, srng); // seize -> dispute
  built[1].rulers = ["Tester"];
  saveState();
  let forms = 0;
  const titles = new Set();
  for (let session = 0; session < 900; session++) {
    const rng = createRng(1000 + session);
    if (Object.keys(getState().nations).length < 3) for (const g of GOVERNMENTS.slice(0, 4)) buildNation(getState(), g.id, session + 1, g.name);
    const player = makePlayer(rng, rng.int(10, 120), session % 7 !== 0);
    _players.length = 0;
    _players.push(player);
    try {
      await openBoard(player);
    } catch (e) {
      console.error("Path:", player.seen.join(" > "));
      throw e;
    }
    forms += player.seen.length;
    for (const t of player.seen) titles.add(String(t).replace(/§./g, ""));
    JSON.parse(JSON.stringify(getState()));
  }
  for (const m of _messages) assert.doesNotMatch(String(m), BAD, `chat: ${m}`);
  saveState();
  assert.ok(forms > 2000, `explored ${forms} forms`);
  assert.ok(JSON.parse(_props.get("electoral:state:meta")).count >= 1);
  const chat = _messages.join("\n");
  for (const must of ["closed", "first returns", "RESULT"]) assert.ok(chat.includes(must), `live count reached: ${must}`);
  for (const must of ["Start an Election", "New Candidate", "Add County", "Latest Poll", "By County", "Live Results", "Issues of the Term", "Interest Groups", "Group Support", "Choose a Government", "World Map", "Draw Borders", "Brush", "Economy", "Taxes & Tariffs", "Budget Allocation", "Response", "Our Move", "Ruling", "Trigger a Situation", "Crisis Record", "Jump To"]) assert.ok(titles.has(must), `reached screen: ${must}`);
  if (process.env.FUZZ_VERBOSE) console.log([...titles].sort().join(" | "));
});

test("the election-night theme loops during the night and stops after", async () => {
  const { newState } = await import("../packs/ElectoralBP/scripts/core/state.js");
  const { openElection } = await import("../packs/ElectoralBP/scripts/engine/election.js");
  const { effectiveGov } = await import("../packs/ElectoralBP/scripts/data/governments.js");
  const { beginCount } = await import("../packs/ElectoralBP/scripts/engine/night.js");
  const state = getState();
  for (const id of Object.keys(state.nations)) delete state.nations[id];
  const { n, cands } = buildNation(state, "democracy", 7, "Music Test");
  openElection(state, n, effectiveGov(n), { candidates: cands.map((c) => c.id) });
  const listener = makePlayer(createRng(1), 0);
  _players.length = 0;
  _players.push(listener);
  let t = Date.now();
  beginCount(state, n, 5, t, 2);
  tick(t);
  assert.equal(listener.music, "electoral.night_theme", "the theme starts when the night begins");
  tick((t += 60000));
  assert.equal(listener.music, "electoral.night_theme", "still playing mid-night");
  tick((t += 2 * 60000 + 1000));
  assert.equal(n.count, null);
  tick((t += 1000));
  assert.equal(listener.music, null, "the theme stops when the night is over");
});
