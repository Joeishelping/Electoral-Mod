// Election, polling, counting, succession and results screens.

import { system } from "@minecraft/server";
import { BLOC_BY_ID } from "../data/blocs.js";
import { ISSUE_BY_ID } from "../data/issues.js";
import { effectiveGov, METHODS, officeTitle } from "../data/governments.js";
import { getPerson, getRegion } from "../core/state.js";
import { hashSeed } from "../core/random.js";
import { computeElection, eligibleCandidates, openElection } from "../engine/election.js";
import { applyResult, applySuccession, issuePriorities, surveyApproval } from "../engine/apply.js";
import { computeSuccession } from "../engine/succession.js";
import { forecastJob } from "../engine/forecast.js";
import { bar, confirm, modal, notice, pct } from "./forms.js";
import { announce, commit, isAdmin, loop, S } from "./nav.js";
import { blocsPage, regionButton, regionDetail, resultSummary, roundsPage } from "./render.js";

const nowSeed = (...parts) => hashSeed(...parts, Date.now(), Math.random());

function runJob(gen) {
  return new Promise((resolve) => {
    system.runJob(
      (function* () {
        yield* gen;
        resolve();
      })()
    );
  });
}

// ---------- results viewer ----------

export async function viewResult(player, nation, result, opts = {}) {
  const state = S();
  const admin = isAdmin(player);
  let internal = false;
  return loop(player, () => ({
    title: opts.preview ? "§cPREVIEW§r Results" : `Results #${result.no}`,
    body: (opts.preview ? "§c§lPREVIEW - nothing has been changed.§r\n" : "") + resultSummary(state, nation, result, internal),
    options: [
      result.regions.length && {
        text: result.kind === "popular" ? "Results by Region" : "Votes by Region",
        icon: "textures/items/map_filled",
        run: () => regionsList(player, nation, result, internal),
      },
      result.blocs.length && (internal || !result.official) && { text: "How Groups Voted", icon: "textures/items/name_tag", run: () => loop(player, () => ({ title: "Exit Poll", body: blocsPage(result), options: [] })) },
      (result.rounds.length > 1 || result.electors) && { text: result.electors ? "Ballots & Electors" : "Rounds", icon: "textures/items/paper", run: () => loop(player, () => ({ title: "Count", body: roundsPage(result), options: [] })) },
      result.outcome && { text: "New Government", icon: "textures/items/book_written", run: () => outcomePage(player, nation, result) },
      admin && result.official && {
        text: internal ? "§aShow Official Figures" : "§cShow Internal Assessment",
        run: () => {
          internal = !internal;
        },
      },
    ],
  }));
}

function regionsList(player, nation, result, internal) {
  return loop(player, () => ({
    title: "By Region",
    body: result.allocLabel ? `§7${result.allocLabel} are awarded per region.` : "",
    options: result.regions.map((r) => ({
      text: regionButton(result, r, internal),
      run: () => loop(player, () => ({ title: r.name, body: regionDetail(S(), nation, result, r, internal), options: [] })),
    })),
  }));
}

function outcomePage(player, nation, result) {
  const state = S();
  const gov = effectiveGov(nation);
  const o = result.outcome;
  const lines = [`§6${gov.leaderTitle}:§r ${name(state, o.leaderId)}`, `§6${gov.deputyTitle}:§r ${name(state, o.deputyId)}`, ""];
  for (const [office, id] of Object.entries(o.cabinet)) lines.push(`§7${officeTitle(gov, office)}:§r ${name(state, id)}`);
  for (const n of o.notes || []) lines.push(`§7${n}`);
  return loop(player, () => ({ title: "New Government", body: lines.join("\n"), options: [] }));
}

const name = (state, id) => getPerson(state, id)?.name || "§7(vacant)";

export function historyMenu(player, nation) {
  return loop(player, () => ({
    title: "Election History",
    body: nation.history.length ? "§7Most recent first." : "§7No contests held yet.",
    options: nation.history.map((r) => {
      const w = r.candidates[r.winnerIdx];
      return { text: `#${r.no} ${r.title}\n${w ? `${w.color}${w.name}` : "§7no winner"}`, run: () => viewResult(player, nation, r) };
    }),
  }));
}

// ---------- polling ----------

export async function forecastMenu(player, nation) {
  const election = nation.election;
  if (!election) return;
  const out = {};
  player.sendMessage("§7Running 120 simulated elections...");
  await runJob(forecastJob(S(), nation, election, 120, out));
  if (!nation.election) return;
  const admin = isAdmin(player);
  const cands = election.candidates.map((id) => getPerson(S(), id));
  const lines = [`§l${election.title}§r §7· ${out.sims} simulations`, ""];
  const order = cands.map((c, i) => i).sort((a, b) => out.winProb[b] - out.winProb[a]);
  for (const i of order) {
    const c = cands[i];
    const party = nation.parties.find((p) => p.id === c?.partyId);
    const color = party?.color || "§f";
    const showShare = admin || !out.officialShare;
    const share = showShare ? out.meanShare[i] : out.officialShare[i];
    lines.push(`${color}${c?.name || "?"}§r §7win chance §f${pct(out.winProb[i], 0)}`);
    lines.push(` ${bar(out.winProb[i], 20, color)}  §7vote ${pct(share)} ± ${pct(out.sdShare[i] * 2, 1)}${out.meanAlloc[i] ? ` · ~${out.meanAlloc[i].toFixed(1)} ${out.allocLabel || ""}` : ""}`);
  }
  if (admin && out.officialShare) {
    lines.push("", "§8[Internal] Projected official shares: " + order.map((i) => `${cands[i]?.name.split(" ")[0]} ${pct(out.officialShare[i], 0)}`).join(", "));
  }
  const regs = Object.values(out.regions);
  if (regs.length) {
    lines.push("", "§6Region ratings");
    for (const r of regs) {
      const c = cands[r.lead];
      const party = nation.parties.find((p) => p.id === c?.partyId);
      lines.push(` §f${r.name}§7: ${r.rating === "Toss-up" ? "§eToss-up" : `${party?.color || "§f"}${r.rating} ${c?.name.split(" ")[0]}`} §7(${pct(r.prob, 0)})`);
    }
  }
  const pri = issuePriorities(S(), nation).slice(0, 4);
  lines.push("", "§6What voters care about: §f" + pri.map((p) => ISSUE_BY_ID[p.id].name).join(", "));
  return loop(player, () => ({ title: "Polls & Forecast", body: lines.join("\n"), options: [] }));
}

// ---------- public mood ----------

export function moodMenu(player, nation) {
  const state = S();
  const survey = surveyApproval(state, nation, hashSeed(nation.id, "mood", nation.electionCount, JSON.stringify(nation.metrics)));
  if (!survey) return notice(player, "Public Mood", "There is no sitting leader to rate.");
  nation.approval = survey;
  commit();
  const gov = effectiveGov(nation);
  const lines = [
    `§7Approval of ${gov.leaderTitle} §f${getPerson(state, nation.leaderId)?.name}`,
    `${bar(survey.national, 24, survey.national >= 0.5 ? "§a" : "§c")} §f${pct(survey.national)}`,
    survey.revoltRisk > 0.15 ? `§cRevolt / removal risk: ${pct(survey.revoltRisk, 0)}` : `§7Revolt risk: ${pct(survey.revoltRisk, 0)}`,
    "",
    "§6By region",
  ];
  for (const r of survey.regions) lines.push(` §f${r.name}§r ${bar(r.approval, 14, r.approval >= 0.5 ? "§a" : "§c")} ${pct(r.approval, 0)}${r.unrest ? ` §c(unrest ${r.unrest})` : ""}`);
  lines.push("", "§6By group");
  for (const b of survey.blocs.sort((x, y) => y.approval - x.approval)) lines.push(` §f${BLOC_BY_ID[b.id]?.name}§r ${bar(b.approval, 14, b.approval >= 0.5 ? "§a" : "§c")} ${pct(b.approval, 0)}`);
  return loop(player, () => ({ title: "Public Mood", body: lines.join("\n"), options: [] }));
}

// ---------- ballots ----------

export async function castBallot(player, nation) {
  const state = S();
  const election = nation.election;
  if (!election || election.kind !== "popular") return notice(player, "Ballot", "There is no open popular election in this nation.");
  let residence = state.residents[player.name];
  if (!residence || residence.nationId !== nation.id) {
    const r = await modal(player, "Register to Vote", [
      { key: "region", type: "dropdown", label: `You must be a resident of ${nation.name} to vote. Choose your home region:`, options: nation.regions.map((x) => x.name) },
    ], "Register");
    if (!r || !nation.regions[r.region]) return;
    residence = state.residents[player.name] = { nationId: nation.id, regionId: nation.regions[r.region].id };
    commit();
  }
  const region = getRegion(nation, residence.regionId);
  if (!region) return notice(player, "Ballot", "Your registered region no longer exists. Register again.");
  const cands = election.candidates.map((id) => getPerson(state, id)).filter(Boolean);
  const current = election.ballots[player.name];
  const gov = effectiveGov(nation);
  const r = await modal(player, election.title, [
    {
      key: "choice",
      type: "dropdown",
      label: `§7Voting in §f${region.name}§7. Your ballot counts as §f${gov.ballotWeight}§7 votes.\n\nChoose your candidate:`,
      options: ["(abstain / withdraw ballot)", ...cands.map((c) => `${c.name}${nation.parties.find((p) => p.id === c.partyId) ? ` (${nation.parties.find((p) => p.id === c.partyId).name})` : ""}`)],
      value: current ? cands.findIndex((c) => c.id === current.candidateId) + 1 : 0,
    },
  ], "Cast Ballot");
  if (!r) return;
  if (r.choice === 0) delete election.ballots[player.name];
  else election.ballots[player.name] = { candidateId: cands[r.choice - 1].id, regionId: region.id };
  commit();
  player.sendMessage(r.choice === 0 ? "§7Your ballot was withdrawn." : `§aBallot cast for ${cands[r.choice - 1].name}. It is secret until the count.`);
}

// ---------- admin: election management ----------

async function pickCandidates(player, nation, preselected) {
  const state = S();
  const gov = effectiveGov(nation);
  const pool = eligibleCandidates(state, nation, gov);
  if (pool.length < 1) {
    await notice(player, "Candidates", "No eligible notables. Add people under Notables & Candidates (adults, and approved if candidates are vetted).");
    return null;
  }
  const fields = pool.slice(0, 40).map((p) => {
    const party = nation.parties.find((x) => x.id === p.partyId);
    return { key: p.id, type: "toggle", label: `${party ? party.color : "§f"}${p.name}§r §7${party ? party.name : "Ind."} · pop ${p.popularity} · comp ${p.competence}${p.id === nation.leaderId ? " · §6incumbent" : ""}`, value: preselected.includes(p.id) };
  });
  const r = await modal(player, "Choose Candidates", fields, "Next");
  if (!r) return null;
  return pool.filter((p) => r[p.id]).map((p) => p.id);
}

function defaultCandidates(state, nation, gov) {
  const pool = eligibleCandidates(state, nation, gov);
  if (gov.multiParty && nation.parties.length) {
    const picks = [];
    for (const party of nation.parties) {
      const best = pool.filter((p) => p.partyId === party.id).sort((a, b) => (b.id === nation.leaderId) - (a.id === nation.leaderId) || b.popularity - a.popularity)[0];
      if (best) picks.push(best.id);
    }
    if (picks.length >= 2) return picks;
  }
  return pool.sort((a, b) => (b.id === nation.leaderId) - (a.id === nation.leaderId) || b.popularity + b.competence - (a.popularity + a.competence)).slice(0, 4).map((p) => p.id);
}

async function callElection(player, nation) {
  const state = S();
  const gov = effectiveGov(nation);
  const ids = await pickCandidates(player, nation, defaultCandidates(state, nation, gov));
  if (!ids) return;
  if (ids.length < 1) return notice(player, "Election", "Pick at least one candidate.");
  const methods = gov.selection === "council" ? [] : gov.methods.includes(gov.method) ? gov.methods : [gov.method, ...gov.methods];
  const fields = [{ key: "title", type: "text", label: "Title", value: `${gov.leaderTitle} Election ${nation.electionCount + 1}` }];
  if (methods.length) fields.push({ key: "method", type: "dropdown", label: "Counting method", options: methods.map((m) => `${METHODS[m].name} - ${METHODS[m].desc}`), value: methods.indexOf(gov.method) });
  const cnames = ids.map((id) => getPerson(state, id).name);
  if (gov.integrity < 0.999 && gov.selection !== "council") {
    const def = ids.indexOf(nation.leaderId);
    fields.push({ key: "endorsed", type: "dropdown", label: "Establishment-endorsed candidate (benefits from the managed count)", options: cnames, value: def >= 0 ? def : 0 });
  }
  const r = await modal(player, "Call Election", fields, "Open Voting");
  if (!r) return;
  openElection(state, nation, gov, {
    candidates: ids,
    method: methods.length ? methods[r.method] : gov.method,
    title: r.title || "Election",
    endorsedId: r.endorsed !== undefined ? ids[r.endorsed] : null,
  });
  commit();
  announce(`${nation.color}${nation.name}§r: §e${nation.election.title}§r is open! Candidates: ${cnames.join(", ")}.${gov.selection === "council" ? "" : " Cast your ballot at any Board Table."}`);
}

async function countVotes(player, nation, preview) {
  const state = S();
  const election = nation.election;
  if (!election) return;
  if (election.candidates.length < 1) return notice(player, "Count", "This election has no candidates.");
  if (!preview && !(await confirm(player, "Count the Votes", `Close voting for §e${election.title}§r and certify the result? This changes the government.`))) return;
  const seed = nowSeed(nation.id, election.id);
  const result = computeElection(state, nation, election, seed);
  if (preview) return viewResult(player, nation, result, { preview: true });
  applyResult(state, nation, result);
  commit();
  const w = result.candidates[result.winnerIdx];
  const gov = effectiveGov(nation);
  announce(`${nation.color}${nation.name}§r: ${w.color}${w.name}§r wins the ${result.title}${result.official ? ` with ${pct(result.official.national[result.winnerIdx] / (result.official.national.reduce((a, b) => a + b, 0) || 1))} (official)` : ""} and becomes ${gov.leaderTitle}.`);
  return viewResult(player, nation, result);
}

async function editElection(player, nation) {
  const election = nation.election;
  const ids = await pickCandidates(player, nation, election.candidates);
  if (!ids) return;
  election.candidates = ids;
  for (const [p, b] of Object.entries(election.ballots)) if (!ids.includes(b.candidateId)) delete election.ballots[p];
  const gov = effectiveGov(nation);
  if (election.kind === "popular" && gov.methods.length > 1) {
    const r = await modal(player, "Counting Method", [{ key: "m", type: "dropdown", label: "Method", options: gov.methods.map((m) => METHODS[m].name), value: Math.max(0, gov.methods.indexOf(election.method)) }]);
    if (r) election.method = gov.methods[r.m];
  }
  commit();
}

const REASONS = ["death", "abdication", "resignation", "removal"];

async function successionEvent(player, nation) {
  const state = S();
  const gov = effectiveGov(nation);
  const leader = getPerson(state, nation.leaderId);
  const r = await modal(player, "Leader Vacancy", [
    { key: "reason", type: "dropdown", label: `${gov.leaderTitle}: §f${leader?.name || "(vacant)"}§r\nWhat happened?`, options: ["Death", "Abdication / retirement", "Resignation", "Removal / coup / impeachment"] },
  ], "Continue");
  if (!r) return;
  const reason = REASONS[r.reason];
  const result = computeSuccession(state, nation, reason, nowSeed(nation.id, "succession"));
  if (!(await confirm(player, "Succession", `${result.narrative.join("\n")}\n\n§7Apply this succession?`))) return;
  applySuccession(state, nation, result, reason);
  commit();
  const w = getPerson(state, result.winnerId);
  announce(`${nation.color}${nation.name}§r: ${leader ? `${leader.name}'s rule ends (${reason}). ` : ""}${w ? `§e${w.name}§r is the new ${gov.leaderTitle}.` : "§cThe throne/office stands empty!"}`);
  return viewResult(player, nation, result);
}

export function electionsMenu(player, nation) {
  return loop(player, () => {
    const gov = effectiveGov(nation);
    const e = nation.election;
    const state = S();
    const lines = [`§7Selection: §f${gov.selection === "hereditary" ? `Hereditary (${gov.successionLaw})` : gov.selection === "council" ? `${gov.assemblyName} (council)` : METHODS[gov.method]?.name || gov.method}`];
    if (e) {
      lines.push("", `§a§lOPEN:§r ${e.title} §7(${e.kind === "council" ? "council vote" : METHODS[e.method]?.name})`);
      for (const id of e.candidates) lines.push(` • ${getPerson(state, id)?.name}`);
      lines.push(`§7Player ballots: ${Object.keys(e.ballots).length}`);
    } else lines.push("", "§7No election is open.");
    const canElect = gov.selection !== "hereditary";
    return {
      title: "Elections & Succession",
      body: lines.join("\n"),
      options: [
        !e && canElect && { text: "§2Call New Election", icon: "textures/items/paper", run: () => callElection(player, nation) },
        e && { text: "Polls & Forecast", icon: "textures/items/compass_item", run: () => forecastMenu(player, nation) },
        e && e.kind === "popular" && { text: "Cast My Ballot", run: () => castBallot(player, nation) },
        e && { text: "§2Count the Votes", icon: "textures/items/book_written", run: () => countVotes(player, nation, false) },
        e && { text: "Preview a Count (no changes)", run: () => countVotes(player, nation, true) },
        e && { text: "Edit Candidates / Method", run: () => editElection(player, nation) },
        e && {
          text: "§cCancel Election",
          run: async () => {
            if (await confirm(player, "Cancel", "Cancel the open election and discard ballots?")) {
              nation.election = null;
              commit();
            }
          },
        },
        { text: "Leader Vacancy / Succession", icon: "textures/items/totem", run: () => successionEvent(player, nation) },
        { text: "Public Mood Survey", run: () => moodMenu(player, nation) },
        { text: "Election History", run: () => historyMenu(player, nation) },
      ],
    };
  });
}

