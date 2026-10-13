// What the map knows about the land: one colour + height sample every 4 blocks,
// kept in regions of 32x32 samples (128x128 blocks), one world property each.
// Samples are packed colours (see engine/mapview.js) or -1 where nobody has looked.
// Each region also keeps one rough sample for its middle, used when the map is
// zoomed far out (or until the region has been looked at closely), and a flag
// saying the whole region has been surveyed.

import { world } from "@minecraft/server";

export const SIDE = 32; // samples per region side
const PREFIX = "electoral:tr:";
const UNKNOWN = 0x30;
const regions = new Map(); // "rx,rz" -> region
const dirty = new Set();

const blank = () => ({ col: new Int32Array(SIDE * SIDE).fill(-1), h: new Int16Array(SIDE * SIDE), coarse: -1, coarseH: 0, full: false });
const EMPTY = { ...blank(), empty: true };

function parse(raw) {
  const r = blank();
  for (let i = 0; i < SIDE * SIDE; i++) {
    const c = raw.charCodeAt(i * 2);
    if (c === UNKNOWN) continue;
    r.col[i] = c - 0x1000;
    r.h[i] = raw.charCodeAt(i * 2 + 1) - 0x1000 - 64;
  }
  if (raw.length >= SIDE * SIDE * 2 + 3) {
    const c = raw.charCodeAt(SIDE * SIDE * 2);
    if (c !== UNKNOWN) {
      r.coarse = c - 0x1000;
      r.coarseH = raw.charCodeAt(SIDE * SIDE * 2 + 1) - 0x1000 - 64;
    }
    r.full = raw[SIDE * SIDE * 2 + 2] === "F";
  }
  return r;
}

let lastRx = NaN;
let lastRz = NaN;
let lastR = null;

function load(rx, rz, create = false) {
  const k = `${rx},${rz}`;
  let r = regions.get(k);
  if (r && !(create && r.empty)) return r;
  if (!r) {
    if (regions.size > 3000) {
      lastR = null;
      for (const [key, v] of regions) if (!dirty.has(key) && (v.empty || regions.size > 1500)) regions.delete(key);
    }
    r = EMPTY;
    try {
      const raw = world.getDynamicProperty(PREFIX + k);
      if (typeof raw === "string" && raw.length >= SIDE * SIDE * 2) r = parse(raw);
    } catch {
      // corrupt or missing: start empty
    }
  }
  if (create && r.empty) r = blank();
  regions.set(k, r);
  if (lastRx === rx && lastRz === rz) lastR = r;
  return r;
}

// the map reads row by row, so the last region looked at is usually the next one
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
  /** Packed colour of a sample, the region's rough colour if unknown, or -1. */
  color(cx, cz) {
    const r = regionOf(cx, cz);
    const c = r.col[idx(cx, cz)];
    return c >= 0 ? c : r.coarse;
  },
  height(cx, cz) {
    const r = regionOf(cx, cz);
    const i = idx(cx, cz);
    return r.col[i] >= 0 ? r.h[i] : r.coarse >= 0 ? r.coarseH : null;
  },
  known(cx, cz) {
    return regionOf(cx, cz).col[idx(cx, cz)] >= 0;
  },
  set(cx, cz, color, y) {
    const r = load(Math.floor(cx / SIDE), Math.floor(cz / SIDE), true);
    const i = idx(cx, cz);
    const h = Math.max(-64, Math.min(400, Math.round(y)));
    if (r.col[i] === color && r.h[i] === h) return false;
    r.col[i] = color;
    r.h[i] = h;
    dirty.add(`${Math.floor(cx / SIDE)},${Math.floor(cz / SIDE)}`);
    return true;
  },
};

/** Region-level survey info (rx, rz in regions of 128 blocks). */
export const regionInfo = {
  hasCoarse: (rx, rz) => load(rx, rz).coarse >= 0,
  isFull: (rx, rz) => load(rx, rz).full,
  setCoarse(rx, rz, color, y) {
    const r = load(rx, rz, true);
    r.coarse = color;
    r.coarseH = Math.max(-64, Math.min(400, Math.round(y)));
    dirty.add(`${rx},${rz}`);
  },
  setFull(rx, rz) {
    const r = load(rx, rz, true);
    r.full = true;
    dirty.add(`${rx},${rz}`);
  },
};

/** Writes changed regions. `limit` keeps a single tick cheap. */
export function saveTerrain(limit = Infinity) {
  let n = 0;
  for (const k of dirty) {
    if (n++ >= limit) break;
    dirty.delete(k);
    const r = regions.get(k);
    if (!r || r.empty) continue;
    const out = new Array(SIDE * SIDE + 2);
    for (let i = 0; i < SIDE * SIDE; i++) out[i] = r.col[i] < 0 ? "00" : String.fromCharCode(0x1000 + r.col[i], 0x1000 + 64 + r.h[i]);
    out[SIDE * SIDE] = r.coarse < 0 ? "00" : String.fromCharCode(0x1000 + r.coarse, 0x1000 + 64 + r.coarseH);
    out[SIDE * SIDE + 1] = r.full ? "F" : "-";
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

/** Removes the War Table era's terrain blob (no longer used). */
export function dropLegacyTerrain() {
  try {
    for (const id of world.getDynamicPropertyIds()) if (id.startsWith("electoral:terrain")) world.setDynamicProperty(id, undefined);
  } catch {
    // ignore
  }
}
