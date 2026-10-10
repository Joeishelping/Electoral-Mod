// Interest-group screens, Democracy-game style.

import { getPerson, displayName } from "../core/state.js";
import { groupOpinions } from "../engine/dossier.js";
import { effectiveGov } from "../data/governments.js";
import { bar, pct } from "./forms.js";
import { loop, page, S } from "./nav.js";

function reasonText(reasons) {
  return reasons.map((r) => `${r.value > 0 ? "§a+" : "§c-"} ${r.text}`).join("§7, ") || "§7no strong feelings";
}

/** How every interest group feels about one person, and why. */
export function dossierPage(player, nation, personId) {
  const state = S();
  const p = getPerson(state, personId);
  if (!p) return;
  const ops = groupOpinions(state, nation, personId);
  const lines = [`§l${displayName(p)}§r §7- how the interest groups see them`, ""];
  for (const o of ops) {
    lines.push(`§f${o.name} §7(${pct(o.share, 0)} of people)`);
    lines.push(` ${bar(o.approval, 16, o.approval >= 0.5 ? "§a" : "§c")} §f${pct(o.approval, 0)}  ${reasonText(o.reasons)}`);
  }
  return page(player, "Group Support", lines.join("\n"));
}

/** The nation's interest groups: size, mood toward the officeholder, and what drives it. */
export function interestGroupsPage(player, nation) {
  return loop(player, () => {
    const state = S();
    const gov = effectiveGov(nation);
    const leader = getPerson(state, nation.leaderId);
    const ops = leader ? groupOpinions(state, nation, leader.id) : [];
    const lines = [leader ? `§7How each interest group feels about the ${gov.leaderTitle}, §f${displayName(leader)}§7:` : "§7Nobody holds office yet. Pick a candidate to see how the groups feel about them.", ""];
    for (const o of ops) {
      lines.push(`§f${o.name} §7(${pct(o.share, 0)})`);
      lines.push(` ${bar(o.approval, 14, o.approval >= 0.5 ? "§a" : "§c")} §f${pct(o.approval, 0)}  ${reasonText(o.reasons.slice(0, 3))}`);
    }
    const people = Object.values(state.persons).filter((x) => x.nationId === nation.id && x.name);
    return {
      title: "Interest Groups",
      body: lines.join("\n"),
      options: people.map((x) => ({ text: `Group support for ${x.name}`, run: () => dossierPage(player, nation, x.id) })),
    };
  });
}
