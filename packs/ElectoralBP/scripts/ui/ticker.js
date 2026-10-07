// Runs once a second: closes polls on time, sends reminders, plays election night,
// and keeps the live sidebar scoreboard and action-bar ticker up to date.

import { world, DisplaySlotId, ObjectiveSortOrder } from "@minecraft/server";
import { hashSeed } from "../core/random.js";
import { beginCount, liveView, tickNight } from "../engine/night.js";
import { getState } from "../core/storage.js";
import { announce, commit } from "./nav.js";

const REMINDERS = [10, 5, 1]; // minutes before polls close
const SIDEBAR = "electoral_live";
let sidebarShown = false;
let sidebarKey = "";
let clearSidebarAt = 0;
let rotate = 0;

function forPlayers(fn) {
  for (const p of world.getPlayers()) {
    try {
      fn(p);
    } catch {
      // player left / older client
    }
  }
}

function flash(title, subtitle, sound) {
  forPlayers((p) => {
    p.onScreenDisplay.setTitle(title, { subtitle, fadeInDuration: 10, stayDuration: 70, fadeOutDuration: 20 });
    if (sound) p.playSound(sound);
  });
}

function updateSidebar(view) {
  try {
    const board = world.scoreboard;
    const key = `${view.title}|${view.rows.map((r) => r.name).join(",")}`;
    let obj = board.getObjective(SIDEBAR);
    if (obj && key !== sidebarKey) {
      board.removeObjective(SIDEBAR);
      obj = null;
    }
    if (!obj) {
      obj = board.addObjective(SIDEBAR, `§l${view.title}`.slice(0, 32));
      board.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: obj, sortOrder: ObjectiveSortOrder.Descending });
      sidebarKey = key;
    }
    for (const row of view.rows) obj.setScore(`${row.color}${row.name}`.slice(0, 40), row.score);
    sidebarShown = true;
  } catch {
    // scoreboard unavailable - the action bar still works
  }
}

function clearSidebar() {
  try {
    if (world.scoreboard.getObjective(SIDEBAR)) world.scoreboard.removeObjective(SIDEBAR);
  } catch {
    // ignore
  }
  sidebarShown = false;
  sidebarKey = "";
}

export function tick(now = Date.now()) {
  const state = getState();
  let changed = false;
  const live = [];
  for (const nation of Object.values(state.nations)) {
    const e = nation.election;
    if (e && !nation.count && e.closesAt) {
      const left = e.closesAt - now;
      e.reminders = e.reminders || [];
      for (const m of REMINDERS) {
        if (left <= m * 60000 && left > (m - 1) * 60000 && !e.reminders.includes(m)) {
          e.reminders.push(m);
          changed = true;
          announce(`${nation.color}${nation.name}§r: §e${m} minute${m > 1 ? "s" : ""} left to vote in the ${e.title}!`);
        }
      }
      if (left <= 0) {
        beginCount(state, nation, hashSeed(nation.id, e.id, now), now).forEach(announce);
        flash(`${nation.color}Polls Closed`, `§7${nation.name} - the count begins`, "note.bell");
        changed = true;
      }
    }
    if (nation.count) {
      const res = tickNight(state, nation, now);
      if (res.lines.length) {
        res.lines.forEach(announce);
        changed = true;
      }
      if (res.call) flash(res.call.title, res.call.subtitle, "note.pling");
      if (res.headline) {
        flash(res.headline.title, res.headline.subtitle, "random.levelup");
        clearSidebarAt = now + 60000;
      }
      if (nation.count) live.push(nation);
    }
  }
  if (live.length) {
    // several nations counting at once take turns on the sidebar
    const nation = live[Math.floor(rotate++ / 15) % live.length];
    const view = liveView(state, nation);
    if (view) {
      updateSidebar(view);
      const bar = `${nation.color}${nation.name}§r: ${view.bar}`;
      forPlayers((p) => p.onScreenDisplay.setActionBar(bar));
    }
  } else if (sidebarShown && now >= clearSidebarAt) {
    clearSidebar();
  }
  if (changed) commit();
}
