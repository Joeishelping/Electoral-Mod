// Navigation + permissions shared by all menus.

import { world } from "@minecraft/server";
import { choose } from "./forms.js";
import { getState, saveState } from "../core/storage.js";
import { getPerson } from "../core/state.js";

export const CLOSE = "__close__";

/**
 * Re-renders a menu until the player goes back or closes it.
 * build() returns { title, body, options: [{ text, icon?, run }] } or null to leave.
 * A run() returning CLOSE closes every menu; returning "back" leaves this one too.
 */
export async function loop(player, build, backLabel = "§8« Back") {
  for (;;) {
    const view = build();
    if (!view) return;
    const options = [...view.options.filter(Boolean), { text: backLabel, back: true }];
    const pick = await choose(player, view.title, view.body, options);
    if (!pick) return CLOSE;
    if (pick.back) return;
    const r = await pick.run();
    if (r === CLOSE) return CLOSE;
    if (r === "back") return;
  }
}

export function isAdmin(player) {
  if (player.hasTag("electoral_admin")) return true;
  try {
    return player.playerPermissionLevel === 2; // Operator
  } catch {
    return false;
  }
}

export function isLeaderOf(player, nation) {
  const leader = getPerson(getState(), nation.leaderId);
  return !!leader && !!leader.player && leader.player.toLowerCase() === player.name.toLowerCase();
}

export function canManage(player, nation) {
  return isAdmin(player) || isLeaderOf(player, nation);
}

export function announce(text) {
  try {
    world.sendMessage(`§6[Board]§r ${text}`);
  } catch {
    // ignore
  }
}

export function commit() {
  try {
    saveState();
  } catch (e) {
    console.warn(`[Electoral] Save failed: ${e}`);
  }
}

export const S = () => getState();
