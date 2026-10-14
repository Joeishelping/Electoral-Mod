// Proposing and answering treaties between countries.

import { getStance, STANCE_BY_ID } from "../engine/diplomacy.js";
import { answer, describe, openFor, propose, sentBy, treatiesFor, TREATY_BY_ID, withdraw } from "../engine/treaties.js";
import { ensureEconomy } from "../engine/economy.js";
import { confirm, modal, notice } from "./forms.js";
import { announce, canRun, commit, loop, S } from "./nav.js";
import { pingProposal } from "./pings.js";

/** Countries this player can speak for. */
export const myNations = (player) => Object.values(S().nations).filter((n) => canRun(player, n));

export async function proposeTreaty(player, to) {
  const state = S();
  const mine = myNations(player).filter((n) => n.id !== to.id);
  if (!mine.length) return notice(player, "Treaty", "You don't rule a country that could sign this.");
  let from = mine[0];
  if (mine.length > 1) {
    const r = await modal(player, "On Behalf Of", [{ key: "n", type: "dropdown", label: "Which country is making the offer?", options: mine.map((n) => n.name) }], "Next");
    if (!r) return;
    from = mine[r.n];
  }
  const kinds = treatiesFor(state, from, to);
  const stance = STANCE_BY_ID[getStance(state, from.id, to.id)];
  const r = await modal(player, `Offer to ${to.name}`, [
    { key: "t", type: "dropdown", label: `${from.name} and ${to.name} are ${stance?.name}. What do you offer? Their ruler must accept.`, options: kinds.map((k) => k.name) },
    { key: "note", type: "text", label: "A message to go with it (optional)", value: "" },
  ], "Next");
  if (!r) return;
  const kind = kinds[r.t];
  const extra = { note: r.note };
  if (kind.county) {
    const owner = kind.county === "ours" ? from : to;
    const c = await modal(player, kind.name, [{ key: "c", type: "dropdown", label: kind.county === "ours" ? "Which of our counties?" : "Which of their counties?", options: owner.regions.map((x) => x.name) }], "Next");
    if (!c) return;
    extra.regionId = owner.regions[c.c].id;
  }
  if (kind.money) {
    const payer = ensureEconomy(kind.money === "ours" ? from : to);
    const max = Math.max(1, Math.round(payer.treasury || 0));
    const m = await modal(player, kind.name, [{ key: "a", type: "slider", label: `How much? (their treasury: ${max})`, min: 0, max: 100, step: 5, value: 20 }], "Next");
    if (!m) return;
    extra.amount = Math.round((max * m.a) / 100);
  }
  const p = propose(state, from, to, kind.id, extra);
  if (!p) return notice(player, "Treaty", "That offer isn't possible right now.");
  commit();
  announce(`§6[Diplomacy]§r ${from.color}${from.name}§r offers ${to.color}${to.name}§r: §f${describe(state, p).split(": ")[1]}`);
  pingProposal(to, p);
}

/** Offers waiting for this player's countries, and offers they sent. */
export function offersMenu(player) {
  return loop(player, () => {
    const state = S();
    const mine = myNations(player);
    const incoming = mine.flatMap((n) => openFor(state, n.id));
    const outgoing = mine.flatMap((n) => sentBy(state, n.id));
    const lines = [incoming.length ? "§6Offers waiting for your answer" : "§7No offers waiting for you."];
    if (outgoing.length) lines.push("", "§6Your offers still waiting", ...outgoing.map((p) => ` §7${describe(state, p)}`));
    return {
      title: "Treaty Offers",
      body: lines.join("\n"),
      options: [
        ...incoming.map((p) => ({ text: describe(state, p).slice(0, 60), run: () => answerOffer(player, p) })),
        ...outgoing.map((p) => ({ text: `§7Withdraw: ${describe(state, p)}`.slice(0, 60), run: () => { withdraw(state, p); commit(); } })),
      ],
    };
  });
}

export async function answerOffer(player, p) {
  const state = S();
  if (p.status !== "open") return;
  const to = state.nations[p.to];
  if (!to || !canRun(player, to)) return;
  const t = TREATY_BY_ID[p.type];
  const yes = await confirm(player, "Treaty Offer", `${describe(state, p)}\n\n${t.desc}\n\nDo you accept on behalf of ${to.name}?`, "§aAccept", "§cRefuse");
  answer(state, p, yes).forEach(announce);
  commit();
}
