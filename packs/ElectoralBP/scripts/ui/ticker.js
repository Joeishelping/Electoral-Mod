// Runs once a second: closes polls when their time is up, sends reminders, and
// reveals the next county result of any live count.

import { world } from "@minecraft/server";
import { hashSeed } from "../core/random.js";
import { beginCount, tickCount } from "../engine/count.js";
import { getState } from "../core/storage.js";
import { announce, commit } from "./nav.js";

const REMINDERS = [10, 5, 1]; // minutes before polls close

function showTitle(headline) {
  for (const p of world.getPlayers()) {
    try {
      p.onScreenDisplay.setTitle(headline.title, { subtitle: headline.subtitle, fadeInDuration: 10, stayDuration: 80, fadeOutDuration: 20 });
      p.playSound("random.levelup");
    } catch {
      // older clients / player left
    }
  }
}

export function tick(now = Date.now()) {
  const state = getState();
  let changed = false;
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
        changed = true;
      }
    }
    if (nation.count) {
      const res = tickCount(state, nation, now);
      if (res.lines.length) {
        res.lines.forEach(announce);
        changed = true;
      }
      if (res.headline) showTitle(res.headline);
    }
  }
  if (changed) commit();
}
