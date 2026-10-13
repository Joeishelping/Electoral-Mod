// Maps the land around every player as they play: a few columns per tick,
// nearest first, then keeps re-checking so new builds show up on the map.

import { system, world } from "@minecraft/server";
import { blockColor, seeThrough } from "../data/blockcolors.js";
import { CELL, pack } from "../engine/mapview.js";
import { saveTerrain, terrain } from "../core/terrain.js";

const RADIUS = 28; // samples (112 blocks) around each player
const BUDGET = 24; // samples per tick across all players
const sweeps = new Map(); // player id -> { cx, cz, gen, fresh }

function topBlock(d, x, z) {
  if (typeof d.getTopmostBlock === "function") return d.getTopmostBlock({ x, z });
  for (let y = 320; y > -64; y -= 2) {
    const b = d.getBlock({ x, y, z });
    if (b && !b.isAir) return b;
  }
  return undefined;
}

const isWater = (t) => t === "minecraft:water" || t === "minecraft:flowing_water";

/** Looks at one 4x4 patch of land from above. Returns { color, y }, or false if it isn't loaded. */
export function sampleCell(d, cx, cz) {
  try {
    const x = cx * CELL + 2;
    const z = cz * CELL + 2;
    let b = topBlock(d, x, z);
    for (let k = 0; b && k < 4 && seeThrough(b.typeId); k++) b = b.below();
    if (!b) return false;
    let [r, g, bl] = blockColor(b.typeId);
    if (isWater(b.typeId)) {
      // deeper water is darker; shallows show the bottom
      let depth = 1;
      let floor = null;
      for (; depth < 12; depth++) {
        const under = d.getBlock({ x, y: b.location.y - depth, z });
        if (!under) break;
        if (!isWater(under.typeId) && !seeThrough(under.typeId)) {
          floor = under;
          break;
        }
      }
      const t = Math.min(1, (depth + 1) / 6);
      const f = floor ? blockColor(floor.typeId) : [r, g, bl];
      const dark = 1 - Math.min(0.4, depth * 0.035);
      r = (f[0] * (1 - t) + r * t) * dark;
      g = (f[1] * (1 - t) + g * t) * dark;
      bl = (f[2] * (1 - t) + bl * t) * dark;
    }
    const color = pack(r, g, bl);
    const y = isWater(b.typeId) ? 62 : b.location.y;
    terrain.set(cx, cz, color, y);
    return { color, y };
  } catch {
    return false; // unloaded
  }
}

function* spiral(cx, cz, onlyUnknown) {
  yield [cx, cz];
  for (let r = 1; r <= RADIUS; r++) {
    for (let k = -r; k < r; k++) {
      for (const [x, z] of [[cx + k, cz - r], [cx + r, cz + k], [cx - k, cz + r], [cx - r, cz - k]]) {
        if (onlyUnknown && terrain.known(x, z)) continue;
        yield [x, z];
      }
    }
  }
}

let lastSave = 0;

/** Called every tick. */
export function exploreTick(now = Date.now()) {
  const players = world.getPlayers().filter((p) => {
    try {
      return p.dimension.id === "minecraft:overworld";
    } catch {
      return false;
    }
  });
  if (players.length) {
    const each = Math.max(4, Math.floor(BUDGET / players.length));
    for (const p of players) {
      const cx = Math.floor(p.location.x / CELL);
      const cz = Math.floor(p.location.z / CELL);
      let s = sweeps.get(p.id);
      if (!s || Math.abs(s.cx - cx) > 8 || Math.abs(s.cz - cz) > 8) {
        s = { cx, cz, fresh: true, gen: spiral(cx, cz, true), found: 0 };
        sweeps.set(p.id, s);
      }
      for (let k = 0; k < each; k++) {
        const next = s.gen.next();
        if (next.done) {
          // first pass maps the unknown; later passes refresh everything
          s.fresh = s.found > 0;
          s.found = 0;
          s.gen = spiral(s.cx, s.cz, s.fresh);
          break;
        }
        if (sampleCell(p.dimension, next.value[0], next.value[1])) s.found++;
      }
    }
  }
  if (now - lastSave > 20000) {
    lastSave = now;
    saveTerrain(8);
  }
}

/** Admin: map every loaded column in a wide square around the player now. */
export function scanAround(player, radius = 64, done = () => {}) {
  const d = player.dimension;
  const cx = Math.floor(player.location.x / CELL);
  const cz = Math.floor(player.location.z / CELL);
  let found = 0;
  system.runJob((function* () {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) if (sampleCell(d, cx + dx, cz + dz)) found++;
      yield;
    }
    saveTerrain();
    done(found);
  })());
}

export function forgetSweep(id) {
  sweeps.delete(id);
}
