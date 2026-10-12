// What the map knows about the land: one colour + height sample every 4 blocks,
// kept in regions of 32x32 samples (128x128 blocks), one world property each.
// Samples are packed colours (see engine/mapview.js) or -1 where nobody has looked.

import { world } from "@minecraft/server";

const PREFIX = "electoral:tr:";
const SIDE = 32;
const UNKNOWN = 0x30;
const regions = new Map(); // "rx,rz" -> { col: Int32Array, h: Int16Array, dirty }
const dirty = new Set();

const EMPTY = { col: new Int32Array(SIDE * SIDE).fill(-1), h: new Int16Array(SIDE * SIDE), empty: true };
const blank = () => ({ col: new Int32Array(SIDE * SIDE).fill(-1), h: new Int16Array(SIDE * SIDE) });

function load(rx, rz, create = false) {
  const k = `${rx},${rz}`;
  let r = regions.get(k);
  if (r && !(create && r.empty)) return r;
  if (r) {
    r = blank();
    regions.set(k, r);
    return r;
  }
  if (regions.size > 3000) {
    lastR = null;
    for (const [key, v] of regions) if (!dirty.has(key) && (v.empty || regions.size > 1500)) regions.delete(key);
  }
  r = EMPTY;
  try {
    const raw = world.getDynamicProperty(PREFIX + k);
    if (typeof raw === "string" && raw.length === SIDE * SIDE * 2) {
      r = blank();
      for (let i = 0; i < SIDE * SIDE; i++) {
        const c = raw.charCodeAt(i * 2);
        if (c === UNKNOWN) continue;
        r.col[i] = c - 0x1000;
        r.h[i] = raw.charCodeAt(i * 2 + 1) - 0x1000 - 64;
      }
    }
  } catch {
    // corrupt or missing: start empty
  }
  if (create && r === EMPTY) r = blank();
  regions.set(k, r);
  return r;
}

const at = (cx, cz, create = false) => {
  const rx = Math.floor(cx / SIDE);
  const rz = Math.floor(cz / SIDE);
  return [load(rx, rz, create), (cz - rz * SIDE) * SIDE + (cx - rx * SIDE), `${rx},${rz}`];
};

// the map reads row by row, so the last region looked at is usually the next one
let lastRx = NaN;
let lastRz = NaN;
let lastR = null;
function regionOf(cx, cz) {
  const rx = Math.floor(cx / SIDE);
  const rz = Math.floor(cz / SIDE);
  if (rx !== lastRx || rz !== lastRz || !lastR) {
    lastRx = rx;
    lastRz = rz;
    lastR = load(rx, rz);
  }
  return lastR;
}
const idx = (cx, cz) => (((cz % SIDE) + SIDE) % SIDE) * SIDE + (((cx % SIDE) + SIDE) % SIDE);

export const terrain = {
  color(cx, cz) {
    return regionOf(cx, cz).col[idx(cx, cz)];
  },
  height(cx, cz) {
    const r = regionOf(cx, cz);
    const i = idx(cx, cz);
    return r.col[i] < 0 ? null : r.h[i];
  },
  known(cx, cz) {
    const [r, i] = at(cx, cz);
    return r.col[i] >= 0;
  },
  set(cx, cz, color, y) {
    const [r, i, k] = at(cx, cz, true);
    if (r !== lastR) lastR = null; // a blank region may have replaced the cached one
    const h = Math.max(-64, Math.min(400, Math.round(y)));
    if (r.col[i] === color && r.h[i] === h) return false;
    r.col[i] = color;
    r.h[i] = h;
    dirty.add(k);
    return true;
  },
};

/** Writes changed regions. `limit` keeps a single tick cheap. */
export function saveTerrain(limit = Infinity) {
  let n = 0;
  for (const k of dirty) {
    if (n++ >= limit) break;
    dirty.delete(k);
    const r = regions.get(k);
    if (!r) continue;
    const out = new Array(SIDE * SIDE);
    for (let i = 0; i < SIDE * SIDE; i++) out[i] = r.col[i] < 0 ? "00" : String.fromCharCode(0x1000 + r.col[i], 0x1000 + 64 + r.h[i]);
    try {
      world.setDynamicProperty(PREFIX + k, out.join(""));
    } catch (e) {
      console.warn(`[Electoral] terrain save failed: ${e}`);
    }
  }
  return dirty.size;
}

/** Forgets every explored sample (Erase Board Data). Also clears the old War Table terrain. */
export function clearTerrain() {
  regions.clear();
  lastR = null;
  dirty.clear();
  try {
    for (const id of world.getDynamicPropertyIds()) if (id.startsWith(PREFIX) || id.startsWith("electoral:terrain")) world.setDynamicProperty(id, undefined);
  } catch {
    // older API: regions already forgotten in memory
  }
}

export function exploredCount() {
  let n = 0;
  try {
    for (const id of world.getDynamicPropertyIds()) if (id.startsWith(PREFIX)) n++;
  } catch {
    n = regions.size;
  }
  return n; // regions of 128x128 blocks
}

/** Removes the War Table era's terrain blob (no longer used). */
export function dropLegacyTerrain() {
  try {
    for (const id of world.getDynamicPropertyIds()) if (id.startsWith("electoral:terrain")) world.setDynamicProperty(id, undefined);
  } catch {
    // ignore
  }
}
