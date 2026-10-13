// Territories painted onto the real world, one 16x16 chunk at a time.
// state.map.chunks: "cx,cz" -> regionId (a city/county) or "n:<nationId>" (a
// nation's land outside any county). Counties carry their land with them when
// they are handed to another country.

import { getStance } from "./diplomacy.js";
import { autoApportion, seedHistoricalLean } from "./generate.js";

export const MAX_FILL = 40000;
export const chunkOf = (x, z) => [Math.floor(x / 16), Math.floor(z / 16)];
const key = (cx, cz) => `${cx},${cz}`;

export function ensureMap(state) {
  state.map = state.map || { chunks: {} };
  state.map.chunks = state.map.chunks || {};
  return state.map;
}

/** Index of every owner key -> { nation, region }. */
export function ownerIndex(state) {
  const idx = {};
  for (const nation of Object.values(state.nations)) {
    idx[`n:${nation.id}`] = { nation, region: null };
    for (const region of nation.regions) idx[region.id] = { nation, region };
  }
  return idx;
}

export function ownerAt(state, cx, cz) {
  return ensureMap(state).chunks[key(cx, cz)] || null;
}

/**
 * Paints chunks. target = regionId, "n:<nationId>", or null to erase.
 * canPaint(oldOwnerKey) decides whether an existing claim may be overwritten.
 */
export function paintSquare(state, cx, cz, radius, target, canPaint = () => true) {
  const chunks = ensureMap(state).chunks;
  let changed = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const k = key(cx + dx, cz + dz);
      const old = chunks[k] || null;
      if (old === target || (old && !canPaint(old))) continue;
      if (target) chunks[k] = target;
      else delete chunks[k];
      changed++;
    }
  }
  return changed;
}

/** Paints a round brush stroke of radius r chunks (r = 0 is one chunk). */
export function paintDisc(state, cx, cz, r, target, canPaint = () => true) {
  const chunks = ensureMap(state).chunks;
  let changed = 0;
  const rr = (r + 0.5) * (r + 0.5);
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > rr) continue;
      const k = key(cx + dx, cz + dz);
      const old = chunks[k] || null;
      if (old === target || (old && !canPaint(old))) continue;
      if (target) chunks[k] = target;
      else delete chunks[k];
      changed++;
    }
  }
  return changed;
}

export function fillRect(state, a, b, target, canPaint = () => true) {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [z0, z1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  if ((x1 - x0 + 1) * (z1 - z0 + 1) > MAX_FILL) return -1;
  const chunks = ensureMap(state).chunks;
  let changed = 0;
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const k = key(x, z);
      const old = chunks[k] || null;
      if (old === target || (old && !canPaint(old))) continue;
      if (target) chunks[k] = target;
      else delete chunks[k];
      changed++;
    }
  }
  return changed;
}

/**
 * Paint-bucket: repaints the patch of same-owner land joined to chunk (cx, cz),
 * staying inside box [x0, z0, x1, z1]. Returns the number changed, or -1 if too big.
 */
export function floodFill(state, cx, cz, target, canPaint = () => true, box = null) {
  const chunks = ensureMap(state).chunks;
  const from = chunks[key(cx, cz)] || null;
  if (from === target || (from && !canPaint(from))) return 0;
  const inBox = (x, z) => !box || (x >= box[0] && z >= box[1] && x <= box[2] && z <= box[3]);
  const seen = new Set([key(cx, cz)]);
  const todo = [[cx, cz]];
  const hits = [];
  while (todo.length) {
    const [x, z] = todo.pop();
    hits.push([x, z]);
    if (hits.length > MAX_FILL) return -1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const k = key(nx, nz);
      if (seen.has(k) || !inBox(nx, nz) || (chunks[k] || null) !== from) continue;
      seen.add(k);
      todo.push([nx, nz]);
    }
  }
  for (const [x, z] of hits) {
    if (target) chunks[key(x, z)] = target;
    else delete chunks[key(x, z)];
  }
  return hits.length;
}

/** Re-points every chunk owned by `from` to `to` (null erases). */
export function reassign(state, from, to) {
  const chunks = ensureMap(state).chunks;
  let n = 0;
  for (const [k, v] of Object.entries(chunks)) {
    if (v !== from) continue;
    if (to) chunks[k] = to;
    else delete chunks[k];
    n++;
  }
  return n;
}

export function landStats(state) {
  const out = {};
  for (const v of Object.values(ensureMap(state).chunks)) out[v] = (out[v] || 0) + 1;
  return out;
}

/** Centre chunk of every owner's land. */
export function centroids(state) {
  const acc = {};
  for (const [k, v] of Object.entries(ensureMap(state).chunks)) {
    const [x, z] = k.split(",").map(Number);
    const a = (acc[v] = acc[v] || [0, 0, 0]);
    a[0] += x;
    a[1] += z;
    a[2]++;
  }
  const out = {};
  for (const [v, [x, z, n]] of Object.entries(acc)) {
    // snap to a chunk the owner actually holds (concave shapes)
    let best = null;
    let bd = Infinity;
    const tx = x / n;
    const tz = z / n;
    for (const [k, o] of Object.entries(state.map.chunks)) {
      if (o !== v) continue;
      const [cx, cz] = k.split(",").map(Number);
      const d = (cx - tx) ** 2 + (cz - tz) ** 2;
      if (d < bd) {
        bd = d;
        best = [cx, cz];
      }
      if (bd < 1) break;
    }
    out[v] = best || [Math.round(tx), Math.round(tz)];
  }
  return out;
}

/** Owner keys that share a border with `owner`. */
export function neighbours(state, owner) {
  const chunks = ensureMap(state).chunks;
  const out = new Set();
  for (const [k, v] of Object.entries(chunks)) {
    if (v !== owner) continue;
    const [x, z] = k.split(",").map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const o = chunks[key(x + dx, z + dz)];
      if (o && o !== owner) out.add(o);
    }
  }
  return out;
}

/** Bounding box of a set of owner keys, or of everything. */
export function bounds(state, owners = null) {
  let b = null;
  for (const [k, v] of Object.entries(ensureMap(state).chunks)) {
    if (owners && !owners.has(v)) continue;
    const [x, z] = k.split(",").map(Number);
    if (!b) b = [x, z, x, z];
    else b = [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)];
  }
  return b;
}

// ---------- rendering ----------

const STANCE_COLOR = { alliance: "§9", trade: "§b", friendly: "§b", neutral: "§7", tense: "§6", rival: "§6", war: "§c" };

/** Map color of a nation, seen by `persp` (null = neutral world view). */
export function viewColor(state, persp, nationId) {
  if (!persp) return state.nations[nationId]?.color || "§7";
  if (nationId === persp) return "§a";
  return STANCE_COLOR[getStance(state, persp, nationId)] || "§7";
}

// ---------- moving land between countries ----------

/**
 * Hands a county (with its land, people and voting history) to another country.
 * Party loyalties reset: the new country's parties are strangers there.
 */
export function transferRegion(state, region, to) {
  const from = Object.values(state.nations).find((n) => n.regions.includes(region));
  if (!from || !to || from === to) return false;
  from.regions = from.regions.filter((r) => r !== region);
  to.regions.push(region);
  region.lean = {};
  region.memory = {};
  region.favor = 0;
  for (const p of Object.values(state.persons)) {
    if (p.nationId !== from.id) continue;
    if (p.homeRegion === region.id) p.homeRegion = null;
    p.campaignRegions = (p.campaignRegions || []).filter((id) => id !== region.id);
  }
  if (from.election) for (const [name, b] of Object.entries(from.election.ballots)) if (b.regionId === region.id) delete from.election.ballots[name];
  for (const r of Object.values(state.residents)) if (r.regionId === region.id) r.nationId = to.id;
  autoApportion(from);
  autoApportion(to);
  seedHistoricalLean(to);
  return true;
}
