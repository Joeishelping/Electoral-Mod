// Building War Tables in the world, keeping them up to date, exploring terrain
// around players, and the Map Brush.

import { system, world, ItemStack } from "@minecraft/server";
import { classify } from "../data/mapblocks.js";
import { chunkOf, fillRect, ownerIndex } from "../engine/territory.js";
import { planTable, squareAt, TABLE_SIZES } from "../engine/wartable.js";
import { cellChunks } from "../engine/territory.js";
import { getState, getTerrain, saveTerrain } from "../core/storage.js";
import { nextId } from "../core/state.js";
import { canRun, commit, isAdmin } from "./nav.js";

export const LABEL_ENTITY = "electoral:map_label";
export const BRUSH_ITEM = "electoral:map_brush";

const rendered = new Map(); // table id -> { floor: [], top: [], labels: "" }
const queued = new Set();
let terrainDirty = false;
let lastTerrainSave = 0;

export const tables = () => {
  const s = getState();
  s.tables = s.tables || [];
  return s.tables;
};

function dim(table) {
  return world.getDimension(table.dim || "minecraft:overworld");
}

function setBlock(d, x, y, z, type) {
  try {
    const b = d.getBlock({ x, y, z });
    if (!b) return false; // not loaded
    if (b.typeId !== type) b.setType(type);
    return true;
  } catch {
    return false;
  }
}

/** Re-renders a table, placing only blocks that changed. Spread over several ticks. */
export function renderTable(table, full = false) {
  if (queued.has(table.id)) return;
  queued.add(table.id);
  const plan = planTable(getState(), getTerrain(), table);
  const prev = full ? null : rendered.get(table.id);
  const d = dim(table);
  const job = function* () {
    let ok = true;
    for (let k = 0; k < plan.floor.length; k++) {
      const i = k % table.w;
      const j = Math.floor(k / table.w);
      const x = table.x0 + i;
      const z = table.z0 + j;
      if (!prev || prev.floor[k] !== plan.floor[k]) ok = setBlock(d, x, table.y, z, plan.floor[k]) && ok;
      const was = prev ? prev.top[k] : "?";
      if (was !== plan.top[k] && (plan.top[k] || was)) ok = setBlock(d, x, table.y + 1, z, plan.top[k] || "minecraft:air") && ok;
      if (k % 48 === 47) yield;
    }
    const labelKey = JSON.stringify(plan.labels);
    if (!prev || prev.labels !== labelKey) placeLabels(table, plan.labels);
    // only remember what was actually placed; unloaded tables retry later
    if (ok) rendered.set(table.id, { floor: plan.floor, top: plan.top, labels: labelKey });
    else rendered.delete(table.id);
    queued.delete(table.id);
  };
  try {
    system.runJob(job());
  } catch {
    queued.delete(table.id);
  }
}

function placeLabels(table, labels) {
  const d = dim(table);
  try {
    for (const e of d.getEntities({ type: LABEL_ENTITY, tags: [`table_${table.id}`] })) e.remove();
    for (const l of labels) {
      const e = d.spawnEntity(LABEL_ENTITY, { x: l.x, y: l.y, z: l.z });
      e.nameTag = l.text;
      e.addTag(`table_${table.id}`);
    }
  } catch {
    // area not loaded - labels come back on the next refresh
  }
}

export function renderAll(full = false) {
  for (const t of tables()) renderTable(t, full);
}

/** Builds a new table centred on the player, using the floor under their feet. */
export function buildTable(player, sizeIdx) {
  const size = TABLE_SIZES[sizeIdx] || TABLE_SIZES[1];
  const loc = player.location;
  const [cx, cz] = chunkOf(loc.x, loc.z);
  const table = {
    id: nextId(getState(), "t"),
    dim: player.dimension.id,
    x0: Math.floor(loc.x) - Math.floor(size.w / 2),
    y: Math.floor(loc.y) - 1,
    z0: Math.floor(loc.z) - Math.floor(size.h / 2),
    w: size.w,
    h: size.h,
    cx,
    cz,
    zoom: 4,
    persp: null,
  };
  tables().push(table);
  commit();
  renderTable(table, true);
  return table;
}

export function removeTable(table) {
  const s = getState();
  s.tables = tables().filter((t) => t !== table);
  commit();
  const d = dim(table);
  try {
    for (const e of d.getEntities({ type: LABEL_ENTITY, tags: [`table_${table.id}`] })) e.remove();
  } catch {
    // ignore
  }
  const prev = rendered.get(table.id);
  rendered.delete(table.id);
  system.runJob((function* () {
    for (let k = 0; k < table.w * table.h; k++) {
      const x = table.x0 + (k % table.w);
      const z = table.z0 + Math.floor(k / table.w);
      setBlock(d, x, table.y, z, "minecraft:smooth_stone");
      if (!prev || prev.top[k]) setBlock(d, x, table.y + 1, z, "minecraft:air");
      if (k % 64 === 63) yield;
    }
  })());
}

export function nearestTable(player) {
  let best = null;
  let bd = Infinity;
  for (const t of tables()) {
    if (t.dim && t.dim !== player.dimension?.id) continue;
    const dx = t.x0 + t.w / 2 - player.location.x;
    const dz = t.z0 + t.h / 2 - player.location.z;
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

// ---------- exploring terrain ----------

function topBlock(d, x, z) {
  if (typeof d.getTopmostBlock === "function") return d.getTopmostBlock({ x, z });
  for (let y = 300; y > -60; y -= 4) {
    const b = d.getBlock({ x, y, z });
    if (b && !b.isAir) return b;
  }
  return undefined;
}

function sample(d, cx, cz) {
  const terrain = getTerrain();
  const k = `${cx},${cz}`;
  try {
    const b = topBlock(d, cx * 16 + 8, cz * 16 + 8);
    if (!b) return false;
    const t = classify(b.typeId, b.location.y);
    if (!t) return false;
    if (terrain[k] !== t) {
      terrain[k] = t;
      terrainDirty = true;
    }
    return true;
  } catch {
    return false; // unloaded
  }
}

/** Every few ticks: map a handful of unexplored chunks around each player. */
export function exploreTick(now = Date.now()) {
  const terrain = getTerrain();
  for (const p of world.getPlayers()) {
    let d;
    try {
      d = p.dimension;
      if (d.id !== "minecraft:overworld") continue;
    } catch {
      continue;
    }
    const [pcx, pcz] = chunkOf(p.location.x, p.location.z);
    let done = 0;
    for (let tries = 0; tries < 16 && done < 4; tries++) {
      const cx = pcx + Math.floor(Math.random() * 17) - 8;
      const cz = pcz + Math.floor(Math.random() * 17) - 8;
      if (terrain[`${cx},${cz}`]) continue;
      if (sample(d, cx, cz)) done++;
    }
  }
  if (terrainDirty && now - lastTerrainSave > 30000) {
    terrainDirty = false;
    lastTerrainSave = now;
    try {
      saveTerrain();
    } catch (e) {
      console.warn(`[Electoral] terrain save failed: ${e}`);
    }
    renderAll();
  }
}

/** Admin tool: map every loaded chunk around the player right now. */
export function scanAround(player, radius = 24) {
  const d = player.dimension;
  const [pcx, pcz] = chunkOf(player.location.x, player.location.z);
  let found = 0;
  system.runJob((function* () {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (sample(d, pcx + dx, pcz + dz)) found++;
      }
      yield;
    }
    terrainDirty = false;
    lastTerrainSave = Date.now();
    saveTerrain();
    renderAll();
    try {
      player.sendMessage(`§aMapped ${found} chunks of terrain around you.`);
    } catch {
      // left
    }
  })());
}

// ---------- the Map Brush ----------

// player id -> { target, label, radius (in table squares) }
export const brushes = new Map();

export function giveBrush(player) {
  try {
    player.getComponent("minecraft:inventory").container.addItem(new ItemStack(BRUSH_ITEM, 1));
    return true;
  } catch {
    return false;
  }
}

/** Right-click a War Table square with the brush: paint the land it covers. */
export function brushOn(player, block) {
  const brush = brushes.get(player.id);
  if (!brush) {
    player.sendMessage("§eRight-click the air with the Map Brush to choose what to paint.");
    return;
  }
  const loc = block.location;
  const table = tables().find((t) => (t.dim || "minecraft:overworld") === player.dimension.id && squareAt(t, loc.x, loc.y, loc.z));
  if (!table) {
    player.sendMessage("§7Use the Map Brush on a War Table.");
    return;
  }
  const state = getState();
  const idx = ownerIndex(state);
  if (brush.target && !idx[brush.target]) {
    brushes.delete(player.id);
    player.sendMessage("§cThat country or city no longer exists. Pick a new brush.");
    return;
  }
  const admin = isAdmin(player);
  const canPaint = (old) => admin || (idx[old] && canRun(player, idx[old].nation));
  const { i, j } = squareAt(table, loc.x, loc.y, loc.z);
  const r = brush.radius || 0;
  let n = 0;
  for (let di = -r; di <= r; di++) {
    for (let dj = -r; dj <= r; dj++) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= table.w || jj >= table.h) continue;
      const [x0, z0, x1, z1] = cellChunks(table, ii, jj);
      n += Math.max(0, fillRect(state, [x0, z0], [x1, z1], brush.target, canPaint));
    }
  }
  if (n) {
    commit();
    renderAll();
  }
  try {
    player.onScreenDisplay.setActionBar(`§aPainted §f${brush.label}§7 · ${n} chunks`);
  } catch {
    // ignore
  }
}
