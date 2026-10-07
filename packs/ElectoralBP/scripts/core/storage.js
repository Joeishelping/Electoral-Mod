// Persists the whole state as JSON in world dynamic properties. Strings are split
// into chunks (property size limit) and written to alternating slots, so a crash
// mid-save never corrupts the last good copy.

import { world } from "@minecraft/server";
import { newState, normalizeState } from "./state.js";

const PREFIX = "electoral:state";
const CHUNK = 16000; // characters; stays under the byte limit even for 2-byte chars

let cache = null;

function readSlot(slot, count) {
  let json = "";
  for (let i = 0; i < count; i++) {
    const part = world.getDynamicProperty(`${PREFIX}:${slot}:${i}`);
    if (typeof part !== "string") throw new Error(`missing chunk ${slot}:${i}`);
    json += part;
  }
  return JSON.parse(json);
}

export function getState() {
  if (cache) return cache;
  try {
    const metaRaw = world.getDynamicProperty(`${PREFIX}:meta`);
    if (typeof metaRaw === "string") {
      const meta = JSON.parse(metaRaw);
      cache = normalizeState(readSlot(meta.slot, meta.count));
      return cache;
    }
  } catch (e) {
    console.warn(`[Electoral] Failed to load saved state: ${e}`);
  }
  cache = newState();
  return cache;
}

export function saveState() {
  if (!cache) return;
  const json = JSON.stringify(cache);
  let meta = { slot: 1, count: 0 };
  try {
    const raw = world.getDynamicProperty(`${PREFIX}:meta`);
    if (typeof raw === "string") meta = JSON.parse(raw);
  } catch {
    // first save
  }
  const slot = meta.slot === 0 ? 1 : 0;
  const count = Math.max(1, Math.ceil(json.length / CHUNK));
  for (let i = 0; i < count; i++) world.setDynamicProperty(`${PREFIX}:${slot}:${i}`, json.slice(i * CHUNK, (i + 1) * CHUNK));
  world.setDynamicProperty(`${PREFIX}:meta`, JSON.stringify({ slot, count }));
  // clear the previous slot
  for (let i = 0; i < (meta.count || 0); i++) world.setDynamicProperty(`${PREFIX}:${meta.slot}:${i}`, undefined);
}

export function resetState() {
  cache = newState();
  saveState();
  return cache;
}

export function stateSize() {
  return cache ? JSON.stringify(cache).length : 0;
}
