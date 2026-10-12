// The map screen: a full-screen map drawn on the HUD. While it is open the
// player stands still; movement keys / stick steer a cursor over the map, Jump
// uses the current tool (inspect, paint, rectangle, paint bucket, found a city),
// Sneak opens the map menu, and scrolling the hotbar zooms.

import { system, world, InputButton, InputPermissionCategory, ItemStack } from "@minecraft/server";
import { REGION_TEMPLATES } from "../data/blocs.js";
import { createRng } from "../core/random.js";
import { terrain } from "../core/terrain.js";
import { getStance, STANCE_BY_ID } from "../engine/diplomacy.js";
import { addRegionOfType } from "../engine/generate.js";
import { bounds, chunkOf, fillRect, floodFill, ownerAt, ownerIndex, paintSquare, transferRegion } from "../engine/territory.js";
import { chunkBox, compose, cursorPixels, decorations, drawBase, finish, MH, newFrame, pixelToWorld, playerDots, W, worldToPixel, ZOOMS } from "../engine/mapview.js";
import { regionProfile } from "./render.js";
import { confirm, modal, notice } from "./forms.js";
import { canRun, CLOSE, commit, isAdmin, loop, page, S, announce } from "./nav.js";
import { scanAround } from "./explore.js";
import { situationPage } from "./situations.js";
import { countyMenu } from "./setup.js";
import { nationView } from "./board.js";

const FLAG = "electoral:mapOpen";
const JUMP = InputButton?.Jump ?? "Jump";
const SNEAK = InputButton?.Sneak ?? "Sneak";
const LOCKED = ["Camera", "Movement", "LateralMovement", "Sneak", "Jump", "Mount", "Dismount", "MoveForward", "MoveBackward", "MoveLeft", "MoveRight"];

const TOOLS = {
  look: { name: "Look & Inspect", short: "INSPECT" },
  paint: { name: "Paint Brush", short: "PAINT" },
  rect: { name: "Rectangle", short: "RECTANGLE" },
  fill: { name: "Paint Bucket", short: "BUCKET" },
  city: { name: "Found a City", short: "NEW CITY" },
};
const MODES = { political: "WORLD", diplomatic: "VIEW", terrain: "TERRAIN" };

const sessions = new Map(); // player id -> session
const brushes = new Map(); // player id -> { target, label, radius } (kept between openings)
let ticks = 0;

export const inMapView = (player) => sessions.has(player.id);

// ---------- opening and closing ----------

function lock(player, locked) {
  for (const name of LOCKED) {
    const cat = InputPermissionCategory?.[name];
    if (cat === undefined) continue;
    try {
      player.inputPermissions.setPermissionCategory(cat, !locked);
    } catch {
      // older clients - one failure must not skip the others
    }
  }
  try {
    player.setDynamicProperty(FLAG, locked ? true : undefined);
  } catch {
    // ignore
  }
}

/**
 * Opens the map for a player. opts.persp = nation id to open in that country's
 * view, centred on its land.
 */
export function openMapView(player, opts = {}) {
  if (!player || sessions.has(player.id)) return;
  const here = player.dimension?.id === "minecraft:overworld" ? player.location : { x: 0, z: 0 };
  const sess = {
    player,
    view: { x: Math.round(here.x), z: Math.round(here.z), zoom: 4, mode: "political", persp: null },
    ci: W / 2,
    cj: MH / 2,
    tool: "look",
    frame: null,
    decor: [],
    building: false,
    needBase: true,
    needSend: true,
    lastSend: -99,
    lastBase: 0,
    jumpWas: true, // ignore the press that opened the map
    sneakWas: true,
    held: 0,
    busy: false,
    corner: null,
    toast: "",
    toastUntil: 0,
    lastPaint: "",
    slot: safe(() => player.selectedSlotIndex, 0),
  };
  if (opts.persp && S().nations[opts.persp]) {
    sess.view.mode = "diplomatic";
    sess.view.persp = opts.persp;
    fitTo(sess, ownersOf(S().nations[opts.persp]));
  }
  sessions.set(player.id, sess);
  lock(player, true);
  say(sess, "MAP OPEN - SNEAK FOR THE MENU");
}

export function closeMapView(player) {
  const sess = sessions.get(player.id);
  sessions.delete(player.id);
  lock(player, false);
  try {
    player.onScreenDisplay.setActionBar("§7Map closed");
  } catch {
    // left
  }
  return sess;
}

/** Anyone who left the game with the map open gets their controls back. */
export function releaseIfStuck(player) {
  try {
    if (player.getDynamicProperty(FLAG) && !sessions.has(player.id)) lock(player, false);
  } catch {
    // ignore
  }
}

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

function say(sess, text) {
  sess.toast = text;
  sess.toastUntil = ticks + 60;
  sess.needSend = true;
}

// ---------- every tick ----------

export function mapTick() {
  ticks++;
  for (const sess of sessions.values()) {
    try {
      step(sess);
    } catch (e) {
      console.warn(`[Electoral] map: ${e}`);
      closeMapView(sess.player);
    }
  }
}

function step(sess) {
  const p = sess.player;
  if (!p.isValid && p.isValid !== undefined) {
    sessions.delete(p.id);
    return;
  }
  if (!sess.busy) readInput(sess);
  if (ticks - sess.lastBase > 100) sess.needBase = true; // keep up with the world
  if (sess.needBase && !sess.building) buildBase(sess);
  if (sess.toast && ticks > sess.toastUntil) {
    sess.toast = "";
    sess.needSend = true;
  }
  if (sess.frame && ((sess.needSend && ticks - sess.lastSend >= 2) || ticks - sess.lastSend > 60)) send(sess);
}

function readInput(sess) {
  const p = sess.player;
  const input = p.inputInfo;
  if (!input) return;
  const mv = input.getMovementVector() || { x: 0, y: 0 };
  const jump = input.getButtonState(JUMP) === "Pressed";
  const sneak = input.getButtonState(SNEAK) === "Pressed";
  // hotbar scroll = zoom
  const slot = safe(() => p.selectedSlotIndex, sess.slot);
  if (slot !== sess.slot) {
    const d = (slot - sess.slot + 9) % 9;
    zoom(sess, d <= 4 ? 1 : -1);
    try {
      p.selectedSlotIndex = sess.slot;
    } catch {
      sess.slot = slot;
    }
  }
  // move the cursor; at the edge the map scrolls
  if (Math.abs(mv.x) > 0.15 || Math.abs(mv.y) > 0.15) {
    sess.held++;
    const speed = Math.min(4, 0.7 + sess.held * 0.1);
    sess.ci -= mv.x * speed;
    sess.cj -= mv.y * speed;
    sess.needSend = true;
    const mx = Math.floor(W / 4);
    const my = Math.floor(MH / 4);
    if (sess.ci < 1) pan(sess, -mx, 0);
    if (sess.ci > W - 2) pan(sess, mx, 0);
    if (sess.cj < 1) pan(sess, 0, -my);
    if (sess.cj > MH - 2) pan(sess, 0, my);
  } else sess.held = 0;
  if (sneak && !sess.sneakWas) {
    sess.sneakWas = true;
    sess.jumpWas = true;
    openMenu(sess);
    return;
  }
  sess.sneakWas = sneak;
  if (jump && !sess.jumpWas) useTool(sess, true);
  else if (jump && sess.tool === "paint") useTool(sess, false);
  sess.jumpWas = jump;
}

function pan(sess, di, dj) {
  sess.view.x += di * sess.view.zoom;
  sess.view.z += dj * sess.view.zoom;
  sess.ci = Math.min(W - 2, Math.max(1, sess.ci - di));
  sess.cj = Math.min(MH - 2, Math.max(1, sess.cj - dj));
  sess.needBase = true;
}

function zoom(sess, dir) {
  const v = sess.view;
  const k = ZOOMS.indexOf(v.zoom);
  const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (k < 0 ? 2 : k) + dir))];
  if (next === v.zoom) return;
  // keep the spot under the cursor where it is
  const at = cursorWorld(sess);
  v.zoom = next;
  v.x = Math.round(at.x - (Math.floor(sess.ci) - W / 2 + 0.5) * next);
  v.z = Math.round(at.z - (Math.floor(sess.cj) - MH / 2 + 0.5) * next);
  sess.needBase = true;
  say(sess, `ZOOM 1:${next}`);
}

const cursorWorld = (sess) => pixelToWorld(sess.view, Math.floor(sess.ci), Math.floor(sess.cj));
const cursorChunk = (sess) => {
  const w = cursorWorld(sess);
  return chunkOf(w.x, w.z);
};

// ---------- drawing ----------

function buildBase(sess) {
  sess.needBase = false;
  sess.building = true;
  sess.lastBase = ticks;
  const frame = newFrame(sess.view);
  const gen = drawBase(S(), terrain, frame);
  const job = function* () {
    try {
      for (const _ of gen) yield;
      if (sameView(frame.view, sess.view)) {
        sess.frame = frame;
        sess.decor = decorations(S(), frame);
        sess.needSend = true;
      } else sess.needBase = true;
    } finally {
      sess.building = false;
    }
  };
  try {
    system.runJob(job());
  } catch {
    sess.building = false;
  }
}

const sameView = (a, b) => a.x === b.x && a.z === b.z && a.zoom === b.zoom && a.mode === b.mode && a.persp === b.persp;

/** Redraws a few chunks straight away after painting. */
function redrawChunks(sess, cx0, cz0, cx1, cz1) {
  if (!sess.frame || !sameView(sess.frame.view, sess.view)) return;
  const box = chunkBox(sess.view, cx0, cz0, cx1, cz1);
  if (box[2] < 0 || box[3] < 0 || box[0] >= W || box[1] >= MH) return;
  finish(drawBase(S(), terrain, sess.frame, box));
  sess.needSend = true;
  sess.lastBase = ticks - 60; // full refresh (names) soon
}

function players() {
  const out = [];
  for (const p of world.getPlayers()) {
    try {
      if (p.dimension.id === "minecraft:overworld") out.push({ id: p.id, x: p.location.x, z: p.location.z });
    } catch {
      // ignore
    }
  }
  return out;
}

function hoverText(sess) {
  const state = S();
  const [cx, cz] = cursorChunk(sess);
  const owner = ownerAt(state, cx, cz);
  const info = owner ? ownerIndex(state)[owner] : null;
  if (!info) return "UNCLAIMED";
  let t = info.region ? `${info.nation.name} - ${info.region.name}` : `${info.nation.name}`;
  if (sess.view.mode === "diplomatic" && sess.view.persp && info.nation.id !== sess.view.persp) t += ` (${STANCE_BY_ID[getStance(state, sess.view.persp, info.nation.id)]?.name || "NEUTRAL"})`;
  return t;
}

function toolText(sess) {
  const t = TOOLS[sess.tool];
  const b = brushes.get(sess.player.id);
  if (sess.tool === "look") return `${t.short} - JUMP ON A PLACE`;
  if (sess.tool === "city") return `${t.short} - JUMP WHERE IT GOES`;
  const what = b ? b.label : "PICK A BRUSH";
  if (sess.tool === "rect") return `${t.short} ${what}${sess.corner ? " - CORNER 2?" : ""}`;
  if (sess.tool === "paint") return `${t.short} ${what} R${b?.radius ?? 0}`;
  return `${t.short} ${what}`;
}

function send(sess) {
  const v = sess.view;
  const ci = Math.floor(sess.ci);
  const cj = Math.floor(sess.cj);
  let box = null;
  const b = brushes.get(sess.player.id);
  const [cx, cz] = cursorChunk(sess);
  if (sess.tool === "paint" && b) box = chunkBox(v, cx - b.radius, cz - b.radius, cx + b.radius, cz + b.radius);
  else if (sess.tool === "rect" && sess.corner) box = chunkBox(v, Math.min(sess.corner[0], cx), Math.min(sess.corner[1], cz), Math.max(sess.corner[0], cx), Math.max(sess.corner[1], cz));
  else if (v.zoom <= 4) box = chunkBox(v, cx, cz, cx, cz);
  const persp = v.persp ? S().nations[v.persp] : null;
  const mode = v.mode === "diplomatic" && persp ? `${persp.name}'S VIEW` : MODES[v.mode];
  const w = cursorWorld(sess);
  const text = compose(
    sess.frame,
    [sess.decor, playerDots(v, players(), sess.player.id), cursorPixels(ci, cj, box)],
    [toolText(sess), `${mode} 1:${v.zoom}`],
    [sess.toast || hoverText(sess), `${Math.round(w.x)} ${Math.round(w.z)}`],
  );
  try {
    sess.player.onScreenDisplay.setActionBar(text);
  } catch {
    // left
  }
  sess.needSend = false;
  sess.lastSend = ticks;
}

// ---------- tools ----------

function painter(player) {
  const admin = isAdmin(player);
  const idx = ownerIndex(S());
  return (old) => admin || (idx[old] && canRun(player, idx[old].nation));
}

function brushFor(sess) {
  const b = brushes.get(sess.player.id);
  if (b && b.target && !ownerIndex(S())[b.target]) {
    brushes.delete(sess.player.id);
    return null;
  }
  return b || null;
}

function useTool(sess, press) {
  const state = S();
  const [cx, cz] = cursorChunk(sess);
  if (sess.tool === "look") {
    if (press) inspect(sess, cx, cz);
    return;
  }
  if (sess.tool === "city") {
    if (press) foundCity(sess, cx, cz);
    return;
  }
  const b = brushFor(sess);
  if (!b) {
    if (press) chooseBrush(sess);
    return;
  }
  const can = painter(sess.player);
  if (sess.tool === "paint") {
    const k = `${cx},${cz}`;
    if (!press && k === sess.lastPaint) return;
    sess.lastPaint = k;
    const n = paintSquare(state, cx, cz, b.radius, b.target, can);
    if (n) {
      redrawChunks(sess, cx - b.radius, cz - b.radius, cx + b.radius, cz + b.radius);
      markDirty();
    }
    return;
  }
  if (!press) return;
  if (sess.tool === "rect") {
    if (!sess.corner) {
      sess.corner = [cx, cz];
      say(sess, "CORNER 1 SET - MOVE AND JUMP AGAIN");
      return;
    }
    const a = sess.corner;
    sess.corner = null;
    const n = fillRect(state, a, [cx, cz], b.target, can);
    if (n < 0) return say(sess, "TOO BIG - FILL IN SMALLER PIECES");
    redrawChunks(sess, Math.min(a[0], cx), Math.min(a[1], cz), Math.max(a[0], cx), Math.max(a[1], cz));
    markDirty();
    say(sess, `FILLED ${n} CHUNKS`);
    return;
  }
  if (sess.tool === "fill") {
    if (sess.view.zoom > 32) return say(sess, "ZOOM IN TO USE THE BUCKET");
    const tl = pixelToWorld(sess.view, 0, 0);
    const br = pixelToWorld(sess.view, W - 1, MH - 1);
    const box = [...chunkOf(tl.x, tl.z), ...chunkOf(br.x, br.z)];
    const n = floodFill(state, cx, cz, b.target, can, box);
    if (n < 0) return say(sess, "TOO BIG - ZOOM IN");
    if (!n) return say(sess, "NOTHING TO FILL THERE");
    sess.needBase = true;
    markDirty();
    say(sess, `FILLED ${n} CHUNKS`);
  }
}

let saveAt = 0;
function markDirty() {
  if (!saveAt) saveAt = ticks + 100;
}

/** Saves painting a few seconds after the last stroke. */
export function flushMapEdits() {
  if (saveAt && ticks >= saveAt) {
    saveAt = 0;
    commit();
  }
}

// ---------- menus (Sneak) ----------

async function withForm(sess, fn) {
  sess.busy = true;
  try {
    return await fn();
  } catch (e) {
    console.warn(`[Electoral] map menu: ${e}`);
  } finally {
    sess.busy = false;
    sess.jumpWas = true;
    sess.sneakWas = true;
    sess.needSend = true;
  }
}

function paintTargets(player) {
  const out = [];
  for (const n of Object.values(S().nations)) {
    if (!canRun(player, n)) continue;
    out.push({ label: `${n.name} (country land)`, key: `n:${n.id}` });
    for (const r of n.regions) out.push({ label: `${n.name} - ${r.name}`, key: r.id });
  }
  if (out.length) out.push({ label: "Eraser (unclaim)", key: null });
  return out;
}

const ownersOf = (nation) => (nation ? new Set([`n:${nation.id}`, ...nation.regions.map((r) => r.id)]) : null);

function fitTo(sess, owners) {
  const b = bounds(S(), owners);
  if (!b) return false;
  const v = sess.view;
  v.x = Math.round(((b[0] + b[2] + 1) / 2) * 16);
  v.z = Math.round(((b[1] + b[3] + 1) / 2) * 16);
  const span = Math.max(((b[2] - b[0] + 1) * 16) / (W - 20), ((b[3] - b[1] + 1) * 16) / (MH - 12));
  v.zoom = ZOOMS.find((z) => z >= span) || ZOOMS[ZOOMS.length - 1];
  sess.ci = W / 2;
  sess.cj = MH / 2;
  sess.needBase = true;
  return true;
}

function openMenu(sess) {
  return withForm(sess, () => mapMenu(sess));
}

async function mapMenu(sess) {
  const player = sess.player;
  const r = await loop(player, () => {
    if (!sessions.has(player.id)) return null;
    const state = S();
    const canPaint = paintTargets(player).length > 0;
    const b = brushFor(sess);
    const v = sess.view;
    const persp = v.persp ? state.nations[v.persp] : null;
    const tool = (id, extra = "") => ({ text: `${sess.tool === id ? "§2> " : ""}${TOOLS[id].name}${extra}`, run: () => { sess.tool = id; sess.corner = null; return "back"; } });
    return {
      title: "Map",
      body: [
        "§7Steer the cursor with your movement keys or stick, §fJump§7 to use the tool, §fSneak§7 for this menu, §fscroll the hotbar§7 to zoom.",
        "",
        `§7Tool: §f${TOOLS[sess.tool].name}${b ? `§7 · brush §f${b.label}` : ""}`,
        `§7Showing: §f${v.mode === "diplomatic" && persp ? `${persp.name}'s view` : v.mode === "terrain" ? "terrain" : "the world"}§7 · zoom 1 pixel = §f${v.zoom}§7 block${v.zoom > 1 ? "s" : ""}`,
      ].join("\n"),
      options: [
        tool("look", " §8(click places for info)"),
        canPaint && tool("paint"),
        canPaint && tool("rect"),
        canPaint && tool("fill"),
        canPaint && tool("city"),
        canPaint && { text: b ? `Brush: ${b.label.slice(0, 34)} (size ${b.radius})` : "§eChoose What to Paint", run: () => chooseBrush(sess) },
        { text: "Map Style", run: () => chooseStyle(sess) },
        { text: "Zoom In", run: () => { zoom(sess, -1); return "back"; } },
        { text: "Zoom Out", run: () => { zoom(sess, 1); return "back"; } },
        { text: "Go To...", run: () => goTo(sess) },
        isAdmin(player) && { text: "§7Map the Land Around Me", run: () => { scanAround(player, 64, (n) => { say(sess, `MAPPED ${n} SPOTS`); sess.needBase = true; }); say(sess, "MAPPING THE LAND AROUND YOU..."); return "back"; } },
        { text: "Get a World Map Item", run: () => { say(sess, giveMapItem(player) ? "MAP ITEM ADDED - USE IT TO OPEN THE MAP" : "INVENTORY FULL"); return "back"; } },
        { text: "§cClose Map", run: () => { closeMapView(player); return CLOSE; } },
      ],
    };
  }, "§aBack to the Map");
  return r;
}

async function chooseBrush(sess) {
  const player = sess.player;
  const targets = paintTargets(player);
  if (!targets.length) return notice(player, "Paint", "You don't run any country. Ask an admin to add you as a Ruler of one.");
  const cur = brushes.get(player.id);
  const r = await modal(player, "What to Paint", [
    { key: "t", type: "dropdown", label: "Paint which country or city?", options: targets.map((x) => x.label.slice(0, 60)), value: Math.max(0, targets.findIndex((x) => x.key === cur?.target)) },
    { key: "r", type: "slider", label: "Brush size (0 = one chunk, 1 = 3x3, 2 = 5x5...)", min: 0, max: 6, value: cur?.radius ?? 1 },
  ], "Pick");
  if (!r) return;
  const t = targets[r.t];
  brushes.set(player.id, { target: t.key, label: t.label, radius: r.r });
  if (sess.tool === "look" || sess.tool === "city") sess.tool = "paint";
  return "back";
}

async function chooseStyle(sess) {
  const player = sess.player;
  const nations = Object.values(S().nations);
  const opts = ["World - every country in its own colour", "Terrain - the land, with borders only", ...nations.map((n) => `${n.name}'s view - allies, enemies, war fronts, situations`.slice(0, 60))];
  const v = sess.view;
  const cur = v.mode === "terrain" ? 1 : v.mode === "diplomatic" ? 2 + Math.max(0, nations.findIndex((n) => n.id === v.persp)) : 0;
  const r = await modal(player, "Map Style", [{ key: "s", type: "dropdown", label: "How should the map look?", options: opts, value: cur }], "Show");
  if (!r) return;
  if (r.s === 0) Object.assign(v, { mode: "political", persp: null });
  else if (r.s === 1) Object.assign(v, { mode: "terrain", persp: null });
  else Object.assign(v, { mode: "diplomatic", persp: nations[r.s - 2].id });
  sess.needBase = true;
  return "back";
}

async function goTo(sess) {
  const player = sess.player;
  const state = S();
  const targets = [{ label: "Where I'm standing", run: () => centre(sess, player.location.x, player.location.z) }, { label: "Every country", run: () => fitTo(sess, null) || say(sess, "NOTHING IS CLAIMED YET") }];
  for (const n of Object.values(state.nations)) {
    targets.push({ label: n.name, run: () => fitTo(sess, ownersOf(n)) || say(sess, "NO LAND DRAWN YET") });
    for (const r of n.regions) targets.push({ label: `  ${r.name} (${n.name})`, run: () => fitTo(sess, new Set([r.id])) || say(sess, "NO LAND DRAWN YET") });
  }
  const w = cursorWorld(sess);
  const r = await modal(player, "Go To", [
    { key: "t", type: "dropdown", label: "Where?", options: [...targets.map((x) => x.label.slice(0, 60)), "These coordinates:"] },
    { key: "x", type: "text", label: "X", value: String(Math.round(w.x)) },
    { key: "z", type: "text", label: "Z", value: String(Math.round(w.z)) },
  ], "Go");
  if (!r) return;
  if (r.t < targets.length) targets[r.t].run();
  else centre(sess, Number(r.x) || 0, Number(r.z) || 0);
  return "back";
}

function centre(sess, x, z) {
  sess.view.x = Math.round(x);
  sess.view.z = Math.round(z);
  sess.ci = W / 2;
  sess.cj = MH / 2;
  sess.needBase = true;
}

// ---------- inspecting a place ----------

function inspect(sess, cx, cz) {
  return withForm(sess, () => placeMenu(sess, cx, cz));
}

function placeMenu(sess, cx, cz) {
  const player = sess.player;
  return loop(player, () => {
    if (!sessions.has(player.id)) return null;
    const state = S();
    const owner = ownerAt(state, cx, cz);
    const info = owner ? ownerIndex(state)[owner] : null;
    const lines = [`§7Chunk §f${cx}, ${cz}§7 (blocks ${cx * 16}, ${cz * 16})`];
    const options = [];
    const targets = paintTargets(player);
    if (!info) {
      lines.push("", "§fUnclaimed land.");
      if (targets.length) {
        options.push({ text: "Claim This Chunk For...", run: () => claimOne(sess, cx, cz) });
        options.push({ text: "Found a City Here", run: () => foundCityForm(sess, cx, cz) });
      }
    } else {
      const { nation, region } = info;
      lines.push("", `${nation.color}§l${nation.name}§r`);
      const leader = state.persons[nation.leaderId];
      if (leader) lines.push(`§7Led by §f${leader.name}`);
      if (sess.view.persp && sess.view.persp !== nation.id) lines.push(`§7Relation with ${state.nations[sess.view.persp]?.name}: §f${STANCE_BY_ID[getStance(state, sess.view.persp, nation.id)]?.name}`);
      if (region) {
        lines.push("", regionProfile(state, nation, region));
        const sits = (nation.situations || []).filter((s) => (s.status === "active" || s.status === "ruling") && (s.regionIds || []).includes(region.id));
        for (const s of sits) options.push({ text: `§c${s.title}`.slice(0, 60), run: () => situationPage(player, nation, s) });
      } else lines.push("§7Country land outside any city or county.");
      if (canRun(player, nation)) {
        options.push({ text: `Paint with ${region ? region.name : nation.name}`.slice(0, 60), run: () => { brushes.set(player.id, { target: owner, label: region ? `${nation.name} - ${region.name}` : `${nation.name} (country land)`, radius: brushes.get(player.id)?.radius ?? 1 }); sess.tool = "paint"; return CLOSE; } });
        if (region) {
          options.push({ text: "Manage This County", run: () => countyMenu(player, nation, region) });
          const others = Object.values(state.nations).filter((n) => n.id !== nation.id);
          if (others.length) options.push({ text: `Give ${region.name} to Another Country`.slice(0, 60), run: () => giveAway(player, nation, region, others) });
        }
        options.push({ text: "§7Unclaim This Chunk", run: () => { paintSquare(S(), cx, cz, 0, null, painter(player)); redrawChunks(sess, cx, cz, cx, cz); markDirty(); return "back"; } });
      }
      options.push({ text: `Open ${nation.name} on the Board`.slice(0, 60), run: () => nationView(player, nation) });
    }
    return { title: info ? (info.region ? info.region.name : info.nation.name).slice(0, 40) : "Unclaimed", body: lines.join("\n"), options };
  }, "§aBack to the Map");
}

async function giveAway(player, nation, region, others) {
  const r = await modal(player, `Give ${region.name} Away`, [{ key: "to", type: "dropdown", label: `Hand ${region.name} - its land, people and voting history - to:`, options: others.map((n) => n.name) }], "Give");
  if (!r || !(await confirm(player, "Hand Over", `Give ${region.name} to ${others[r.to].name}?`, "§cGive it"))) return;
  transferRegion(S(), region, others[r.to]);
  commit();
  announce(`§6[Borders]§r ${region.name} now belongs to ${others[r.to].color}${others[r.to].name}§r.`);
  for (const s of sessions.values()) s.needBase = true;
  return "back";
}

async function claimOne(sess, cx, cz) {
  const targets = paintTargets(sess.player);
  const r = await modal(sess.player, "Claim", [{ key: "t", type: "dropdown", label: "Claim this chunk for:", options: targets.filter((t) => t.key).map((t) => t.label.slice(0, 60)) }], "Claim");
  if (!r) return;
  const t = targets.filter((x) => x.key)[r.t];
  paintSquare(S(), cx, cz, 0, t.key, painter(sess.player));
  brushes.set(sess.player.id, { target: t.key, label: t.label, radius: brushes.get(sess.player.id)?.radius ?? 1 });
  redrawChunks(sess, cx, cz, cx, cz);
  markDirty();
  return "back";
}

// ---------- founding cities ----------

function foundCity(sess, cx, cz) {
  return withForm(sess, () => foundCityForm(sess, cx, cz));
}

async function foundCityForm(sess, cx, cz) {
  const player = sess.player;
  const nations = Object.values(S().nations).filter((n) => canRun(player, n));
  if (!nations.length) return notice(player, "Found a City", "You don't run any country. Ask an admin to add you as a Ruler of one.");
  const owner = ownerAt(S(), cx, cz);
  const here = owner ? ownerIndex(S())[owner]?.nation : null;
  const r = await modal(player, "Found a City", [
    { key: "n", type: "dropdown", label: "Which country does it belong to?", options: nations.map((n) => n.name), value: Math.max(0, nations.indexOf(here)) },
    { key: "name", type: "text", label: "Name §c(required)", placeholder: "Type the city / county name", value: "" },
    { key: "type", type: "dropdown", label: "What kind of place is it? (decides which interest groups live there)", options: REGION_TEMPLATES.map((t) => t.name) },
    { key: "r", type: "slider", label: "Starting land (chunks around this spot)", min: 0, max: 4, value: 1 },
  ], "Found");
  if (!r) return;
  if (!r.name.trim()) return notice(player, "Name needed", "Give the city a name - situations and results use the names you choose.");
  const state = S();
  const nation = nations[r.n];
  const region = addRegionOfType(state, nation, createRng(Math.floor(Math.random() * 2 ** 31)), REGION_TEMPLATES[r.type].id, r.name);
  const own = new Set([`n:${nation.id}`]);
  paintSquare(state, cx, cz, r.r, region.id, (old) => own.has(old) || painter(player)(old));
  commit();
  announce(`§6[Map]§r ${nation.color}${nation.name}§r founded §f${region.name}§r.`);
  sess.needBase = true;
  return "back";
}

// ---------- items and commands ----------

export const MAP_ITEM = "electoral:map_brush";

export function giveMapItem(player) {
  try {
    player.getComponent("minecraft:inventory").container.addItem(new ItemStack(MAP_ITEM, 1));
    return true;
  } catch {
    return false;
  }
}

export function shutdownAll() {
  for (const s of [...sessions.values()]) closeMapView(s.player);
}

// for tests
export const _cursor = (player) => cursorWorld(sessions.get(player.id));
export const _view = (player) => sessions.get(player.id).view;
