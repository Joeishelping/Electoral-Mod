// The War Table: a map of the world built out of blocks on the floor of a room.
// Each square shows the real terrain (explored by players) or the territory that
// owns it, with outlines, war fronts, situation markers and floating name labels.

import { SCENARIO_BY_ID } from "../data/scenarios.js";
import { TERRAIN, UNKNOWN_BLOCK, MARKERS, FRONT_BLOCK, edgeBlock, fillBlock } from "../data/mapblocks.js";
import { centroids, computeCells, ownerIndex } from "./territory.js";

export const TABLE_SIZES = [
  { name: "Small 24x16", w: 24, h: 16 },
  { name: "Medium 32x24", w: 32, h: 24 },
  { name: "Large 48x32", w: 48, h: 32 },
  { name: "Huge 64x48", w: 64, h: 48 },
];
export const ZOOMS = [1, 2, 4, 8, 16, 32, 64];

/** Situation markers for a nation's view: ownerKey -> 0/1/2 or "opportunity". */
export function situationMarkers(nation) {
  const markers = {};
  for (const s of nation?.situations || []) {
    if (s.kind !== "situation" || (s.status !== "active" && s.status !== "ruling")) continue;
    const level = SCENARIO_BY_ID[s.tpl]?.kind === "opportunity" ? "opportunity" : s.severity >= 4 ? 2 : s.severity >= 2.5 ? 1 : 0;
    for (const id of s.regionIds) {
      const cur = markers[id];
      if (cur === undefined || cur === "opportunity" || (typeof level === "number" && level > cur)) markers[id] = level;
    }
  }
  return markers;
}

function terrainOf(terrain, cell, zoom) {
  const t = terrain[`${cell.cx},${cell.cz}`];
  if (t) return t;
  if (zoom > 1) {
    const h = Math.floor(zoom / 2);
    for (const [dx, dz] of [[-h, -h], [h - 1, -h], [-h, h - 1], [h - 1, h - 1], [0, -h], [-h, 0]]) {
      const v = terrain[`${cell.cx + dx},${cell.cz + dz}`];
      if (v) return v;
    }
  }
  return null;
}

/**
 * table: { x0, y, z0, w, h, cx, cz, zoom, persp }
 * Returns { floor: [blockId per square], top: [blockId|null per square], labels: [{x,y,z,text}] }
 * Squares are listed row by row: index = j * w + i, world position (x0 + i, y, z0 + j).
 */
export function planTable(state, terrain, table) {
  const persp = table.persp ? state.nations[table.persp] : null;
  const view = { cx: table.cx, cz: table.cz, zoom: table.zoom, w: table.w, h: table.h, persp: persp ? persp.id : null, markers: persp ? situationMarkers(persp) : null };
  const cells = computeCells(state, view);
  const floor = [];
  const top = [];
  for (let j = 0; j < table.h; j++) {
    for (let i = 0; i < table.w; i++) {
      const c = cells[j][i];
      let block;
      if (c.front) block = FRONT_BLOCK;
      else if (c.owner) block = c.edge ? edgeBlock(c.color) : fillBlock(c.color);
      else {
        const t = terrainOf(terrain, c, table.zoom);
        block = t && TERRAIN[t] ? TERRAIN[t].block : UNKNOWN_BLOCK;
      }
      floor.push(block);
      top.push(c.marker !== undefined ? MARKERS[c.marker] : null);
    }
  }
  return { floor, top, labels: planLabels(state, table) };
}

function planLabels(state, table) {
  const idx = ownerIndex(state);
  const cents = centroids(state);
  const x0c = table.cx - Math.floor(table.w / 2) * table.zoom;
  const z0c = table.cz - Math.floor(table.h / 2) * table.zoom;
  const labels = [];
  const place = (cx, cz, text, lift) => {
    const i = Math.floor((cx - x0c) / table.zoom);
    const j = Math.floor((cz - z0c) / table.zoom);
    if (i < 0 || j < 0 || i >= table.w || j >= table.h) return;
    labels.push({ x: table.x0 + i + 0.5, y: table.y + lift, z: table.z0 + j + 0.5, text });
  };
  // countries: centre of all their land
  for (const n of Object.values(state.nations)) {
    const keys = [`n:${n.id}`, ...n.regions.map((r) => r.id)].filter((k) => cents[k]);
    if (!keys.length) continue;
    let sx = 0;
    let sz = 0;
    for (const k of keys) {
      sx += cents[k][0];
      sz += cents[k][1];
    }
    const color = table.persp ? (n.id === table.persp ? "§a" : "§f") : n.color;
    place(Math.round(sx / keys.length), Math.round(sz / keys.length), `§l${color}${n.name.toUpperCase()}`, 2.6);
  }
  // cities, when zoomed in enough to see them
  if (table.zoom <= 8) {
    for (const [k, c] of Object.entries(cents)) {
      const info = idx[k];
      if (!info || !info.region) continue;
      place(c[0], c[1], `§f${info.region.name}`, 1.6);
    }
  }
  return labels.slice(0, 40);
}

/** Which table square (if any) a block belongs to. */
export function squareAt(table, x, y, z) {
  if (y !== table.y && y !== table.y + 1) return null;
  const i = Math.floor(x) - table.x0;
  const j = Math.floor(z) - table.z0;
  if (i < 0 || j < 0 || i >= table.w || j >= table.h) return null;
  return { i, j };
}
