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
    onScreenDisplay: { setTitle: (t) => assert.doesNotMatch(String(t), BAD) },
    playSound: () => {},
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
});

test("random walks through every menu never crash", { timeout: 600000 }, async () => {
  const state = getState();
  const seedRng = createRng(99);
  for (const g of GOVERNMENTS) buildNation(state, g.id, seedRng.int(1, 1e9), g.name);
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
  for (const must of ["Start an Election", "New Candidate", "Add County", "Latest Poll", "By County", "Live Results", "Issues of the Term", "Interest Groups", "Group Support", "Choose a Government"]) assert.ok(titles.has(must), `reached screen: ${must}`);
  if (process.env.FUZZ_VERBOSE) console.log([...titles].sort().join(" | "));
});
