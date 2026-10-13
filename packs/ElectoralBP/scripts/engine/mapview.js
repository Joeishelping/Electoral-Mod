// The map screen, drawn as an image: explored terrain, countries and cities,
// borders, war fronts, situation markers and names. Pure code (no Minecraft
// calls) so it can be tested; ui/mapscreen.js puts the image on the player's
// screen and handles the controls.
//
// Colours are packed 15-bit ints (5 bits each of red, green, blue). The image is
// sent to the HUD as text where every pixel is one glyph from RP/font/glyph_E1..F0:
// the font page picks the red level, the row in the page green, the column blue.

import { SCENARIO_BY_ID } from "../data/scenarios.js";
import { getStance } from "./diplomacy.js";
import { ensureMap, ownerIndex, viewColor } from "./territory.js";
import { eachTextPixel, fitText, textWidth } from "./pixelfont.js";

export const W = 180; // pixels across
export const H = 100; // pixels down
export const BAR = 7; // height of the top and bottom info bars
export const MAP_TOP = BAR;
export const MH = H - 2 * BAR; // rows of map between the bars
export const ZOOMS = [1, 2, 4, 8, 16, 32, 64, 128]; // blocks per pixel
export const CELL = 4; // terrain is sampled every 4 blocks
export const HEADER = "§W§O§R§L§D§M§T§Y§P§E§4§E§L§V§r"; // tells the HUD to draw the text as a map

// ---------- colours ----------

export const pack = (r, g, b) => (clamp31(r * 31) << 10) | (clamp31(g * 31) << 5) | clamp31(b * 31);
const clamp31 = (v) => (v <= 0 ? 0 : v >= 31 ? 31 : Math.round(v));
export const R = (c) => ((c >> 10) & 31) / 31;
export const Gc = (c) => ((c >> 5) & 31) / 31;
export const B = (c) => (c & 31) / 31;
export const hex = (h) => pack(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
export const mix = (a, b, t) => pack(R(a) + (R(b) - R(a)) * t, Gc(a) + (Gc(b) - Gc(a)) * t, B(a) + (B(b) - B(a)) * t);
export const scale = (c, f) => pack(R(c) * f, Gc(c) * f, B(c) * f);

const FORMAT = {
  "§0": 0x1b1b1b, "§1": 0x2233aa, "§2": 0x1f8f2f, "§3": 0x1f9a9a, "§4": 0xa01818, "§5": 0x9a2a9a, "§6": 0xf0a020, "§7": 0xa8a8a8,
  "§8": 0x555555, "§9": 0x4a5cf0, "§a": 0x55e055, "§b": 0x55e0e8, "§c": 0xf04848, "§d": 0xf060e8, "§e": 0xf6f050, "§f": 0xf4f4f4,
  "§g": 0xddd605, "§h": 0xe3d4d1, "§i": 0xcecaca, "§j": 0x443a3b, "§m": 0x971607, "§n": 0xb4684d, "§p": 0xdeb12d, "§q": 0x47a036,
  "§s": 0x2cbaa8, "§t": 0x21497b, "§u": 0x9a5cc6, "§v": 0xeb7114,
};
export const formatColor = (code) => hex(FORMAT[code] ?? 0xa8a8a8);

const FOG = hex(0x1a1c22);
const FOG2 = hex(0x20232b);
const BAR_BG = hex(0x101114);
const WHITE = hex(0xf4f4f4);
const SHADOW = hex(0x0c0c0e);
const GOLD = hex(0xf0c040);
const GREY = hex(0x9a9a9a);
const FRONT_A = hex(0xe02020);
const FRONT_B = hex(0x200808);
const CLAIM_MINE = hex(0x60ff60);
const CLAIM_ON_ME = hex(0xff5040);

/** The glyph for a colour. Rows/columns 0 and 15 of a font page are never used (texture bleed). */
const GLYPHS = new Array(32768);
export function glyph(c) {
  return GLYPHS[c] || (GLYPHS[c] = makeGlyph(c));
}

function makeGlyph(c) {
  const r = (c >> 11) & 15;
  const g = Math.min(14, Math.max(1, (c >> 6) & 15));
  const b = Math.min(14, Math.max(1, (c >> 1) & 15));
  return String.fromCharCode(((0xe1 + r) << 8) | (g << 4) | b);
}

// ---------- view geometry ----------

/** World block position at the centre of map pixel (i, j). j counts rows of the map area. */
export function pixelToWorld(view, i, j) {
  return { x: view.x + (i - W / 2 + 0.5) * view.zoom, z: view.z + (j - MH / 2 + 0.5) * view.zoom };
}

export function worldToPixel(view, x, z) {
  return { i: Math.floor((x - view.x) / view.zoom + W / 2), j: Math.floor((z - view.z) / view.zoom + MH / 2) };
}

/** Situation markers for a nation's view: ownerKey -> 0/1/2 (minor/serious/critical) or "opportunity". */
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

// ---------- the frame ----------

/**
 * frame = { view, pix: Uint16Array(W*MH), own: Int32Array(W*MH), keys: [ownerKey], stats }
 * view = { x, z, zoom, mode: "political"|"diplomatic"|"terrain", persp: nationId|null }
 * terrain = { color(cellX, cellZ) -> packed colour or -1, height(cellX, cellZ) -> y }
 */
export function newFrame(view) {
  return { view: { ...view }, pix: new Uint16Array(W * MH), fill: new Uint16Array(W * MH), own: new Int32Array(W * MH), keys: [null], keyIdx: new Map([[null, 0]]), stats: null };
}

function ownerColors(state, view) {
  const idx = ownerIndex(state);
  const out = {};
  for (const [key, info] of Object.entries(idx)) {
    const code = view.mode === "diplomatic" && view.persp ? viewColor(state, view.persp, info.nation.id) : info.nation.color;
    out[key] = { nationId: info.nation.id, region: info.region, color: formatColor(code) };
  }
  return out;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Draws terrain + territory into frame.pix. A generator: yields once per row so it
 * can run as a background job. `rect` = [i0, j0, i1, j1] redraws only part of it.
 */
export function* drawBase(state, terrain, frame, rect = null) {
  const { view } = frame;
  const chunks = ensureMap(state).chunks;
  const owners = ownerColors(state, view);
  const [i0, j0, i1, j1] = rect ? [Math.max(0, rect[0] - 1), Math.max(0, rect[1] - 1), Math.min(W - 1, rect[2] + 1), Math.min(MH - 1, rect[3] + 1)] : [0, 0, W - 1, MH - 1];
  const step = Math.max(1, Math.round(view.zoom / CELL));
  const politics = view.mode !== "terrain";
  if (!rect) frame.stats = {};
  const stats = frame.stats || (frame.stats = {});
  // per column: terrain cell, chunk, fog checker
  const cxs = new Int32Array(W);
  const chx = new Int32Array(W);
  const fgx = new Int32Array(W);
  for (let i = 0; i < W; i++) {
    const x = view.x + (i - W / 2 + 0.5) * view.zoom;
    cxs[i] = Math.floor(x / CELL);
    chx[i] = Math.floor(x / 16);
    fgx[i] = Math.floor(x / 64);
  }
  const tinted = new Map(); // "colour|tint" -> mixed colour
  for (let j = j0; j <= j1; j++) {
    const z = view.z + (j - MH / 2 + 0.5) * view.zoom;
    const cz = Math.floor(z / CELL);
    const chz = Math.floor(z / 16);
    const fgz = Math.floor(z / 64);
    let lastChunk = NaN;
    let id = 0;
    let o = null;
    for (let i = i0; i <= i1; i++) {
      const cx = cxs[i];
      let c = terrain.color(cx, cz);
      if (c < 0) c = (fgx[i] + fgz) & 1 ? FOG : FOG2;
      else {
        const h = terrain.height(cx, cz);
        const hn = terrain.height(cx, cz - step);
        if (h !== null && hn !== null && h !== hn) c = scale(c, h > hn ? 1.12 : 0.84);
      }
      if (chx[i] !== lastChunk) {
        lastChunk = chx[i];
        const key = chunks[`${lastChunk},${chz}`] || null;
        o = key && owners[key] ? key : null;
        id = frame.keyIdx.get(o);
        if (id === undefined) {
          id = frame.keys.length;
          frame.keys.push(o);
          frame.keyIdx.set(o, id);
        }
      }
      const k = j * W + i;
      frame.own[k] = id;
      if (o && politics) {
        const tint = owners[o].color;
        const mk = c * 65536 + tint;
        let m = tinted.get(mk);
        if (m === undefined) {
          m = c === FOG || c === FOG2 ? mix(FOG, tint, 0.6) : mix(c, tint, 0.5);
          tinted.set(mk, m);
        }
        c = m;
      }
      frame.fill[k] = c;
      if (!rect && o) {
        const st = stats[o] || (stats[o] = { n: 0, si: 0, sj: 0 });
        st.n++;
        st.si += i;
        st.sj += j;
      }
    }
    yield;
  }
  // borders between owners, war fronts
  const wars = new Map();
  const atWar = (a, b) => {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    let w = wars.get(k);
    if (w === undefined) {
      w = getStance(state, a, b) === "war";
      wars.set(k, w);
    }
    return w;
  };
  const diplomatic = view.mode === "diplomatic" && view.persp;
  // claims, seen from the country whose view this is: theirs on others in green stripes, others' on them in red
  const claimMine = new Set();
  const claimOnMe = new Set();
  if (diplomatic) {
    const mine = new Set((state.nations[view.persp]?.regions || []).map((r) => r.id));
    for (const c of state.claims || []) {
      if (c.by === view.persp && !mine.has(c.regionId)) claimMine.add(c.regionId);
      else if (c.by !== view.persp && mine.has(c.regionId)) claimOnMe.add(c.regionId);
    }
  }
  const cityLines = view.zoom <= 32 && view.mode !== "terrain";
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * W + i;
      const own = frame.own[k];
      let c = frame.fill[k];
      if (own) {
        const o = frame.keys[own];
        const me = owners[o];
        let edge = 0; // 1 = city border, 2 = country border, 3 = war front
        for (let d = 0; d < 4; d++) {
          const ii = i + DIRS[d][0];
          const jj = j + DIRS[d][1];
          if (ii < 0 || jj < 0 || ii >= W || jj >= MH) continue;
          const nid = frame.own[jj * W + ii];
          if (nid === own) continue;
          const other = nid ? owners[frame.keys[nid]] : null;
          if (!other || other.nationId !== me.nationId) {
            const war = other && diplomatic && (me.nationId === view.persp || other.nationId === view.persp) && atWar(me.nationId, other.nationId);
            if (war) edge = 3;
            else if (edge < 2) edge = 2;
          } else if (d !== 1 && d !== 3 && cityLines && edge < 1) edge = 1;
        }
        if (!edge && (claimMine.size || claimOnMe.size) && (i + j) % 4 === 0) {
          if (claimMine.has(o)) c = CLAIM_MINE;
          else if (claimOnMe.has(o)) c = CLAIM_ON_ME;
        }
        if (edge === 3) c = ((i + j) >> 1) & 1 ? FRONT_A : FRONT_B;
        else if (edge === 2) c = view.mode === "terrain" ? me.color : scale(me.color, 0.55);
        else if (edge === 1) c = mix(c, WHITE, 0.35);
      }
      frame.pix[k] = c;
    }
  }
  frame.rows = null; // cached row text is stale now
}

/** Runs a generator to the end (for small redraws and tests). */
export function finish(gen) {
  while (!gen.next().done) {
    // drain
  }
}

// ---------- decorations: names, markers, players ----------

const MARKER = {
  0: { color: hex(0xf0d040), rows: [".#.", "###", ".#."] },
  1: { color: hex(0xf08020), rows: ["#.#", ".#.", "#.#"] },
  2: { color: hex(0xff2020), rows: ["###", "#.#", "###"] },
  opportunity: { color: hex(0x40f0f0), rows: [".#.", "#.#", ".#."] },
};

/**
 * Names and markers to draw over the base image, as a list of
 * { x, y, color } pixels. Computed after a full drawBase (uses its stats).
 */
export function decorations(state, frame) {
  const out = [];
  const { view } = frame;
  const stats = frame.stats || {};
  const idx = ownerIndex(state);
  const taken = [];
  const free = (x0, y0, x1, y1) => {
    if (x0 < 0 || y0 < 0 || x1 >= W || y1 >= MH) return false;
    return !taken.some((t) => x0 <= t[2] && x1 >= t[0] && y0 <= t[3] && y1 >= t[1]);
  };
  const text = (str, cx, cy, color) => {
    const w = textWidth(str);
    const x0 = Math.round(cx - w / 2);
    const y0 = Math.round(cy - 2);
    if (!free(x0 - 1, y0 - 1, x0 + w, y0 + 5)) return false;
    taken.push([x0 - 1, y0 - 1, x0 + w, y0 + 5]);
    eachTextPixel(str, x0, y0, (x, y) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out.push({ x: x + dx, y: y + dy, color: SHADOW, under: true });
      out.push({ x, y, color });
    });
    return true;
  };
  // situation markers (a country's own view)
  if (view.mode === "diplomatic" && view.persp) {
    const markers = situationMarkers(state.nations[view.persp]);
    for (const [owner, level] of Object.entries(markers)) {
      const s = stats[owner];
      if (!s) continue;
      const m = MARKER[level];
      const cx = Math.round(s.si / s.n);
      const cy = Math.round(s.sj / s.n) - 5;
      taken.push([cx - 2, cy - 2, cx + 2, cy + 2]);
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) out.push({ x: cx + x, y: cy + y, color: SHADOW });
      m.rows.forEach((row, y) => row.split("").forEach((ch, x) => ch === "#" && out.push({ x: cx + x - 1, y: cy + y - 1, color: m.color })));
    }
  }
  // country names first, biggest first
  const nations = {};
  for (const [owner, s] of Object.entries(stats)) {
    const info = idx[owner];
    if (!info) continue;
    const n = (nations[info.nation.id] = nations[info.nation.id] || { nation: info.nation, n: 0, si: 0, sj: 0 });
    n.n += s.n;
    n.si += s.si;
    n.sj += s.sj;
  }
  for (const n of Object.values(nations).sort((a, b) => b.n - a.n)) {
    if (n.n < 12) continue;
    const name = fitText(n.nation.name, W - 4);
    text(name, n.si / n.n, n.sj / n.n, WHITE);
  }
  // city names where there is room
  if (view.zoom <= 32) {
    const cities = Object.entries(stats).filter(([o]) => idx[o]?.region).sort((a, b) => b[1].n - a[1].n);
    for (const [owner, s] of cities) {
      if (s.n < 30) continue;
      const cx = s.si / s.n;
      const cy = s.sj / s.n;
      const name = fitText(idx[owner].region.name, 60);
      if (text(name, cx, cy + 5, hex(0xe8e0c0))) out.push({ x: Math.round(cx), y: Math.round(cy), color: WHITE });
    }
  }
  return out;
}

/** Pixels for players on the map: a dot, the viewer as a gold diamond. */
export function playerDots(view, players, viewerId) {
  const out = [];
  for (const p of players) {
    const { i, j } = worldToPixel(view, p.x, p.z);
    if (i < 1 || j < 1 || i >= W - 1 || j >= MH - 1) continue;
    const me = p.id === viewerId;
    const c = me ? GOLD : WHITE;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) out.push({ x: i + dx, y: j + dy, color: dx || dy ? (me ? c : SHADOW) : c });
  }
  return out;
}

// ---------- assembling the picture ----------

/**
 * Builds the whole screen as a string for the action bar.
 * layers: arrays of { x, y, color } in map coordinates; top/bottom: info bar text.
 */
export function compose(frame, layers, top, bottom, accent = GOLD) {
  // rows with only base + names are cached; rows under the cursor / players are rebuilt
  if (!frame.rows || frame.rowsDeco !== layers[0]) {
    frame.rows = new Array(MH);
    frame.rowsDeco = layers[0];
    frame.decoRows = paint(layers.slice(0, 1));
  }
  const live = paint(layers.slice(1));
  const rows = [...barRows(top, accent)];
  const line = new Array(W);
  for (let j = 0; j < MH; j++) {
    const dyn = live.get(j);
    if (!dyn && frame.rows[j]) {
      rows.push(frame.rows[j]);
      continue;
    }
    const deco = frame.decoRows.get(j);
    for (let i = 0; i < W; i++) {
      let c = dyn?.get(i);
      if (c === undefined) c = deco?.get(i);
      line[i] = glyph(c === undefined ? frame.pix[j * W + i] : c);
    }
    const str = line.join("");
    if (!dyn) frame.rows[j] = str;
    rows.push(str);
  }
  rows.push(...barRows(bottom, WHITE));
  return HEADER + rows.join("\n");
}

/** Pixel layers -> Map(row -> Map(col -> colour)). Later layers win; "under" pixels never cover. */
function paint(layers) {
  const out = new Map();
  for (const layer of layers) {
    for (const p of layer) {
      if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= MH) continue;
      let row = out.get(p.y);
      if (!row) out.set(p.y, (row = new Map()));
      if (p.under && row.has(p.x)) continue;
      row.set(p.x, p.color);
    }
  }
  return out;
}

const barCache = new Map();
function barRows(text, color) {
  const key = `${color}|${Array.isArray(text) ? text.join("|") : text}`;
  const hit = barCache.get(key);
  if (hit) return hit;
  if (barCache.size > 200) barCache.clear();
  const px = new Uint16Array(W * BAR).fill(BAR_BG);
  const [left, right] = Array.isArray(text) ? text : [text, ""];
  const rw = right ? textWidth(right) : 0;
  const l = fitText(left || "", W - 6 - (rw ? rw + 6 : 0));
  eachTextPixel(l, 3, 1, (x, y) => {
    if (x < W) px[y * W + x] = color;
  });
  if (right) eachTextPixel(right, W - 3 - rw, 1, (x, y) => {
    if (x >= 0 && x < W) px[y * W + x] = GREY;
  });
  const rows = [];
  for (let y = 0; y < BAR; y++) {
    let s = "";
    for (let x = 0; x < W; x++) s += glyph(px[y * W + x]);
    rows.push(s);
  }
  barCache.set(key, rows);
  return rows;
}

// ---------- the cursor ----------

/** Crosshair at map pixel (i, j), plus an optional outline box in map pixels. */
export function cursorPixels(i, j, box = null, boxColor = GOLD) {
  const out = [];
  if (box) {
    const [x0, y0, x1, y1] = box;
    for (let x = x0; x <= x1; x++) {
      if ((x - x0) % 2 === 0) {
        out.push({ x, y: y0, color: boxColor });
        out.push({ x, y: y1, color: boxColor });
      }
    }
    for (let y = y0; y <= y1; y++) {
      if ((y - y0) % 2 === 0) {
        out.push({ x: x0, y, color: boxColor });
        out.push({ x: x1, y, color: boxColor });
      }
    }
  }
  for (let d = 2; d <= 4; d++) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
      out.push({ x: i + dx + (dy ? 1 : 0), y: j + dy + (dx ? 1 : 0), color: SHADOW });
      out.push({ x: i + dx, y: j + dy, color: WHITE });
    }
  }
  out.push({ x: i, y: j, color: WHITE });
  return out;
}

/** Map pixel box covering chunks [cx0, cz0] .. [cx1, cz1]. */
export function chunkBox(view, cx0, cz0, cx1, cz1) {
  const a = worldToPixel(view, cx0 * 16, cz0 * 16);
  const b = worldToPixel(view, (cx1 + 1) * 16 - 0.01, (cz1 + 1) * 16 - 0.01);
  return [a.i - 1, a.j - 1, b.i + 1, b.j + 1];
}
