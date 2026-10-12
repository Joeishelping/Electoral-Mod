// World Map control centre: War Tables (block maps built in the world), the Map
// Brush, and walk-around border painting.

import { STANCES } from "../engine/diplomacy.js";
import { bounds, chunkOf, fillRect, landStats, ownerAt, ownerIndex, paintSquare } from "../engine/territory.js";
import { TABLE_SIZES, ZOOMS } from "../engine/wartable.js";
import { TERRAIN } from "../data/mapblocks.js";
import { getTerrain } from "../core/storage.js";
import { confirm, modal, notice } from "./forms.js";
import { canRun, CLOSE, commit, isAdmin, loop, S } from "./nav.js";
import { brushes, buildTable, giveBrush, nearestTable, removeTable, renderTable, scanAround, tables } from "./wartable.js";

// Walk-to-paint sessions: player id -> { target, label, radius, walking, corner, count }
export const paintSessions = new Map();

function playerChunk(player) {
  try {
    if (player.dimension && player.dimension.id !== "minecraft:overworld") return null;
    return chunkOf(player.location.x, player.location.z);
  } catch {
    return null;
  }
}

export function painterFor(player, state) {
  const admin = isAdmin(player);
  const idx = ownerIndex(state);
  return { admin, canPaint: (old) => admin || (idx[old] && canRun(player, idx[old].nation)) };
}

function paintTargets(player, state) {
  const out = [];
  for (const n of Object.values(state.nations)) {
    if (!canRun(player, n)) continue;
    out.push({ label: `${n.name} - land outside any city`, key: `n:${n.id}` });
    for (const r of n.regions) out.push({ label: `${n.name} - ${r.name}`, key: r.id });
  }
  out.push({ label: "Erase (unclaimed)", key: null });
  return out;
}

const LEGEND = [
  "§6How to read the table",
  " §fSolid colour§7 = a country's land · §fwool§7 = borders between cities",
  " §fRedstone§7 = a war front · §fTorch / lantern / redstone torch§7 = minor / serious / critical situation · §fEnd rod§7 = opportunity",
  ` §7Terrain: ${Object.values(TERRAIN).map((t) => t.name).join(", ")} · §8dark tiles§7 = unexplored`,
];

function relationsText(state, nation) {
  return Object.values(state.nations).filter((o) => o.id !== nation.id).map((o) => {
    const s = STANCES.find((x) => x.id === (state.relations[[nation.id, o.id].sort().join("|")] || "neutral"));
    return `${s.color}${o.name}§7 (${s.name})`;
  }).join(", ");
}

/** Board Table -> World Map. `perspective` (a nation id) opens the nearest table in that view. */
export function openMap(player, perspective = undefined) {
  if (perspective !== undefined) {
    const t = nearestTable(player);
    if (t) {
      t.persp = perspective;
      centerOnOwners(S(), t, perspective ? ownersOf(S().nations[perspective]) : null);
      commit();
      renderTable(t);
      return tableMenu(player, t);
    }
  }
  return loop(player, () => {
    const state = S();
    const stats = landStats(state);
    const explored = Object.keys(getTerrain()).length;
    const lines = [
      "§7The War Table is a map of your world built out of blocks on the floor. It shows the real terrain players have explored, and the borders of every country and city.",
      "",
      `§7Explored: §f${explored}§7 chunks · Claimed: §f${Object.values(stats).reduce((a, b) => a + b, 0)}§7 chunks`,
    ];
    for (const n of Object.values(state.nations)) {
      const land = (stats[`n:${n.id}`] || 0) + n.regions.reduce((s, r) => s + (stats[r.id] || 0), 0);
      lines.push(` ${n.color}${n.name}§7 - ${land} chunks`);
    }
    if (!tables().length) lines.push("", isAdmin(player) ? "§eNo War Table yet. Stand in the middle of a big empty floor and build one." : "§7No War Table has been built yet.");
    return {
      title: "World Map",
      body: lines.join("\n"),
      options: [
        ...tables().map((t) => ({ text: `War Table at ${t.x0 + Math.floor(t.w / 2)}, ${t.y + 1}, ${t.z0 + Math.floor(t.h / 2)}\n§7${t.persp && state.nations[t.persp] ? `${state.nations[t.persp].name}'s view` : "World view"} · zoom ${t.zoom}`, run: () => tableMenu(player, t) })),
        isAdmin(player) && { text: "§eBuild a War Table Here", run: () => buildHere(player) },
        { text: "Get a Map Brush", run: () => { player.sendMessage(giveBrush(player) ? "§aYou got a Map Brush. Right-click the air to choose what to paint, then right-click squares on a War Table." : "§cYour inventory is full."); } },
        { text: brushes.get(player.id) ? `Brush: ${brushes.get(player.id).label.slice(0, 40)}` : "Choose What to Paint", run: () => chooseBrush(player) },
        { text: "Paint by Walking Around", run: () => walkMenu(player) },
        isAdmin(player) && { text: "§7Map the Terrain Around Me", run: () => { scanAround(player); player.sendMessage("§7Mapping loaded chunks around you..."); } },
      ],
    };
  });
}

async function buildHere(player) {
  if (player.dimension?.id !== "minecraft:overworld") return notice(player, "War Table", "Build War Tables in the Overworld.");
  const r = await modal(player, "Build a War Table", [
    { key: "s", type: "dropdown", label: "Size (blocks). It is built on the floor under your feet, centred on you. The floor blocks and anything standing on them will be replaced.", options: TABLE_SIZES.map((x) => x.name), value: 1 },
  ], "Build");
  if (!r) return;
  if (!(await confirm(player, "Build Here?", `This replaces a ${TABLE_SIZES[r.s].name.split(" ")[1]} area of floor around you with the map. Continue?`, "§aBuild"))) return;
  const t = buildTable(player, r.s);
  player.sendMessage("§aWar Table built. Use the Map Brush on it, and steer it from Board Table > World Map.");
  return tableMenu(player, t);
}

function ownersOf(nation) {
  return nation ? new Set([`n:${nation.id}`, ...nation.regions.map((r) => r.id)]) : null;
}

function centerOnOwners(state, t, owners) {
  const b = bounds(state, owners);
  if (!b) return false;
  t.cx = Math.round((b[0] + b[2]) / 2);
  t.cz = Math.round((b[1] + b[3]) / 2);
  const span = Math.max((b[2] - b[0] + 1) / (t.w - 2), (b[3] - b[1] + 1) / (t.h - 2));
  t.zoom = ZOOMS.find((z) => z >= span) || ZOOMS[ZOOMS.length - 1];
  return true;
}

function tableMenu(player, t) {
  const move = (fn) => () => {
    fn();
    commit();
    renderTable(t);
  };
  return loop(player, () => {
    const state = S();
    if (!tables().includes(t)) return null;
    if (t.persp && !state.nations[t.persp]) t.persp = null;
    const persp = t.persp ? state.nations[t.persp] : null;
    const here = playerChunk(player);
    const lines = [
      `§l${persp ? `${persp.color}${persp.name}§r§l's view` : "World view"}§r`,
      `§7Centre: §f${t.cx * 16}, ${t.cz * 16}§7 · each square = §f${t.zoom}x${t.zoom}§7 chunks (${t.zoom * 16} blocks)`,
      persp ? "§7Colours: §aHome §9Allies §bFriends/Trade §7Neutral §6Rivals §cWar" : "§7Each country in its own colour. No situation markers in the world view.",
    ];
    if (persp) {
      const rel = relationsText(state, persp);
      if (rel) lines.push(`§7Relations: ${rel}`);
    }
    lines.push("", ...LEGEND);
    const stepX = Math.max(1, Math.floor(t.w / 3)) * t.zoom;
    const stepZ = Math.max(1, Math.floor(t.h / 3)) * t.zoom;
    return {
      title: "War Table",
      body: lines.join("\n"),
      options: [
        { text: "^ North", run: move(() => { t.cz -= stepZ; }) },
        { text: "v South", run: move(() => { t.cz += stepZ; }) },
        { text: "< West", run: move(() => { t.cx -= stepX; }) },
        { text: "> East", run: move(() => { t.cx += stepX; }) },
        { text: "+ Zoom In", run: move(() => { t.zoom = ZOOMS[Math.max(0, ZOOMS.indexOf(t.zoom) - 1)]; }) },
        { text: "- Zoom Out", run: move(() => { t.zoom = ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(t.zoom) + 1)]; }) },
        here && { text: "Centre on Me", run: move(() => { [t.cx, t.cz] = here; }) },
        { text: "Show Every Country", run: move(() => { centerOnOwners(state, t, null); }) },
        { text: "Jump to a Country or City", run: () => jumpTo(player, t) },
        { text: `View: ${persp ? persp.name : "World (no country)"}`, run: () => pickPerspective(player, t) },
        { text: "Rebuild (refresh every block)", run: () => renderTable(t, true) },
        isAdmin(player) && {
          text: "§cRemove This Table",
          run: async () => {
            if (!(await confirm(player, "Remove", "Remove this War Table? The map floor becomes smooth stone.", "§cRemove"))) return;
            removeTable(t);
            return "back";
          },
        },
      ],
    };
  });
}

async function jumpTo(player, t) {
  const state = S();
  const targets = [];
  for (const n of Object.values(state.nations)) {
    targets.push({ label: n.name, owners: ownersOf(n) });
    for (const r of n.regions) targets.push({ label: `  ${r.name} (${n.name})`, owners: new Set([r.id]) });
  }
  if (!targets.length) return notice(player, "Jump", "There are no countries yet.");
  const r = await modal(player, "Jump To", [{ key: "t", type: "dropdown", label: "Where?", options: targets.map((x) => x.label.slice(0, 60)) }], "Go");
  if (!r) return;
  if (!centerOnOwners(state, t, targets[r.t].owners)) return notice(player, "Jump", `${targets[r.t].label.trim()} has no land drawn yet.`);
  commit();
  renderTable(t);
}

async function pickPerspective(player, t) {
  const nations = Object.values(S().nations);
  const r = await modal(player, "Whose View?", [
    { key: "p", type: "dropdown", label: "The world view shows plain borders. A country's view shows home, allies, enemies, war fronts and its situations.", options: ["World (no country)", ...nations.map((n) => n.name)], value: Math.max(0, nations.findIndex((n) => n.id === t.persp) + 1) },
  ], "View");
  if (!r) return;
  t.persp = r.p === 0 ? null : nations[r.p - 1].id;
  commit();
  renderTable(t);
}

/** Pick what the Map Brush (and walk-painting) paints. */
export async function chooseBrush(player) {
  const state = S();
  const targets = paintTargets(player, state);
  if (targets.length <= 1) return notice(player, "Map Brush", "You don't run any country. Ask an admin to add you as a Ruler.");
  const cur = brushes.get(player.id);
  const r = await modal(player, "Map Brush", [
    { key: "t", type: "dropdown", label: "Paint which country / city?", options: targets.map((x) => x.label.slice(0, 60)), value: Math.max(0, targets.findIndex((x) => x.key === cur?.target)) },
    { key: "r", type: "slider", label: "Brush size in table squares (0 = one square)", min: 0, max: 3, value: cur?.radius ?? 0 },
  ], "Pick Brush");
  if (!r) return;
  const t = targets[r.t];
  brushes.set(player.id, { target: t.key, label: t.label, radius: r.r });
  const walk = paintSessions.get(player.id);
  if (walk) Object.assign(walk, { target: t.key, label: t.label });
  player.sendMessage(`§aBrush: ${t.label}. Right-click squares on a War Table to paint.`);
}

// ---------- painting by walking around ----------

function walkMenu(player) {
  return loop(player, () => {
    const state = S();
    let sess = paintSessions.get(player.id);
    const brush = brushes.get(player.id);
    const here = playerChunk(player);
    const idx = ownerIndex(state);
    if (sess && sess.target && !idx[sess.target]) {
      paintSessions.delete(player.id);
      sess = null;
    }
    const owner = here ? ownerAt(state, here[0], here[1]) : null;
    const lines = [
      "§7Paint borders onto the land itself as you walk, one chunk (16x16 blocks) at a time - handy for tracing coastlines and rivers.",
      "",
      here ? `§7You are in chunk §f${here[0]}, ${here[1]}§7 - owned by §f${owner && idx[owner] ? (idx[owner].region ? `${idx[owner].region.name} (${idx[owner].nation.name})` : idx[owner].nation.name) : "nobody"}` : "§cGo to the Overworld to paint borders.",
      brush ? `§7Brush: §f${brush.label}` : "§eChoose what to paint first.",
    ];
    if (sess) lines.push(`§7Walking brush: §f${sess.radius} chunk radius§7, ${sess.count} chunks painted${sess.walking ? " §a(painting ON)" : ""}`);
    if (sess?.corner) lines.push(`§eCorner 1 at chunk ${sess.corner[0]}, ${sess.corner[1]}`);
    const start = () => {
      sess = sess || { radius: 1, count: 0, corner: null };
      Object.assign(sess, { target: brush.target, label: brush.label });
      paintSessions.set(player.id, sess);
      return sess;
    };
    return {
      title: "Paint by Walking",
      body: lines.join("\n"),
      options: [
        { text: "Choose What to Paint", run: () => chooseBrush(player) },
        brush && here && !sess?.walking && { text: "§aStart Painting as I Walk", run: () => { start().walking = true; player.sendMessage("§aPainting as you walk. Open the Board Table and choose Stop Painting when done."); return CLOSE; } },
        sess?.walking && { text: "§cStop Painting", run: () => { sess.walking = false; commit(); } },
        brush && here && { text: "Paint Where I Stand", run: () => { const s2 = start(); const n = paintSquare(state, here[0], here[1], s2.radius, s2.target, painterFor(player, state).canPaint); s2.count += n; commit(); player.sendMessage(`§7Painted ${n} chunk(s).`); } },
        brush && here && { text: sess?.corner ? "Fill Rectangle to Here (corner 2)" : "Set Corner 1 Here", run: () => corner(player, start(), here) },
        brush && {
          text: "Walking Brush Size",
          run: async () => {
            const r = await modal(player, "Walking Brush", [{ key: "r", type: "slider", label: "Radius in chunks (0 = one chunk, 2 = 5x5)", min: 0, max: 4, value: sess?.radius ?? 1 }]);
            if (r) start().radius = r.r;
          },
        },
      ],
    };
  });
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
