// Faction diplomacy. Relations are symmetric stances between two nations; they feed
// into elections (wars raise the salience of security and rally voters around the
// incumbent; trade pacts make trade policy matter more).

import { relationKey } from "../core/state.js";

export const STANCES = [
  { id: "alliance", name: "Alliance", color: "§a" },
  { id: "trade", name: "Trade Pact", color: "§2" },
  { id: "friendly", name: "Friendly", color: "§b" },
  { id: "neutral", name: "Neutral", color: "§7" },
  { id: "tense", name: "Tense", color: "§e" },
  { id: "rival", name: "Rivalry", color: "§6" },
  { id: "war", name: "War", color: "§c" },
];
export const STANCE_BY_ID = Object.fromEntries(STANCES.map((s) => [s.id, s]));

export function getStance(state, a, b) {
  return state.relations[relationKey(a, b)] || "neutral";
}

export function setStance(state, a, b, stance) {
  const key = relationKey(a, b);
  if (stance === "neutral") delete state.relations[key];
  else state.relations[key] = stance;
}

export function diplomacySummary(state, nationId) {
  const out = { wars: 0, rivals: 0, allies: 0, trade: 0, friendly: 0, tense: 0 };
  for (const [key, stance] of Object.entries(state.relations || {})) {
    const [a, b] = key.split("|");
    if (a !== nationId && b !== nationId) continue;
    const other = a === nationId ? b : a;
    if (!state.nations[other]) continue;
    if (stance === "war") out.wars++;
    else if (stance === "rival") out.rivals++;
    else if (stance === "alliance") out.allies++;
    else if (stance === "trade") out.trade++;
    else if (stance === "friendly") out.friendly++;
    else if (stance === "tense") out.tense++;
  }
  return out;
}
