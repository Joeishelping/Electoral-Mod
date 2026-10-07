// Text rendering for nations, candidates, regions and results.

import { BLOC_BY_ID, REGION_TEMPLATES } from "../data/blocs.js";
import { ISSUE_BY_ID, ISSUE_IDS } from "../data/issues.js";
import { METRICS, gradeMetric } from "../data/metrics.js";
import { effectiveGov, METHODS } from "../data/governments.js";
import { displayName, getParty, getPerson, personLabel, regionBlocShares } from "../core/state.js";
import { issuePriorities, regionIdeal } from "../engine/apply.js";
import { countyPattern } from "../engine/generate.js";
import { TERM_EVENT_BY_ID } from "../data/events.js";
import { bar, fmt, pct } from "./forms.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);

export function timeLeft(ms) {
  if (ms <= 0) return "closing now";
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m} min left`;
}

export function statusLine(state, nation) {
  if (nation.count) return `§6Election night: ${nation.count.result.title} (${Math.ceil(Math.max(0, nation.count.durationMs - (Date.now() - nation.count.startedAt)) / 60000)} min left)`;
  const e = nation.election;
  if (!e) return "";
  const left = e.closesAt ? ` · ${timeLeft(e.closesAt - Date.now())}` : "";
  return `§aVoting open: ${e.title}${left}`;
}

export function nationSummary(state, nation) {
  const gov = effectiveGov(nation);
  const lines = [`${nation.color}§l${nation.name}§r`, `§7Style: §f${gov.name}§7 - ${gov.tagline}`];
  lines.push(`§7In office (${gov.leaderTitle}): §f${nation.leaderId ? personLabel(state, nation, nation.leaderId) : "nobody yet"}`);
  lines.push(`§7Counties: §f${nation.regions.length}§7 · Candidates: §f${Object.values(state.persons).filter((p) => p.nationId === nation.id).length}`);
  if ((nation.termEvents || []).length) lines.push(`§7This term: §c${nation.termEvents.map((id) => TERM_EVENT_BY_ID[id]?.name).filter(Boolean).join(", ")}`);
  const status = statusLine(state, nation);
  if (status) {
    lines.push("", status);
    const e = nation.election;
    if (e && !nation.count) {
      lines.push(`§7On the ballot: §f${e.candidates.map((id) => displayName(getPerson(state, id))).join(", ")}`);
      lines.push(`§7Player ballots cast: §f${Object.keys(e.ballots).length}`);
    }
  }
  const last = nation.history[0];
  if (last) {
    const w = last.candidates[last.winnerIdx];
    lines.push("", `§7Last election: §f${last.title}§7 - won by ${w ? `${w.color}${w.name}` : "nobody"}`);
  }
  return lines.join("\n");
}

export function metricsPage(nation) {
  return METRICS.map((m) => {
    const v = nation.metrics[m.id] ?? 50;
    return `§f${m.name}§r ${bar(v / 100, 16, v >= 50 ? "§a" : "§c")} ${v} ${gradeMetric(v)}`;
  }).join("\n");
}

export function stanceText(issueId, v) {
  const i = ISSUE_BY_ID[issueId];
  const strength = Math.abs(v) >= 65 ? "Strongly " : "";
  return `${strength}${v < 0 ? i.low : i.high}`;
}

export function personCard(state, nation, p) {
  const party = getParty(nation, p.partyId);
  const home = nation.regions.find((r) => r.id === p.homeRegion);
  const lines = [
    `${party ? party.color : "§f"}§l${displayName(p)}§r`,
    `§7Party: §f${party ? party.name : "Independent"}§7 · From: §f${home ? home.name : "-"}§7 · Times elected: §f${p.terms || 0}`,
    `§7Popularity §f${p.popularity}§7 · Charisma §f${p.charisma}§7 · Competence §f${p.competence}§7 · Honesty §f${p.integrity}§7 · Money §f${p.funds}`,
  ];
  if (p.focus.length) lines.push(`§7Main issues: §e${p.focus.map((f) => `${ISSUE_BY_ID[f].name} (${stanceText(f, p.positions[f])})`).join(", ")}`);
  if (p.targets.length) lines.push(`§7Appeals to: §b${p.targets.map((b) => BLOC_BY_ID[b]?.name).join(", ")}`);
  if (p.campaignRegions.length) lines.push(`§7Campaigning in: §a${p.campaignRegions.map((id) => nation.regions.find((r) => r.id === id)?.name).filter(Boolean).join(", ")}`);
  const other = ISSUE_IDS.filter((id) => !p.focus.includes(id) && Math.abs(p.positions[id]) >= 30);
  if (other.length) lines.push(`§7Other stances: §f${other.map((id) => `${ISSUE_BY_ID[id].name}: ${stanceText(id, p.positions[id])}`).join(", ")}`);
  return lines.join("\n");
}

export function regionProfile(state, nation, region) {
  const shares = regionBlocShares(region);
  const pri = issuePriorities(state, nation, region).slice(0, 4);
  const ideal = regionIdeal(state, nation, region);
  const lean = ISSUE_IDS.filter((id) => Math.abs(ideal[id]) >= 20).sort((a, b) => Math.abs(ideal[b]) - Math.abs(ideal[a])).slice(0, 4);
  const lines = [
    `§l${region.name}§r §7(${REGION_TEMPLATES.find((t) => t.id === region.template)?.name || "Custom"})`,
    `§7Population §f${fmt(region.population)}§7 · Voting power §f${region.power}${region.autoPower === false ? " (manual)" : ""}`,
    "",
    `§6Pattern: §f${countyPattern(nation, region)}`,
    `§6Past winners: ${(region.history || []).length ? region.history.slice(0, 6).map((h) => `${h.color}${h.party || h.name}§7 (+${h.margin}%)`).join("§7, ") : "§7none yet"}`,
    "§6Who lives here: §f" + Object.entries(shares).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([b, s]) => `${BLOC_BY_ID[b].name} ${pct(s, 0)}`).join(", "),
    "§6Cares most about: §f" + pri.map((p) => ISSUE_BY_ID[p.id].name).join(", "),
    "§6Leans toward: §f" + (lean.map((id) => stanceText(id, ideal[id])).join(", ") || "the middle"),
  ];
  const leans = nation.parties.filter((p) => region.lean[p.id]).map((p) => `${p.color}${p.name} ${region.lean[p.id] > 0 ? "+" : ""}${Math.round(region.lean[p.id] * 100)}`);
  if (leans.length) lines.push("§6Party loyalty: " + leans.join("§7, "));
  const habits = [];
  for (const [b, mem] of Object.entries(region.memory || {})) {
    for (const [pid, v] of Object.entries(mem)) {
      const p = nation.parties.find((x) => x.id === pid);
      if (p && Math.abs(v) >= 0.15) habits.push(`${BLOC_BY_ID[b]?.name} ${v > 0 ? "now back" : "turned on"} ${p.color}${p.name}§7`);
    }
  }
  if (habits.length) lines.push("§6Remembered from past votes: §7" + habits.slice(0, 5).join("; "));
  if (region.unrest) lines.push(`§cUnrest: ${region.unrest}`);
  return lines.join("\n");
}

// ---------- results ----------

// Which numbers a viewer sees: official (managed) or true counts.
export function viewOf(result, internal) {
  if (result.official && !internal) {
    return { national: result.official.national, region: (r) => result.official.regions[r.id] || r.votes, turnout: result.official.turnout, official: true };
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
      const win = i === result.winnerIdx ? " §a[WINNER]" : "";
      const party = c.partyName ? ` §7(${c.partyName})` : "";
      const al = alloc ? `  §f${alloc[i]} ${allocLabel}` : "";
      return `${c.color}${c.name}§r${party}${win}\n ${bar(share, 24, c.color)} §f${pct(share)}§7 · ${fmt(votes[i])}${al}`;
    })
    .join("\n");
}

export function resultSummary(result, internal) {
  const v = viewOf(result, internal);
  const lines = [`§l${result.title}§r  §7${result.methodName}`];
  if (result.kind === "popular") {
    lines.push(`§7Turnout: §f${pct(v.turnout)}§7 of ${fmt(result.eligible)} voters${result.playerBallots ? ` · ${result.playerBallots} player ballot(s)` : ""}`);
    if (v.official) lines.push("§8Official figures.");
    if (!v.official && result.official) lines.push("§c§lTRUE COUNT§r §7(only admins see this)");
  }
  lines.push("", candidateRows(result, v.national, result.alloc, result.allocLabel || ""));
  if (result.coalition) {
    const co = result.coalition;
    lines.push("", `§eGoverning ${co.parties.length > 1 ? "coalition" : "party"}§r: ${co.parties.map((p) => `${p.name} (${p.seats})`).join(" + ")} = ${co.seats}/${co.totalSeats}${co.minority ? " §c(minority)" : ""}`);
  }
  if (result.narrative?.length) {
    lines.push("", "§6Why it went this way");
    for (const l of result.narrative) if (internal || !l.includes("[Internal]")) lines.push(` • ${l}`);
  }
  return lines.join("\n");
}

export function regionButton(result, region, internal) {
  const votes = viewOf(result, internal).region(region);
  const total = sum(votes);
  if (!total) return `${region.name}\n§7no eligible voters`;
  const order = votes.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
  const w = result.candidates[order[0][1]];
  return `${region.name}\n${w.color}${w.name}§r +${pct((order[0][0] - (order[1]?.[0] || 0)) / total, 1)}`;
}

export function regionDetail(result, region, internal) {
  const votes = viewOf(result, internal).region(region);
  const lines = [`§l${region.name}§r`];
  if (result.kind === "popular") {
    const cast = sum(votes);
    lines.push(`§7Voters: §f${fmt(region.eligible)}§7 · Ballots: §f${fmt(cast)}§7 · Turnout: §f${pct(region.eligible ? cast / region.eligible : 0)}§7 · Power: §f${region.power}`);
  }
  lines.push("", candidateRows(result, votes, region.alloc, result.allocLabel || ""));
  if (region.factor && (internal || !result.official)) lines.push("", `§6Why:§r the winner's edge here came mostly from §e${region.factor}§r.`);
  return lines.join("\n");
}

export function blocsPage(result) {
  const lines = ["§lHow each group voted§r", ""];
  for (const b of result.blocs.slice().sort((x, y) => sum(y.votes) - sum(x.votes))) {
    const total = sum(b.votes) || 1;
    const order = b.votes.map((x, i) => [x, i]).sort((a, c) => c[0] - a[0]);
    lines.push(`§f${b.name}§7 · turnout ${pct(b.turnout, 0)}`);
    lines.push(" " + order.filter(([x]) => x / total >= 0.02).map(([x, i]) => `${result.candidates[i].color}${result.candidates[i].name} ${pct(x / total, 0)}`).join("§7, "));
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
  return lines.join("\n");
}

export function methodName(id) {
  return METHODS[id]?.name || id;
}

