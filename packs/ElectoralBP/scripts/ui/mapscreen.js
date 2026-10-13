// The map screen: a full-screen map drawn on the HUD. While it is open the
// player stands still and the controls drive the map instead:
//
//   Move keys / stick   move the cursor (push against an edge to scroll)
//   Jump                select the place under the cursor - or, while drawing, hold to paint
//   Sneak               the map menu - or, while drawing, stop drawing
//   Scroll the hotbar   zoom
//
// Selecting a place opens what you can do there: claim it, declare war for it,
// draw your borders, found a city, manage it. Drawing is a paintbrush that stays
// the same size on screen, so zoom in for detail. The map fills itself in
// wherever you look (see survey.js).

import { system, world, InputButton, InputPermissionCategory, ItemStack } from "@minecraft/server";
import { REGION_TEMPLATES } from "../data/blocs.js";
import { createRng } from "../core/random.js";
import { terrain } from "../core/terrain.js";
import { getStance, STANCE_BY_ID } from "../engine/diplomacy.js";
import { addRegionOfType } from "../engine/generate.js";
import { bounds, chunkOf, ownerAt, ownerIndex, paintDisc, transferRegion } from "../engine/territory.js";
import { casusBelli, claimsBy, claimsOn, declareWar, dropClaim, endWar, hasClaim, pressClaim, warBetween, warsOf } from "../engine/wars.js";
import { chunkBox, compose, cursorPixels, decorations, drawBase, finish, MH, newFrame, pixelToWorld, playerDots, W, ZOOMS } from "../engine/mapview.js";
import { regionProfile } from "./render.js";
import { confirm, modal, notice } from "./forms.js";
import { canRun, CLOSE, commit, isAdmin, loop, S, announce } from "./nav.js";
import { situationPage } from "./situations.js";
import { countyMenu } from "./setup.js";
import { nationView } from "./board.js";
import { surveying, surveyTick, surveyVersion } from "./survey.js";

const FLAG = "electoral:mapOpen";
const JUMP = InputButton?.Jump ?? "Jump";
const SNEAK = InputButton?.Sneak ?? "Sneak";
const LOCKED = ["Camera", "Movement", "LateralMovement", "Sneak", "Jump", "Mount", "Dismount", "MoveForward", "MoveBackward", "MoveLeft", "MoveRight"];
const MODES = { political: "WORLD", diplomatic: "VIEW", terrain: "TERRAIN" };

const sessions = new Map(); // player id -> session
const actors = new Map(); // player id -> nation id they act as (kept between openings)
let ticks = 0;

export const inMapView = (player) => sessions.has(player.id);

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

// ---------- who the player plays as ----------

/** Countries this player may act for: the ones they rule (admins: all). */
const runnable = (player) => Object.values(S().nations).filter((n) => canRun(player, n));

function actorOf(sess) {
  const id = sess.actor;
  const n = id ? S().nations[id] : null;
  if (n && canRun(sess.player, n)) return n;
  // rulers act for their own country; admins pick one in the menu
  const mine = runnable(sess.player).filter((x) => !isAdmin(sess.player) || (x.rulers || []).some((r) => r.toLowerCase() === sess.player.name.toLowerCase()));
  sess.actor = mine.length === 1 ? mine[0].id : null;
  return sess.actor ? S().nations[sess.actor] : null;
}

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

/** Opens the map. opts.persp = a country to open in, centred on its land. */
export function openMapView(player, opts = {}) {
  if (!player || sessions.has(player.id)) return;
  const here = player.dimension?.id === "minecraft:overworld" ? player.location : { x: 0, z: 0 };
  const sess = {
    player,
    view: { x: Math.round(here.x), z: Math.round(here.z), zoom: 4, mode: "political", persp: null },
    ci: W / 2,
    cj: MH / 2,
    actor: actors.get(player.id) || null,
    drawing: null, // { target, label } while painting
    frame: null,
    decor: [],
    building: false,
    needBase: true,
    needSend: true,
    lastSend: -99,
    lastBase: 0,
    seenSurvey: surveyVersion,
    jumpWas: true, // ignore the press that opened the map
    sneakWas: true,
    held: 0,
    busy: false,
    toast: "",
    toastUntil: 0,
    lastPaint: null,
    slot: safe(() => player.selectedSlotIndex, 0),
  };
  sessions.set(player.id, sess);
  const persp = (opts.persp && S().nations[opts.persp]) || actorOf(sess);
  if (persp) {
    sess.view.mode = "diplomatic";
    sess.view.persp = persp.id;
    if (opts.persp) fitTo(sess, ownersOf(persp));
  }
  lock(player, true);
  say(sess, "JUMP ON A PLACE TO SELECT IT - SNEAK FOR THE MENU", 100);
}

export function closeMapView(player) {
  const sess = sessions.get(player.id);
  sessions.delete(player.id);
  if (sess?.actor) actors.set(player.id, sess.actor);
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

function say(sess, text, ticksLong = 60) {
  sess.toast = text;
  sess.toastUntil = ticks + ticksLong;
  sess.needSend = true;
}

// ---------- every tick ----------

export function mapTick() {
  ticks++;
  const viewers = [];
  for (const sess of sessions.values()) {
    try {
      step(sess);
      viewers.push({ id: sess.player.id, view: sess.view });
    } catch (e) {
      console.warn(`[Electoral] map: ${e}`);
      closeMapView(sess.player);
    }
  }
  try {
    surveyTick(viewers);
  } catch (e) {
    console.warn(`[Electoral] map survey: ${e}`);
  }
}

function step(sess) {
  const p = sess.player;
  if (p.isValid === false) {
    sessions.delete(p.id);
    return;
  }
  if (!sess.busy) readInput(sess);
  // new land read in, or the world changed: redraw
  if (surveyVersion !== sess.seenSurvey && ticks - sess.lastBase > 20) {
    sess.seenSurvey = surveyVersion;
    sess.needBase = true;
  }
  if (ticks - sess.lastBase > 100) sess.needBase = true;
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
    const speed = Math.min(sess.drawing ? 2.5 : 4, 0.7 + sess.held * 0.1);
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
    if (sess.drawing) stopDrawing(sess);
    else openMenu(sess);
    return;
  }
  sess.sneakWas = sneak;
  if (sess.drawing) {
    if (jump) paintAtCursor(sess);
    else sess.lastPaint = null;
  } else if (jump && !sess.jumpWas) selectPlace(sess);
  sess.jumpWas = jump;
}

function pan(sess, di, dj) {
  sess.view.x += di * sess.view.zoom;
  sess.view.z += dj * sess.view.zoom;
  sess.ci = Math.min(W - 2, Math.max(1, sess.ci - di));
  sess.cj = Math.min(MH - 2, Math.max(1, sess.cj - dj));
  sess.lastPaint = null;
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
  sess.lastPaint = null;
  sess.needBase = true;
  say(sess, `ZOOM 1:${next}`);
}

const cursorWorld = (sess) => pixelToWorld(sess.view, Math.floor(sess.ci), Math.floor(sess.cj));
const cursorChunk = (sess) => {
  const w = cursorWorld(sess);
  return chunkOf(w.x, w.z);
};

// ---------- drawing the picture ----------

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
  sess.lastBase = Math.min(sess.lastBase, ticks - 60); // full refresh (names) soon
}

/** Redraw every open map (after claims, wars, new cities...). */
const refreshAll = () => {
  for (const s of sessions.values()) s.needBase = true;
};

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

function placeName(state, owner) {
  const info = owner ? ownerIndex(state)[owner] : null;
  if (!info) return null;
  return info.region ? `${info.nation.name} - ${info.region.name}` : info.nation.name;
}

function hoverText(sess) {
  const state = S();
  const [cx, cz] = cursorChunk(sess);
  const owner = ownerAt(state, cx, cz);
  const info = owner ? ownerIndex(state)[owner] : null;
  if (!info) return "UNCLAIMED LAND";
  let t = placeName(state, owner);
  const me = sess.view.persp;
  if (sess.view.mode === "diplomatic" && me && info.nation.id !== me) {
    t += ` (${STANCE_BY_ID[getStance(state, me, info.nation.id)]?.name || "NEUTRAL"}${info.region && hasClaim(state, me, info.region.id) ? ", CLAIMED" : ""})`;
  }
  return t;
}

const brushRadius = (zoom) => Math.min(16, Math.round((2 * zoom) / 16));

function send(sess) {
  const v = sess.view;
  const ci = Math.floor(sess.ci);
  const cj = Math.floor(sess.cj);
  const [cx, cz] = cursorChunk(sess);
  let box = null;
  if (sess.drawing) {
    const r = brushRadius(v.zoom);
    box = chunkBox(v, cx - r, cz - r, cx + r, cz + r);
  } else if (v.zoom <= 4) box = chunkBox(v, cx, cz, cx, cz);
  const persp = v.persp ? S().nations[v.persp] : null;
  const mode = v.mode === "diplomatic" && persp ? `${persp.name}'S VIEW` : MODES[v.mode];
  const w = cursorWorld(sess);
  const top = sess.drawing ? `DRAWING ${sess.drawing.label} - HOLD JUMP` : actorOf(sess) ? `PLAYING AS ${actorOf(sess).name}` : "WORLD MAP";
  const busy = surveying();
  const text = compose(
    sess.frame,
    [sess.decor, playerDots(v, players(), sess.player.id), cursorPixels(ci, cj, box)],
    [top, `${mode} 1:${v.zoom}`],
    [sess.toast || (sess.drawing ? "SNEAK WHEN DONE DRAWING" : hoverText(sess)), busy ? `MAPPING ${busy}` : `${Math.round(w.x)} ${Math.round(w.z)}`],
  );
  try {
    sess.player.onScreenDisplay.setActionBar(text);
  } catch {
    // left
  }
  sess.needSend = false;
  sess.lastSend = ticks;
}

// ---------- painting ----------

function painter(player) {
  const admin = isAdmin(player);
  const idx = ownerIndex(S());
  // you can paint over empty land and your own; other countries' land needs a war
  return (old) => admin || (idx[old] && canRun(player, idx[old].nation));
}

function startDrawing(sess, target, label) {
  sess.drawing = { target, label };
  sess.lastPaint = null;
  say(sess, "HOLD JUMP AND MOVE TO DRAW - SNEAK WHEN DONE", 100);
}

function stopDrawing(sess) {
  sess.drawing = null;
  sess.lastPaint = null;
  commit();
  refreshAll();
  say(sess, "DONE DRAWING");
}

function paintAtCursor(sess) {
  const state = S();
  const d = sess.drawing;
  if (d.target && !ownerIndex(state)[d.target]) return stopDrawing(sess);
  const [cx, cz] = cursorChunk(sess);
  const r = brushRadius(sess.view.zoom);
  const can = painter(sess.player);
  // stamp along the path since the last tick so fast strokes have no gaps
  const from = sess.lastPaint || [cx, cz];
  if (sess.lastPaint && from[0] === cx && from[1] === cz) return;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(cx - from[0]), Math.abs(cz - from[1])) / Math.max(1, r)));
  let n = 0;
  for (let k = 1; k <= steps; k++) {
    const x = Math.round(from[0] + ((cx - from[0]) * k) / steps);
    const z = Math.round(from[1] + ((cz - from[1]) * k) / steps);
    n += paintDisc(state, x, z, r, d.target, can);
  }
  sess.lastPaint = [cx, cz];
  if (n) {
    redrawChunks(sess, Math.min(from[0], cx) - r, Math.min(from[1], cz) - r, Math.max(from[0], cx) + r, Math.max(from[1], cz) + r);
    markDirty();
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

// ---------- forms over the map ----------

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

function centre(sess, x, z) {
  sess.view.x = Math.round(x);
  sess.view.z = Math.round(z);
  sess.ci = W / 2;
  sess.cj = MH / 2;
  sess.needBase = true;
}

// ---------- the menu (Sneak) ----------

function openMenu(sess) {
  return withForm(sess, () => mapMenu(sess));
}

function mapMenu(sess) {
  const player = sess.player;
  return loop(player, () => {
    if (!sessions.has(player.id)) return null;
    const me = actorOf(sess);
    const mine = runnable(player);
    const wars = me ? warsOf(S(), me.id) : [];
    return {
      title: "Map",
      body: [
        "§fMove§7 the cursor, §fJump§7 on a place to select it, §fscroll the hotbar§7 to zoom.",
        me ? `§7Playing as ${me.color}${me.name}` : mine.length ? "§7Pick which country you play as to claim land and declare wars." : "§7You don't rule a country, so you can look but not change the map.",
      ].join("\n"),
      options: [
        mine.length > 0 && { text: "§2Draw Borders", run: () => chooseDrawing(sess) },
        (mine.length > 1 || (isAdmin(player) && mine.length)) && { text: me ? `Playing as: ${me.name}`.slice(0, 60) : "§eChoose Your Country", run: () => chooseActor(sess) },
        me && { text: `Wars & Claims${wars.length ? ` §c(${wars.length} at war)` : ""}`, run: () => warsMenu(sess, me) },
        { text: "Map Style", run: () => chooseStyle(sess) },
        { text: "Go To...", run: () => goTo(sess) },
        { text: "Get a World Map Item", run: () => { say(sess, giveMapItem(player) ? "MAP ITEM ADDED - USE IT TO OPEN THE MAP" : "INVENTORY FULL"); return "back"; } },
        { text: "§cClose Map", run: () => { closeMapView(player); return CLOSE; } },
      ],
    };
  }, "§aBack to the Map");
}

async function chooseActor(sess) {
  const list = runnable(sess.player);
  const r = await modal(sess.player, "Play As", [{ key: "n", type: "dropdown", label: "Which country are you playing as?", options: list.map((n) => n.name), value: Math.max(0, list.findIndex((n) => n.id === sess.actor)) }], "Play");
  if (!r) return;
  sess.actor = list[r.n].id;
  actors.set(sess.player.id, sess.actor);
  Object.assign(sess.view, { mode: "diplomatic", persp: sess.actor });
  sess.needBase = true;
}

/** Draw Borders: pick what the brush paints, then draw. */
async function chooseDrawing(sess) {
  const player = sess.player;
  const me = actorOf(sess);
  const nations = me ? [me] : runnable(player);
  const opts = [];
  for (const n of nations) {
    opts.push({ label: `${n.name} (the country)`, target: `n:${n.id}`, short: n.name });
    for (const r of n.regions) opts.push({ label: `  ${r.name} (city / county of ${n.name})`, target: r.id, short: r.name });
    opts.push({ label: `  + A new city or county in ${n.name}`, nation: n });
  }
  opts.push({ label: "Eraser (unclaim land)", target: null, short: "ERASER" });
  const r = await modal(player, "Draw Borders", [{ key: "o", type: "dropdown", label: "What do you want to draw? Then hold Jump and move to paint it. Zoom in for fine edges.", options: opts.map((o) => o.label.slice(0, 60)) }], "Draw");
  if (!r) return;
  const o = opts[r.o];
  if (o.nation) {
    const region = await newCity(player, o.nation);
    if (!region) return;
    startDrawing(sess, region.id, region.name);
    return CLOSE;
  }
  startDrawing(sess, o.target, o.short);
  return CLOSE;
}

async function newCity(player, nation) {
  const r = await modal(player, `New City in ${nation.name}`, [
    { key: "name", type: "text", label: "Name §c(required)", placeholder: "Type the city / county name", value: "" },
    { key: "type", type: "dropdown", label: "What kind of place is it? (decides which interest groups live there)", options: REGION_TEMPLATES.map((t) => t.name) },
  ], "Create");
  if (!r) return null;
  if (!r.name.trim()) {
    await notice(player, "Name needed", "Give the city a name - situations and results use the names you choose.");
    return null;
  }
  const region = addRegionOfType(S(), nation, createRng(Math.floor(Math.random() * 2 ** 31)), REGION_TEMPLATES[r.type].id, r.name);
  commit();
  announce(`§6[Map]§r ${nation.color}${nation.name}§r founded §f${region.name}§r.`);
  return region;
}

async function chooseStyle(sess) {
  const player = sess.player;
  const nations = Object.values(S().nations);
  const opts = ["World - every country in its own colour", "Terrain - the land, with borders only", ...nations.map((n) => `${n.name}'s view - friends, enemies, claims, wars`.slice(0, 60))];
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

function warsMenu(sess, me) {
  const player = sess.player;
  return loop(player, () => {
    const state = S();
    const wars = warsOf(state, me.id);
    const claims = claimsBy(state, me.id);
    const lines = [];
    lines.push(wars.length ? "§6At war" : "§7Not at war.");
    for (const w of wars) {
      const foe = state.nations[w.attacker === me.id ? w.defender : w.attacker];
      lines.push(` §c${w.attacker === me.id ? "Attacking" : "Defending against"} ${foe?.name}§7 - ${w.goal}`);
    }
    lines.push("", claims.length ? "§6Our claims (each one is a casus belli)" : "§7No claims. Select another country's city on the map to claim it.");
    for (const c of claims) {
      const owner = Object.values(state.nations).find((n) => n.regions.some((r) => r.id === c.regionId));
      lines.push(` §a${owner?.regions.find((r) => r.id === c.regionId)?.name}§7 (held by ${owner?.name})`);
    }
    return {
      title: "Wars & Claims",
      body: lines.join("\n"),
      options: wars.map((w) => {
        const foe = state.nations[w.attacker === me.id ? w.defender : w.attacker];
        return { text: `§cGive In to ${foe?.name}`.slice(0, 60), run: () => giveIn(sess, me, w) };
      }),
    };
  });
}

async function giveIn(sess, me, war) {
  const foe = S().nations[war.attacker === me.id ? war.defender : war.attacker];
  const loses = war.attacker === me.id ? "Our claims in this war are dropped." : `${foe.name} takes what it fought for.`;
  if (!(await confirm(sess.player, "Give In", `End the war with ${foe.name} by giving in? ${loses}`, "§cGive In"))) return;
  endWar(S(), war, war.attacker === me.id ? "defender" : "attacker").forEach(announce);
  commit();
  refreshAll();
  return "back";
}

// ---------- selecting a place (Jump) ----------

function selectPlace(sess) {
  const [cx, cz] = cursorChunk(sess);
  return withForm(sess, () => placeMenu(sess, cx, cz));
}

function placeMenu(sess, cx, cz) {
  const player = sess.player;
  return loop(player, () => {
    if (!sessions.has(player.id)) return null;
    const state = S();
    const me = actorOf(sess);
    const owner = ownerAt(state, cx, cz);
    const info = owner ? ownerIndex(state)[owner] : null;
    const lines = [];
    const options = [];
    if (!info) {
      lines.push("§fUnclaimed land.");
      if (me) {
        options.push({ text: `§2Draw ${me.name}'s Borders Here`.slice(0, 60), run: () => { startDrawing(sess, `n:${me.id}`, me.name); return CLOSE; } });
        options.push({ text: "§2Found a City Here", run: () => foundHere(sess, me, cx, cz) });
      } else if (runnable(player).length) lines.push("", "§7Choose your country in the map menu (Sneak) to claim land.");
      return { title: "Unclaimed Land", body: lines.join("\n"), options };
    }
    const { nation, region } = info;
    lines.push(`${nation.color}§l${nation.name}§r${region ? ` - §f${region.name}` : ""}`);
    const leader = state.persons[nation.leaderId];
    if (leader) lines.push(`§7Led by §f${leader.name}`);
    if (me && me.id !== nation.id) {
      lines.push(`§7Relation with ${me.name}: §f${STANCE_BY_ID[getStance(state, me.id, nation.id)]?.name}`);
      const war = warBetween(state, me.id, nation.id);
      if (war) lines.push(`§cAt war: ${war.goal}`);
    }
    if (region) {
      const by = claimsOn(state, region.id).map((c) => state.nations[c.by]?.name).filter(Boolean);
      if (by.length) lines.push(`§6Claimed by: ${by.join(", ")}`);
      lines.push("", regionProfile(state, nation, region));
    } else lines.push("§7Country land outside any city or county.");

    if (me && me.id !== nation.id) {
      // CK3: claim it, then go to war for it
      const war = warBetween(state, me.id, nation.id);
      if (region && !hasClaim(state, me.id, region.id)) options.push({ text: `§6Press a Claim on ${region.name}`.slice(0, 60), run: () => claim(sess, me, region) });
      if (region && hasClaim(state, me.id, region.id)) options.push({ text: `§7Drop Our Claim on ${region.name}`.slice(0, 60), run: () => { dropClaim(S(), me.id, region.id); commit(); refreshAll(); } });
      if (!war) {
        if (region) options.push({ text: `§4Declare War for ${region.name}`.slice(0, 60), run: () => war_(sess, me, nation, region) });
        options.push({ text: `§4Declare War on All of ${nation.name}`.slice(0, 60), run: () => war_(sess, me, nation, null) });
      } else options.push({ text: `§cGive In to ${nation.name}`.slice(0, 60), run: () => giveIn(sess, me, war) });
    }
    if (canRun(player, nation)) {
      options.push({ text: `§2Draw ${region ? region.name : nation.name}'s Borders`.slice(0, 60), run: () => { startDrawing(sess, owner, region ? region.name : nation.name); return CLOSE; } });
      if (region) {
        options.push({ text: `Manage ${region.name}`.slice(0, 60), run: () => countyMenu(player, nation, region) });
        const others = Object.values(state.nations).filter((n) => n.id !== nation.id);
        if (others.length) options.push({ text: `Give ${region.name} to Another Country`.slice(0, 60), run: () => giveAway(player, nation, region, others) });
      } else options.push({ text: "§2Found a City Here", run: () => foundHere(sess, nation, cx, cz) });
    }
    if (region) for (const s of (nation.situations || []).filter((x) => (x.status === "active" || x.status === "ruling") && (x.regionIds || []).includes(region.id))) options.push({ text: `§c${s.title}`.slice(0, 60), run: () => situationPage(player, nation, s) });
    options.push({ text: `Open ${nation.name} on the Board`.slice(0, 60), run: () => nationView(player, nation) });
    return { title: (region ? region.name : nation.name).slice(0, 40), body: lines.join("\n"), options };
  }, "§aBack to the Map");
}

async function claim(sess, me, region) {
  const lines = pressClaim(S(), me, region);
  lines.forEach(announce);
  commit();
  refreshAll();
}

async function war_(sess, me, foe, region) {
  const cb = casusBelli(S(), me, foe, region);
  const what = region ? region.name : `all of ${foe.name}`;
  const warn = cb.justified ? `Casus belli: ${cb.label}.` : `§cNo valid casus belli§r (${cb.label}). ${me.name} will lose standing at home and with every other country. Press a claim first to avoid this.`;
  if (!(await confirm(sess.player, "Declare War", `${me.name} declares war on ${foe.name} for ${what}.\n\n${warn}\n\nThe war ends when a side gives in, or when an admin rules on it under Disputes.`, "§4Declare War"))) return;
  declareWar(S(), me, foe, region).forEach(announce);
  commit();
  refreshAll();
  return "back";
}

async function foundHere(sess, nation, cx, cz) {
  const region = await newCity(sess.player, nation);
  if (!region) return;
  paintDisc(S(), cx, cz, 1, region.id, painter(sess.player));
  commit();
  startDrawing(sess, region.id, region.name);
  return CLOSE;
}

async function giveAway(player, nation, region, others) {
  const r = await modal(player, `Give ${region.name} Away`, [{ key: "to", type: "dropdown", label: `Hand ${region.name} - its land, people and voting history - to:`, options: others.map((n) => n.name) }], "Give");
  if (!r || !(await confirm(player, "Hand Over", `Give ${region.name} to ${others[r.to].name}?`, "§cGive it"))) return;
  transferRegion(S(), region, others[r.to]);
  commit();
  announce(`§6[Borders]§r ${region.name} now belongs to ${others[r.to].color}${others[r.to].name}§r.`);
  refreshAll();
  return "back";
}

// ---------- items ----------

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
export const _session = (player) => sessions.get(player.id);
