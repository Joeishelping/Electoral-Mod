// Pop-ups for rulers: when something hits their country (a situation, another
// country's move they must react to, or a treaty offer), the rulers who are
// online get asked right away instead of having to find it in the Board.
// Countries without listed rulers ping the admins. Anyone can turn pings off.

import { system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { S, commit, isAdmin } from "./nav.js";
import { chooseCounter, chooseResponse } from "./situations.js";
import { answerOffer } from "./treaties.js";

const queues = new Map(); // player id -> [{ title, body, decide }]
const busy = new Set();

const off = (player) => (S().noPing || []).includes(player.name.toLowerCase());

/** Online players who should hear about this country's business. */
function rulersOnline(nation) {
  const names = new Set((nation.rulers || []).map((n) => n.toLowerCase()));
  return world.getPlayers().filter((p) => {
    try {
      if (off(p)) return false;
      return names.size ? names.has(p.name.toLowerCase()) : isAdmin(p);
    } catch {
      return false;
    }
  });
}

function enqueue(player, item) {
  const q = queues.get(player.id) || [];
  if (q.length >= 6) return; // don't bury anyone in pop-ups
  q.push(item);
  queues.set(player.id, q);
  if (!busy.has(player.id)) system.runTimeout(() => next(player), 20);
}

async function next(player) {
  const q = queues.get(player.id);
  if (!q?.length) {
    busy.delete(player.id);
    return;
  }
  busy.add(player.id);
  const item = q[0];
  let res;
  try {
    res = await new ActionFormData().title(item.title.slice(0, 40)).body(item.body).button("§2Decide Now").button("Later").button("§7Stop These Pop-ups").show(player);
  } catch {
    queues.delete(player.id);
    busy.delete(player.id);
    return;
  }
  if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
    // they're in another menu: try again in a bit
    system.runTimeout(() => next(player), 200);
    return;
  }
  q.shift();
  try {
    if (!res.canceled && res.selection === 0) await item.decide(player);
    if (!res.canceled && res.selection === 2) {
      const s = S();
      s.noPing = [...new Set([...(s.noPing || []), player.name.toLowerCase()])];
      commit();
      player.sendMessage("§7Pop-ups are off. Turn them back on from the Board Table's main page.");
      queues.delete(player.id);
    }
  } catch (e) {
    console.warn(`[Electoral] ping: ${e}`);
  }
  system.runTimeout(() => next(player), 10);
}

/** A new situation or counter-situation for this country. */
export function pingSituation(nation, sit) {
  for (const p of rulersOnline(nation)) {
    enqueue(p, {
      title: `${nation.name}: ${sit.title}`,
      body: `§f${sit.text}\n\n§7${sit.kind === "counter" ? "How will we react?" : "How will we handle it?"}`,
      decide: async (player) => {
        if (sit.status !== "active") return;
        if (sit.kind === "counter") return chooseCounter(player, nation, sit);
        return chooseResponse(player, nation, sit);
      },
    });
  }
}

/** A treaty offer for this country. */
export function pingProposal(nation, proposal) {
  for (const p of rulersOnline(nation)) {
    enqueue(p, {
      title: `Treaty Offer for ${nation.name}`,
      body: "§fAnother country has made us an offer.",
      decide: async (player) => {
        return answerOffer(player, proposal);
      },
    });
  }
}

export const pingsOn = (player) => !off(player);

export function setPings(player, on) {
  const s = S();
  const me = player.name.toLowerCase();
  s.noPing = (s.noPing || []).filter((n) => n !== me);
  if (!on) s.noPing.push(me);
  commit();
}
