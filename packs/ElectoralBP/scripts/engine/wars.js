// Claims and wars, CK3 style. A country presses a claim on another country's
// city or county; a claim is a casus belli. It can then declare war for that
// city, or for the whole country. Wars without a claim are allowed but cost
// standing at home and abroad. A war ends when one side gives in, or when an
// admin rules on it (or rolls the dice on military strength) under Disputes.

import { getRegion, nextId } from "../core/state.js";
import { clamp } from "../core/random.js";
import { getStance, setStance } from "./diplomacy.js";
import { transferRegion } from "./territory.js";
import { odds, stepRelation } from "./situations.js";

export function ensureWars(state) {
  state.claims = state.claims || [];
  state.wars = state.wars || [];
  state.disputes = state.disputes || [];
}

const tag = (n) => `${n.color}${n.name}§r`;
const ownerOf = (state, regionId) => Object.values(state.nations).find((n) => getRegion(n, regionId));

export function claimsBy(state, nationId) {
  ensureWars(state);
  return state.claims.filter((c) => c.by === nationId && ownerOf(state, c.regionId));
}

export function claimsOn(state, regionId) {
  ensureWars(state);
  return state.claims.filter((c) => c.regionId === regionId && state.nations[c.by]);
}

export const hasClaim = (state, by, regionId) => claimsOn(state, regionId).some((c) => c.by === by);

/** `by` claims a city/county that belongs to someone else. Returns chat lines. */
export function pressClaim(state, by, region) {
  ensureWars(state);
  const owner = ownerOf(state, region.id);
  if (!owner || owner.id === by.id || hasClaim(state, by.id, region.id)) return [];
  state.claims.push({ id: nextId(state, "cl"), by: by.id, regionId: region.id, at: Date.now() });
  // a claim on your land sours things
  if (["alliance", "trade", "friendly", "neutral"].includes(getStance(state, by.id, owner.id))) stepRelation(state, by.id, owner.id, 1);
  return [`§6[Claims]§r ${tag(by)} lays claim to §f${region.name}§r, held by ${tag(owner)}. That is a casus belli.`];
}

export function dropClaim(state, by, regionId) {
  ensureWars(state);
  const before = state.claims.length;
  state.claims = state.claims.filter((c) => !(c.by === by && c.regionId === regionId));
  return before !== state.claims.length;
}

export function warsOf(state, nationId) {
  ensureWars(state);
  return state.wars.filter((w) => w.status === "active" && (w.attacker === nationId || w.defender === nationId));
}

export function warBetween(state, a, b) {
  return warsOf(state, a).find((w) => w.attacker === b || w.defender === b) || null;
}

/** What the war would be fought for, and whether it is justified. target = region or null (the whole country). */
export function casusBelli(state, attacker, defender, region = null) {
  if (region) {
    const justified = hasClaim(state, attacker.id, region.id);
    return { justified, label: justified ? `Press claim on ${region.name}` : `Seize ${region.name} (no claim)` };
  }
  const claimed = defender.regions.filter((r) => hasClaim(state, attacker.id, r.id));
  const justified = claimed.length > 0 && claimed.length * 2 >= defender.regions.length;
  return { justified, label: justified ? `Conquest of ${defender.name} (claims on ${claimed.length} of ${defender.regions.length})` : `Conquest of ${defender.name} (not enough claims)` };
}

/** Declares war. region = the city fought over, or null for the whole country. Returns chat lines. */
export function declareWar(state, attacker, defender, region = null) {
  ensureWars(state);
  if (attacker.id === defender.id || warBetween(state, attacker.id, defender.id)) return [];
  const cb = casusBelli(state, attacker, defender, region);
  const targets = region ? [region.id] : defender.regions.map((r) => r.id);
  const war = { id: nextId(state, "w"), attacker: attacker.id, defender: defender.id, targets, whole: !region, justified: cb.justified, goal: cb.label, status: "active", at: Date.now() };
  state.wars.push(war);
  setStance(state, attacker.id, defender.id, "war");
  const what = region ? region.name : `all of ${defender.name}`;
  const lines = [`§4[WAR]§r ${tag(attacker)} declares war on ${tag(defender)} for §f${what}§r. §7(${cb.label})`];
  if (!cb.justified) {
    // an unjustified war: the home front and the neighbours take it badly
    attacker.metrics.integrity = clamp((attacker.metrics.integrity ?? 50) - 10, 0, 100);
    attacker.metrics.security = clamp((attacker.metrics.security ?? 50) - 5, 0, 100);
    for (const other of Object.values(state.nations)) {
      if (other.id === attacker.id || other.id === defender.id) continue;
      stepRelation(state, other.id, attacker.id, 1);
    }
    lines.push(`§c   Without a casus belli, ${attacker.name}'s standing suffers at home and abroad.`);
  }
  const d = {
    id: nextId(state, "d"),
    kind: "war",
    status: "open",
    warId: war.id,
    title: `War: ${attacker.name} vs ${defender.name} for ${what}`,
    text: `${attacker.name} attacks ${defender.name} (${cb.label}). Who wins?`,
    originNationId: defender.id,
    regionId: targets[0] || null,
    choices: [
      { label: `${attacker.name} wins - takes ${what}`.slice(0, 60), winner: attacker.id, effect: "attacker" },
      { label: "White peace - nothing changes hands", winner: null, effect: "white" },
      { label: `${defender.name} holds`.slice(0, 60), winner: defender.id, effect: "defender" },
    ],
    odds: odds(state, attacker, defender),
  };
  state.disputes.push(d);
  lines.push("§7   It will be decided by the sides giving in, or by an admin under Disputes.");
  return lines;
}

/** Ends a war. outcome: "attacker" | "defender" | "white". Returns chat lines. */
export function endWar(state, war, outcome) {
  ensureWars(state);
  if (war.status !== "active") return [];
  war.status = "over";
  war.outcome = outcome;
  for (const d of state.disputes) if (d.warId === war.id && d.status === "open") {
    d.status = "closed";
    d.ruling = outcome;
  }
  const a = state.nations[war.attacker];
  const b = state.nations[war.defender];
  if (!a || !b) return [];
  const lines = [];
  if (outcome === "attacker") {
    const taken = [];
    for (const id of war.targets) {
      const r = getRegion(b, id);
      if (r && transferRegion(state, r, a)) taken.push(r.name);
    }
    // the land outside the defender's cities goes too when the whole country falls
    if (war.whole && state.map?.chunks) for (const [k, v] of Object.entries(state.map.chunks)) if (v === `n:${b.id}`) state.map.chunks[k] = `n:${a.id}`;
    state.claims = state.claims.filter((c) => !war.targets.includes(c.regionId) || c.by !== a.id);
    lines.push(`§4[WAR]§r ${tag(a)} defeats ${tag(b)}${taken.length ? ` and takes §f${taken.join(", ")}` : ""}.`);
  } else if (outcome === "defender") {
    state.claims = state.claims.filter((c) => !(c.by === a.id && war.targets.includes(c.regionId)));
    lines.push(`§4[WAR]§r ${tag(b)} holds off ${tag(a)}. ${a.name}'s claims are dropped.`);
  } else lines.push(`§4[WAR]§r ${tag(a)} and ${tag(b)} sign a white peace. Nothing changes hands.`);
  if (!warsOf(state, a.id).some((w) => w.attacker === b.id || w.defender === b.id)) setStance(state, a.id, b.id, "tense");
  return lines;
}

/** Admin rulings on war disputes come through here (see situations.ruleDispute). */
export function ruleWar(state, d, choiceIdx) {
  const war = (state.wars || []).find((w) => w.id === d.warId);
  if (!war) {
    d.status = "closed";
    return [];
  }
  return endWar(state, war, d.choices[choiceIdx].effect);
}

export function warOdds(state, war) {
  const a = state.nations[war.attacker];
  const b = state.nations[war.defender];
  return a && b ? odds(state, a, b) : 0.5;
}

/** Forget claims and wars that involve a deleted country or city. */
export function tidyWars(state) {
  ensureWars(state);
  state.claims = state.claims.filter((c) => state.nations[c.by] && ownerOf(state, c.regionId));
  for (const w of state.wars) if (w.status === "active" && (!state.nations[w.attacker] || !state.nations[w.defender])) w.status = "over";
}
