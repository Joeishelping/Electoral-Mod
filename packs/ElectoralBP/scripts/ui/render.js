// Text rendering for results, nations and voter profiles.

import { BLOC_BY_ID } from "../data/blocs.js";
import { ISSUE_BY_ID } from "../data/issues.js";
import { METRICS, gradeMetric } from "../data/metrics.js";
import { effectiveGov, GOV_BY_ID, officeTitle } from "../data/governments.js";
import { getPerson, personLabel } from "../core/state.js";
import { lineOfSuccession } from "../engine/succession.js";
import { bar, fmt, pct } from "./forms.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);

// Which numbers a viewer sees: official (managed) or true counts.
export function viewOf(result, internal) {
  if (result.official && !internal) {
    return {
      national: result.official.national,
      region: (r) => result.official.regions[r.id] || r.votes,
      turnout: result.official.turnout,
      official: true,
    };
  }
  return { national: result.national, region: (r) => r.votes, turnout: result.turnout, official: false };
}

export function candidateRows(result, votes, alloc = null, allocLabel = "") {
  const total = sum(votes) || 1;
  return result.candidates
    .map((c, i) => [c, i])
    .sort((a, b) => votes[b[1]] - votes[a[1]])
    .map(([c, i]) => {
      const share = votes[i] / total;
      const win = i === result.winnerIdx ? " §a[WIN]" : "";
      const party = c.partyName ? ` §7(${c.partyName})` : "";
      const al = alloc ? `  §f${alloc[i]} ${allocLabel}` : "";
      return `${c.color}${c.name}§r${party}${win}\n ${bar(share, 24, c.color)} §f${pct(share)}§7 · ${fmt(votes[i])}${al}`;
    })
    .join("\n");
}

export function resultSummary(state, nation, result, internal) {
  const v = viewOf(result, internal);
  const lines = [];
  lines.push(`§l${result.title}§r  §7#${result.no} · ${result.methodName}`);
  if (result.kind === "popular") {
    lines.push(`§7Turnout: §f${pct(v.turnout)}§7 of ${fmt(result.eligible)} eligible${result.playerBallots ? ` · ${result.playerBallots} player ballot(s)` : ""}`);
    if (v.official) lines.push("§8Official figures as published by the government.");
    if (!v.official && result.official) lines.push("§c§lINTERNAL ASSESSMENT§r §7(true counts)");
  }
  lines.push("");
  if (result.candidates.length) {
    lines.push(candidateRows(result, v.national, result.alloc, result.allocLabel || ""));
  }
  if (result.coalition) {
    const co = result.coalition;
    lines.push("", `§eGoverning coalition§r (${co.seats}/${co.totalSeats}, majority ${co.majority}${co.minority ? ", §cminority§e" : ""}):`);
    for (const p of co.parties) lines.push(` • ${p.name}: ${p.seats} seats`);
  }
  if (result.narrative?.length) {
    lines.push("", "§6Analysis");
    for (const l of result.narrative) if (internal || !l.includes("[Internal]")) lines.push(` • ${l}`);
  }
  if (result.outcome) {
    const gov = effectiveGov(nation);
    lines.push("", "§6Outcome");
    lines.push(` ${gov.leaderTitle}: ${personLabel(state, nation, result.outcome.leaderId)}`);
    lines.push(` ${gov.deputyTitle}: ${personLabel(state, nation, result.outcome.deputyId)}`);
    for (const n of result.outcome.notes || []) lines.push(` §7${n}`);
  }
  return lines.join("\n");
}

export function regionButton(result, region, internal) {
  const v = viewOf(result, internal);
  const votes = v.region(region);
  const total = sum(votes);
  if (!total) return `${region.name}\n§7no eligible voters`;
  const order = votes.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
  const w = result.candidates[order[0][1]];
  const margin = (order[0][0] - (order[1]?.[0] || 0)) / total;
  return `${region.name}\n${w.color}${w.name}§r +${pct(margin, 1)}`;
}

export function regionDetail(state, nation, result, region, internal) {
  const v = viewOf(result, internal);
  const votes = v.region(region);
  const lines = [`§l${region.name}§r`];
  if (result.kind === "popular") {
    const cast = sum(votes);
    lines.push(`§7Eligible: §f${fmt(region.eligible)}§7 · Ballots: §f${fmt(cast)}§7 · Turnout: §f${pct(region.eligible ? cast / region.eligible : 0)}`);
    if (region.power) lines.push(`§7Voting power: §f${region.power}`);
  }
  lines.push("");
  lines.push(candidateRows(result, votes, region.alloc, result.allocLabel || ""));
  if (region.factor && (internal || !result.official)) lines.push("", `§6Why:§r the winner's edge here came mostly from §e${region.factor}§r.`);
  if (internal && region.unrestDelta) lines.push(`§cUnrest from the managed count: +${region.unrestDelta}`);
  return lines.join("\n");
}

export function blocsPage(result) {
  const lines = ["§lHow each group voted§r §7(exit poll)", ""];
  for (const b of result.blocs.slice().sort((x, y) => sum(y.votes) - sum(x.votes))) {
    const total = sum(b.votes) || 1;
    const order = b.votes.map((x, i) => [x, i]).sort((a, c) => c[0] - a[0]);
    lines.push(`§f${b.name}§7 · turnout ${pct(b.turnout, 0)} · ${fmt(total)} votes`);
    lines.push(
      " " +
        order
          .filter(([x]) => x / total >= 0.02)
          .map(([x, i]) => `${result.candidates[i].color}${result.candidates[i].name.split(" ")[0]} ${pct(x / total, 0)}`)
          .join("§7, ")
    );
  }
  return lines.join("\n");
}

export function roundsPage(result) {
  const lines = [`§lCount by round§r §7(${result.methodName})`, ""];
  for (const r of result.rounds) {
    lines.push(`§e${r.label}`);
    const total = sum(r.votes) || 1;
    result.candidates.forEach((c, i) => {
      if (!r.votes[i] && !(r.alloc && r.alloc[i])) return;
      lines.push(` ${c.color}${c.name}§r ${pct(r.votes[i] / total)}${r.alloc ? ` · ${r.alloc[i]} ${result.allocLabel || ""}` : ""}`);
    });
    if (r.eliminated !== undefined && r.eliminated !== null) lines.push(` §cEliminated: ${result.candidates[r.eliminated].name}`);
    if (r.note) lines.push(` §7${r.note}`);
    lines.push("");
  }
  if (result.electors) {
    lines.push("§eFinal votes of the electors");
    for (const e of result.electors) {
      const c = result.candidates[e.vote];
      lines.push(` ${e.name} §7(${e.weight}%)§r -> ${c ? `${c.color}${c.name}` : "§7abstain"}`);
    }
  }
  return lines.join("\n");
}

export function governmentPage(state, nation) {
  const gov = effectiveGov(nation);
  const lines = [];
  lines.push(`${nation.color}§l${nation.name}§r §7· ${GOV_BY_ID[nation.gov]?.name || nation.gov}`);
  lines.push(`§7${gov.description}`);
  lines.push("");
  lines.push(`§6${gov.leaderTitle}:§r ${personLabel(state, nation, nation.leaderId)}${nation.leaderId ? ` §7(term ${nation.leaderTerms || 1}${gov.termLimit ? ` of ${gov.termLimit}` : ""})` : ""}`);
  lines.push(`§6${gov.deputyTitle}:§r ${personLabel(state, nation, nation.deputyId)}`);
  const heir = getPerson(state, nation.heirId);
  if (heir) lines.push(`§6Designated heir:§r ${personLabel(state, nation, heir)}`);
  lines.push("", "§6Cabinet");
  for (const officeId of gov.offices) lines.push(` §7${officeTitle(gov, officeId)}:§r ${personLabel(state, nation, nation.cabinet[officeId])}`);
  const line = lineOfSuccession(state, nation).slice(0, 5);
  lines.push("", "§6Line of succession");
  if (!line.length) lines.push(gov.succession === "council" ? ` §7Chosen by the ${gov.assemblyName}.` : " §7(empty)");
  line.forEach((l, i) => lines.push(` ${i + 1}. ${personLabel(state, nation, l.person)} §7- ${l.why}`));
  if (nation.approval) {
    const a = nation.approval;
    lines.push("", `§6Approval:§r ${bar(a.national, 20, a.national >= 0.5 ? "§a" : "§c")} ${pct(a.national)}`);
    if (a.revoltRisk > 0.25) lines.push(`§cUnrest warning: revolt risk ${pct(a.revoltRisk, 0)}`);
  }
  const last = nation.history[0];
  if (last) {
    const w = last.candidates[last.winnerIdx];
    lines.push("", `§7Last contest: #${last.no} ${last.title} -> ${w ? `${w.color}${w.name}` : "none"}`);
  }
  if (nation.election) lines.push("", `§a§lOPEN:§r ${nation.election.title} §7(${nation.election.candidates.length} candidates, ${Object.keys(nation.election.ballots).length} player ballots)`);
  return lines.join("\n");
}

export function metricsPage(nation) {
  return METRICS.map((m) => {
    const v = nation.metrics[m.id] ?? 50;
    return `§f${m.name}§r ${bar(v / 100, 16, v >= 50 ? "§a" : "§c")} ${v} ${gradeMetric(v)}`;
  }).join("\n");
}

export function personCard(state, nation, p) {
  const party = nation.parties.find((x) => x.id === p.partyId);
  const lines = [
    `${party ? party.color : "§f"}§l${p.name}§r${p.player ? ` §7[player: ${p.player}]` : ""}${p.alive ? "" : " §c(deceased)"}`,
    `§7Party: §f${party ? party.name : "Independent"}§7 · Age: §f${p.age}§7 · Terms served: §f${p.terms || 0}`,
    `§7Popularity §f${p.popularity}§7 · Charisma §f${p.charisma}§7 · Competence §f${p.competence}`,
    `§7Integrity §f${p.integrity}§7 · Loyalty §f${p.loyalty}§7 · Funds §f${p.funds}`,
  ];
  if (p.dynasty) lines.push(`§7Bloodline: §f${p.dynasty}§7 · Legitimacy §f${p.legitimacy}${p.parentId ? `§7 · Parent: §f${getPerson(state, p.parentId)?.name || "?"}` : ""}`);
  if (p.clanId) lines.push(`§7House/Clan: §f${state.houses[p.clanId]?.name || "?"}`);
  if (p.focus.length) lines.push(`§7Campaigns on: §e${p.focus.map((f) => ISSUE_BY_ID[f]?.name).join(", ")}`);
  if (p.targets.length) lines.push(`§7Courts: §b${p.targets.map((b) => BLOC_BY_ID[b]?.name).join(", ")}`);
  const strong = Object.entries(p.positions).filter(([, v]) => Math.abs(v) >= 40).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
  if (strong.length) {
    lines.push("§7Key stances:");
    for (const [id, v] of strong) lines.push(`  §f${ISSUE_BY_ID[id].name}: ${v < 0 ? ISSUE_BY_ID[id].low : ISSUE_BY_ID[id].high} §7(${v > 0 ? "+" : ""}${v})`);
  }
  return lines.join("\n");
}
