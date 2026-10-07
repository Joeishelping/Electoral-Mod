// Drives every Board Table menu with random clicks and form inputs, checking that
// nothing throws, form arguments are valid, and no text renders "undefined"/"NaN".

import test from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../packs/ElectoralBP/scripts/core/random.js";
import { getState, saveState } from "../packs/ElectoralBP/scripts/core/storage.js";
import { generateNation } from "../packs/ElectoralBP/scripts/engine/generate.js";
import { GOVERNMENTS } from "../packs/ElectoralBP/scripts/data/governments.js";
import { openBoard } from "../packs/ElectoralBP/scripts/ui/board.js";
import { _hooks, _props } from "@minecraft/server";

const BAD = /undefined|NaN|\[object Object\]/;

function makePlayer(rng, budget, admin = true) {
  const seen = [];
  return {
    id: "p1",
    name: "Tester",
    typeId: "minecraft:player",
    seen,
    hasTag: (t) => admin && t === "electoral_admin",
    sendMessage(m) {
      assert.doesNotMatch(String(m), BAD, `message: ${m}`);
    },
    async respond(form) {
      const texts = [form._title, form._body, ...(form.buttons || []), ...(form.fields || []).map((f) => f.label), ...(form.fields || []).flatMap((f) => f.items || [])];
      for (const t of texts) if (typeof t === "string") assert.doesNotMatch(t, BAD, `form text: ${t.slice(0, 300)}`);
      seen.push(form._title);
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
          case "text": return rng.pick(["", "Test Name", "12000", "-5", "abc", f.value]);
          case "slider": {
            const steps = Math.floor((f.max - f.min) / f.step);
            return f.min + rng.int(0, steps) * f.step;
          }
          case "dropdown": return rng.int(0, f.items.length - 1);
          case "toggle": return rng.chance(0.5);
        }
      });
    },
  };
}

test("main.js registers the block component and script event", async () => {
  await import("../packs/ElectoralBP/scripts/main.js");
  let registered = null;
  for (const cb of _hooks.startup) cb({ blockComponentRegistry: { registerCustomComponent: (name, comp) => (registered = { name, comp }) } });
  assert.equal(registered.name, "electoral:board_table");
  assert.equal(typeof registered.comp.onPlayerInteract, "function");
  assert.equal(_hooks.scriptEvent.length, 1);
});

test("random walks through every menu never crash", { timeout: 600000 }, async () => {
  const state = getState();
  const seedRng = createRng(99);
  for (const g of GOVERNMENTS) {
    const n = generateNation(state, { gov: g.id, regions: seedRng.int(2, 7), seed: seedRng.int(1, 1e9) });
    if (seedRng.chance(0.5)) state.persons[n.leaderId].player = "Tester"; // reach the Leader's Desk
  }
  saveState();
  let forms = 0;
  const titles = new Set();
  for (let session = 0; session < 900; session++) {
    const rng = createRng(1000 + session);
    if (Object.keys(getState().nations).length < 3) {
      for (const g of GOVERNMENTS.slice(0, 4)) {
        const n = generateNation(getState(), { gov: g.id, regions: 4, seed: session * 13 + 1 });
        getState().persons[n.leaderId].player = "Tester";
      }
    }
    const player = makePlayer(rng, rng.int(10, 120), session % 7 !== 0);
    try {
      await openBoard(player);
    } catch (e) {
      console.error("Path:", player.seen.join(" > "));
      throw e;
    }
    forms += player.seen.length;
    for (const t of player.seen) titles.add(String(t).replace(/§./g, "").replace(/[0-9#]+/g, "").trim());
    // state must stay serialisable and reloadable
    JSON.parse(JSON.stringify(getState()));
  }
  saveState();
  assert.ok(forms > 2000, `explored ${forms} forms`);
  if (process.env.FUZZ_VERBOSE) console.log([...titles].sort().join(" | "));
  const meta = JSON.parse(_props.get("electoral:state:meta"));
  assert.ok(meta.count >= 1);
});
