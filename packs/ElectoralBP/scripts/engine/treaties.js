// Treaties between countries run by players: one ruler proposes, the other
// country's ruler accepts or refuses. Making things worse (rivalry, war) needs no
// one's permission; making things better needs both sides.

import { getRegion, nextId } from "../core/state.js";
import { getStance, setStance } from "./diplomacy.js";
import { ensureEconomy } from "./economy.js";
import { transferRegion } from "./territory.js";

export const TREATIES = [
  { id: "alliance", name: "Alliance", desc: "Stand together. Relations become Alliance." },
  { id: "trade", name: "Trade Pact", desc: "Open markets on both sides. Relations become Trade Pact." },
  { id: "friendship", name: "Friendship Pact", desc: "Warm relations. Relations become Friendly." },
  { id: "peace", name: "Peace Treaty", desc: "End the war. Relations become Tense.", needsWar: true },
  { id: "normalise", name: "Normalise Relations", desc: "Bury the hatchet. Relations become Neutral." },
  { id: "gift_county", name: "Give Them a County", desc: "We hand over one of our counties, with its people and voting history.", county: "ours" },
  { id: "demand_county", name: "Ask for One of Their Counties", desc: "They hand over one of their counties.", county: "theirs" },
  { id: "pay", name: "Pay Them", desc: "We send money from our treasury.", money: "ours" },
  { id: "tribute", name: "Demand Tribute", desc: "They send money from their treasury.", money: "theirs" },
];
export const TREATY_BY_ID = Object.fromEntries(TREATIES.map((t) => [t.id, t]));
export const EXPIRE_MS = 48 * 3600 * 1000;

const STANCE_FOR = { alliance: "alliance", trade: "trade", friendship: "friendly", peace: "tense", normalise: "neutral" };
const tag = (n) => `${n.color}${n.name}§r`;

export function ensureTreaties(state) {
  state.proposals = state.proposals || [];
  return state.proposals;
}

/** Treaties `from` may offer `to` right now. */
export function treatiesFor(state, from, to) {
  const war = getStance(state, from.id, to.id) === "war";
  return TREATIES.filter((t) => {
    if (t.needsWar && !war) return false;
    if (war && STANCE_FOR[t.id] && t.id !== "peace") return false; // make peace first
    if (t.county === "ours" && !from.regions.length) return false;
    if (t.county === "theirs" && !to.regions.length) return false;
    return true;
  });
}

export function describe(state, p) {
  const from = state.nations[p.from];
  const to = state.nations[p.to];
  const t = TREATY_BY_ID[p.type];
  if (!from || !to || !t) return "?";
  let what = t.name;
  if (t.county) {
    const owner = t.county === "ours" ? from : to;
    what = `${t.county === "ours" ? "Give" : "Hand over"} ${getRegion(owner, p.regionId)?.name || "a county"}`;
  }
  if (t.money) what = `${t.money === "ours" ? "Payment" : "Tribute"} of ${Math.round(p.amount)}`;
  return `${from.name} -> ${to.name}: ${what}${p.note ? ` ("${p.note}")` : ""}`;
}

export function propose(state, from, to, type, extra = {}) {
  const list = ensureTreaties(state);
  if (!treatiesFor(state, from, to).some((t) => t.id === type)) return null;
  const p = { id: nextId(state, "tr"), from: from.id, to: to.id, type, regionId: extra.regionId || null, amount: extra.amount || 0, note: (extra.note || "").slice(0, 80), at: extra.now ?? Date.now(), status: "open" };
  list.push(p);
  return p;
}

export function openFor(state, nationId) {
  return ensureTreaties(state).filter((p) => p.status === "open" && p.to === nationId && state.nations[p.from]);
}

export function sentBy(state, nationId) {
  return ensureTreaties(state).filter((p) => p.status === "open" && p.from === nationId);
}

/** The receiving ruler answers. Returns chat lines. */
export function answer(state, p, accept) {
  const from = state.nations[p.from];
  const to = state.nations[p.to];
  const t = TREATY_BY_ID[p.type];
  p.status = accept ? "accepted" : "refused";
  if (!from || !to || !t) return [];
  if (!accept) return [`§6[Diplomacy]§r ${tag(to)} refused ${tag(from)}'s offer: ${describe(state, p).split(": ")[1]}.`];
  const lines = [`§6[Treaty]§r ${tag(from)} and ${tag(to)} agree: §f${describe(state, p).split(": ")[1]}`];
  if (STANCE_FOR[t.id]) setStance(state, from.id, to.id, STANCE_FOR[t.id]);
  if (t.county) {
    const giver = t.county === "ours" ? from : to;
    const taker = t.county === "ours" ? to : from;
    const r = getRegion(giver, p.regionId);
    if (r && transferRegion(state, r, taker)) lines.push(`§6   ${r.name} now belongs to ${taker.name}.`);
    else lines.push("§7   (That county no longer belongs to them - nothing changed hands.)");
  }
  if (t.money) {
    const payer = ensureEconomy(t.money === "ours" ? from : to);
    const payee = ensureEconomy(t.money === "ours" ? to : from);
    const amt = Math.max(0, Math.min(p.amount, Math.max(0, payer.treasury || 0)));
    payer.treasury -= amt;
    payee.treasury = (payee.treasury || 0) + amt;
    lines.push(`§7   ${Math.round(amt)} changes hands.`);
  }
  return lines;
}

export function withdraw(state, p) {
  p.status = "withdrawn";
}

/** Old unanswered offers lapse. */
export function expireProposals(state, now = Date.now()) {
  for (const p of ensureTreaties(state)) if (p.status === "open" && (now - p.at > EXPIRE_MS || !state.nations[p.from] || !state.nations[p.to])) p.status = "expired";
  state.proposals = state.proposals.filter((p) => p.status === "open" || now - p.at < EXPIRE_MS * 2).slice(-40);
}
