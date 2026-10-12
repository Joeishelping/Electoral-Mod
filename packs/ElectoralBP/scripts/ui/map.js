// The World Map: borders painted onto the real world, viewed from no country's
// perspective (plain borders) or from one country's (home / allies / hostile /
// war fronts / situation markers). Plus the border-drawing tools.

import { GLYPH, tile } from "../data/glyphs.js";
import { STANCES } from "../engine/diplomacy.js";
import { SCENARIO_BY_ID } from "../data/scenarios.js";
import { bounds, chunkOf, fillRect, landStats, ownerAt, ownerIndex, paintSquare, renderMap } from "../engine/territory.js";
import { modal, notice } from "./forms.js";
import { canRun, CLOSE, commit, isAdmin, loop, S } from "./nav.js";

const SIZES = [
  { name: "Small (phone)", w: 17, h: 10 },
  { name: "Medium", w: 25, h: 13 },
  { name: "Large (PC)", w: 33, h: 17 },
];
const ZOOMS = [1, 2, 4, 8, 16, 32];
const views = new Map(); // player id -> view settings

// Active painting sessions: player id -> { target, nationId, radius, all, count }
export const paintSessions = new Map();

function playerChunk(player) {
  try {
    if (player.dimension && player.dimension.id !== "minecraft:overworld") return null;
    return chunkOf(player.location.x, player.location.z);
  } catch {
    return null;
  }
}

function viewFor(player) {
  let v = views.get(player.id);
  if (!v) {
    const here = playerChunk(player) || [0, 0];
    v = { cx: here[0], cz: here[1], zoom: 2, size: 1, persp: null };
    views.set(player.id, v);
  }
  return v;
}

/** Can this player paint over this owner key? Admins can paint anything. */
export function painterFor(player, state) {
  const admin = isAdmin(player);
  const mine = new Set(Object.values(state.nations).filter((n) => canRun(player, n)).map((n) => n.id));
  const idx = ownerIndex(state);
  return { admin, mine, canPaint: (old) => admin || (idx[old] && mine.has(idx[old].nation.id)) };
}

function activeMarkers(state, nation) {
  const markers = {};
  for (const s of nation.situations || []) {
    if (s.kind !== "situation" || (s.status !== "active" && s.status !== "ruling")) continue;
    const level = SCENARIO_BY_ID[s.tpl]?.kind === "opportunity" ? "opportunity" : s.severity >= 4 ? 2 : s.severity >= 2.5 ? 1 : 0;
    for (const id of s.regionIds) {
      const cur = markers[id];
      if (cur === undefined || cur === "opportunity" || (typeof level === "number" && level > cur)) markers[id] = level;
    }
  }
  return markers;
}

function legend(state, v) {
  const lines = [];
  if (!v.persp) {
    const stats = landStats(state);
    for (const n of Object.values(state.nations)) {
      const land = (stats[`n:${n.id}`] || 0) + n.regions.reduce((s, r) => s + (stats[r.id] || 0), 0);
      if (land) lines.push(`${tile(n.color)} ${n.color}${n.name}§7 - ${land} chunks`);
    }
    lines.push(`${GLYPH.wild} §7Unclaimed   ${GLYPH.you} §7You`);
    return lines;
  }
  const nation = state.nations[v.persp];
  lines.push(`${tile("§a")} §aHome   ${tile("§9")} §9Allies   ${tile("§b")} §bFriends/Trade   ${tile("§7")} §7Neutral`);
  lines.push(`${tile("§6")} §6Rivals/Tense   ${tile("§c")} §cAt war   ${GLYPH.front} §4Front line   ${GLYPH.you} §7You`);
  const rel = Object.values(state.nations).filter((o) => o.id !== nation.id).map((o) => {
    const key = [nation.id, o.id].sort().join("|");
    const s = STANCES.find((x) => x.id === (state.relations[key] || "neutral"));
    return `${s.color}${o.name}§7 (${s.name})`;
  });
  if (rel.length) lines.push(`§7Relations: ${rel.join(", ")}`);
  const sits = (nation.situations || []).filter((s) => s.kind === "situation" && (s.status === "active" || s.status === "ruling"));
  if (sits.length) {
    lines.push(`${GLYPH.situation[0]}${GLYPH.situation[1]}${GLYPH.situation[2]} §eSituations:`);
    for (const s of sits) lines.push(` §f${s.title}§7 in ${s.regionIds.map((id) => nation.regions.find((r) => r.id === id)?.name).filter(Boolean).join(", ")}`);
  }
  return lines;
}

function centerOn(state, v, owners) {
  const b = bounds(state, owners);
  if (!b) return false;
  v.cx = Math.round((b[0] + b[2]) / 2);
  v.cz = Math.round((b[1] + b[3]) / 2);
  const size = SIZES[v.size];
  const span = Math.max((b[2] - b[0] + 1) / (size.w - 2), (b[3] - b[1] + 1) / (size.h - 2));
  v.zoom = ZOOMS.find((z) => z >= span) || 32;
  return true;
}

export function openMap(player, perspective = undefined) {
  const v = viewFor(player);
  if (perspective !== undefined) {
    v.persp = perspective;
    const n = S().nations[perspective];
    if (n) centerOn(S(), v, new Set([`n:${n.id}`, ...n.regions.map((r) => r.id)]));
  }
  return loop(player, () => {
    const state = S();
    if (v.persp && !state.nations[v.persp]) v.persp = null;
    const size = SIZES[v.size];
    const persp = v.persp ? state.nations[v.persp] : null;
    const here = playerChunk(player);
    const rows = renderMap(state, { cx: v.cx, cz: v.cz, zoom: v.zoom, w: size.w, h: size.h, persp: v.persp, you: here, markers: persp ? activeMarkers(state, persp) : null });
    const empty = !Object.keys(state.map?.chunks || {}).length;
    const body = [
      `§l${persp ? `${persp.color}${persp.name}§r§l's view` : "World Map"}§r §7- 1 tile = ${v.zoom}x${v.zoom} chunks · centre ${v.cx * 16}, ${v.cz * 16}`,
      ...rows,
      ...legend(state, v),
    ];
    if (empty) body.push("", "§eNo borders drawn yet. Use Draw Borders to paint countries and cities onto the world.");
    const step = Math.max(1, Math.floor(size.w / 3)) * v.zoom;
    const stepZ = Math.max(1, Math.floor(size.h / 3)) * v.zoom;
    return {
      title: persp ? `${persp.name} - Map` : "World Map",
      body: body.join("\n"),
      options: [
        { text: "^ North", run: () => { v.cz -= stepZ; } },
        { text: "v South", run: () => { v.cz += stepZ; } },
        { text: "< West", run: () => { v.cx -= step; } },
        { text: "> East", run: () => { v.cx += step; } },
        { text: "+ Zoom In", run: () => { v.zoom = ZOOMS[Math.max(0, ZOOMS.indexOf(v.zoom) - 1)]; } },
        { text: "- Zoom Out", run: () => { v.zoom = ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(v.zoom) + 1)]; } },
        here && { text: "Centre on Me", run: () => { [v.cx, v.cz] = here; } },
        { text: "Show Everything", run: () => { centerOn(state, v, null); } },
        { text: "Jump to a Country or City", run: () => jumpTo(player, v) },
        { text: `View: ${persp ? persp.name : "World (no country)"}`, run: () => pickPerspective(player, v) },
        { text: `Map Size: ${size.name}`, run: () => { v.size = (v.size + 1) % SIZES.length; } },
        (isAdmin(player) || Object.values(state.nations).some((n) => canRun(player, n))) && { text: "§eDraw Borders", run: () => drawMenu(player) },
      ],
    };
  });
}

async function jumpTo(player, v) {
  const state = S();
  const targets = [];
  for (const n of Object.values(state.nations)) {
    targets.push({ label: n.name, owners: new Set([`n:${n.id}`, ...n.regions.map((r) => r.id)]) });
    for (const r of n.regions) targets.push({ label: `  ${r.name} (${n.name})`, owners: new Set([r.id]) });
  }
  if (!targets.length) return notice(player, "Jump", "There are no countries yet.");
  const r = await modal(player, "Jump To", [{ key: "t", type: "dropdown", label: "Where?", options: targets.map((t) => t.label.slice(0, 60)) }], "Go");
  if (!r) return;
  if (!centerOn(state, v, targets[r.t].owners)) await notice(player, "Jump", `${targets[r.t].label.trim()} has no land drawn yet.`);
}

async function pickPerspective(player, v) {
  const nations = Object.values(S().nations);
  const r = await modal(player, "Whose View?", [
    { key: "p", type: "dropdown", label: "World view shows plain borders. A country's view shows home, allies, enemies, war fronts and its situations.", options: ["World (no country)", ...nations.map((n) => n.name)], value: Math.max(0, nations.findIndex((n) => n.id === v.persp) + 1) },
  ], "View");
  if (!r) return;
  v.persp = r.p === 0 ? null : nations[r.p - 1].id;
}

// ---------- drawing borders ----------

function paintTargets(player, state) {
  const out = [];
  for (const n of Object.values(state.nations)) {
    if (!canRun(player, n)) continue;
    out.push({ label: `${n.name} - land outside any city`, key: `n:${n.id}`, nationId: n.id });
    for (const r of n.regions) out.push({ label: `${n.name} - ${r.name}`, key: r.id, nationId: n.id });
  }
  out.push({ label: "Erase (unclaimed)", key: null, nationId: null });
  return out;
}

export function drawMenu(player) {
  return loop(player, () => {
    const state = S();
    let sess = paintSessions.get(player.id);
    const here = playerChunk(player);
    const idx = ownerIndex(state);
    if (sess && sess.target && !idx[sess.target]) {
      paintSessions.delete(player.id); // its country or city is gone
      sess = null;
    }
    const owner = here ? ownerAt(state, here[0], here[1]) : null;
    const lines = [
      "§7Borders are painted onto the real world one chunk (16x16 blocks) at a time.",
      "§7Pick what to paint, then walk around while painting is on, or mark two corners to fill a rectangle.",
      "",
      here ? `§7You are in chunk §f${here[0]}, ${here[1]}§7 - owned by §f${owner && idx[owner] ? (idx[owner].region ? `${idx[owner].region.name} (${idx[owner].nation.name})` : idx[owner].nation.name) : "nobody"}` : "§cGo to the Overworld to draw borders.",
    ];
    if (sess) lines.push(`§aPainting ON:§f ${sess.label} §7(radius ${sess.radius}, ${sess.count} chunks so far)`);
    if (sess?.corner) lines.push(`§eCorner 1 set at chunk ${sess.corner[0]}, ${sess.corner[1]}`);
    return {
      title: "Draw Borders",
      body: lines.join("\n"),
      options: [
        { text: sess ? `Brush: ${sess.label.slice(0, 40)}` : "Choose What to Paint", run: () => chooseBrush(player) },
        sess && !sess.walking && here && { text: "§aStart Painting as I Walk", run: () => { sess.walking = true; player.sendMessage("§aPainting as you walk. Open the Board Table and choose Stop Painting when done."); return CLOSE; } },
        sess && sess.walking && { text: "§cStop Painting", run: () => { sess.walking = false; commit(); } },
        sess && here && { text: "Paint Where I Stand", run: () => paintHere(player, sess, here) },
        sess && here && { text: sess.corner ? "Fill Rectangle to Here (corner 2)" : "Set Corner 1 Here", run: () => corner(player, sess, here) },
        sess && { text: "§7Put the Brush Away", run: () => { paintSessions.delete(player.id); commit(); } },
      ],
    };
  });
}

async function chooseBrush(player) {
  const state = S();
  const targets = paintTargets(player, state);
  if (targets.length <= 1) return notice(player, "Draw Borders", "You don't run any country. Ask an admin to add you as a ruler.");
  const sess = paintSessions.get(player.id);
  const r = await modal(player, "Brush", [
    { key: "t", type: "dropdown", label: "Paint which country / city?", options: targets.map((t) => t.label.slice(0, 60)), value: Math.max(0, targets.findIndex((t) => t.key === sess?.target)) },
    { key: "r", type: "slider", label: "Brush radius in chunks (0 = one chunk, 2 = 5x5)", min: 0, max: 4, value: sess?.radius ?? 1 },
  ], "Pick Brush");
  if (!r) return;
  const t = targets[r.t];
  paintSessions.set(player.id, { target: t.key, label: t.label, radius: r.r, count: sess?.count || 0, walking: sess?.walking || false, corner: null });
}

function paintHere(player, sess, here) {
  const state = S();
  const n = paintSquare(state, here[0], here[1], sess.radius, sess.target, painterFor(player, state).canPaint);
  sess.count += n;
  commit();
  player.sendMessage(`§7Painted ${n} chunk(s).`);
}

async function corner(player, sess, here) {
  if (!sess.corner) {
    sess.corner = here;
    player.sendMessage(`§eCorner 1 set at chunk ${here[0]}, ${here[1]}. Walk to the opposite corner and choose Fill Rectangle.`);
    return;
  }
  const state = S();
  const n = fillRect(state, sess.corner, here, sess.target, painterFor(player, state).canPaint);
  sess.corner = null;
  if (n < 0) return notice(player, "Too Big", "That rectangle is too large. Fill it in smaller pieces.");
  sess.count += n;
  commit();
  player.sendMessage(`§aFilled ${n} chunk(s) with ${sess.label}.`);
}

/** Called by the ticker every second: paint around walking painters. */
export function paintTick(world) {
  let changed = 0;
  for (const [id, sess] of paintSessions) {
    if (!sess.walking) continue;
    const player = world.getPlayers().find((p) => p.id === id);
    if (!player) {
      paintSessions.delete(id);
      continue;
    }
    const here = playerChunk(player);
    if (!here) continue;
    const state = S();
    if (sess.target && !ownerIndex(state)[sess.target]) {
      paintSessions.delete(id);
      continue;
    }
    const n = paintSquare(state, here[0], here[1], sess.radius, sess.target, painterFor(player, state).canPaint);
    sess.count += n;
    changed += n;
    try {
      player.onScreenDisplay.setActionBar(`§aPainting §f${sess.label}§7 · chunk ${here[0]}, ${here[1]} · ${sess.count} painted`);
    } catch {
      // ignore
    }
  }
  return changed;
}
