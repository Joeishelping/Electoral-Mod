// Election screens: starting a vote, ballots, polls, the live count and results.

import { system } from "@minecraft/server";
import { BLOC_BY_ID } from "../data/blocs.js";
import { ISSUE_BY_ID } from "../data/issues.js";
import { effectiveGov, METHODS } from "../data/governments.js";
import { displayName, getParty, getPerson, getRegion } from "../core/state.js";
import { hashSeed } from "../core/random.js";
import { eligibleCandidates, openElection } from "../engine/election.js";
import { issuePriorities, surveyApproval } from "../engine/apply.js";
import { forecastJob } from "../engine/forecast.js";
import { beginCount, finishCount, liveView } from "../engine/night.js";
import { bar, confirm, modal, notice, pct } from "./forms.js";
import { announce, commit, isAdmin, loop, page, S } from "./nav.js";
import { blocsPage, regionButton, regionDetail, resultSummary, roundsPage, timeLeft } from "./render.js";

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

const candText = (state, nation, id) => {
  const p = getPerson(state, id);
  const party = getParty(nation, p?.partyId);
  return `${party ? party.color : "§f"}${displayName(p)}§r${party ? ` §7(${party.name})` : ""}`;
};

// ---------- results ----------

export function viewResult(player, nation, result) {
  const admin = isAdmin(player);
  let internal = false;
  return loop(player, () => ({
    title: result.title,
    body: resultSummary(result, internal),
    options: [
      result.regions.length && { text: "Results by County", icon: "textures/items/map_filled", run: () => regionsList(player, result, internal) },
      result.blocs.length && (internal || !result.official) && { text: "How Each Group Voted", icon: "textures/items/name_tag", run: () => page(player, "Groups", blocsPage(result)) },
      result.rounds.length > 1 && { text: "Round by Round", icon: "textures/items/paper", run: () => page(player, "Rounds", roundsPage(result)) },
      admin && result.official && { text: internal ? "§aShow Official Figures" : "§cShow True Count (admin)", run: () => { internal = !internal; } },
    ],
  }));
}

function regionsList(player, result, internal) {
  return loop(player, () => ({
    title: "By County",
    body: result.allocLabel ? `§7${result.allocLabel} are awarded per county.` : "",
    options: result.regions.map((r) => ({ text: regionButton(result, r, internal), run: () => page(player, r.name, regionDetail(result, r, internal)) })),
  }));
}

export function historyMenu(player, nation) {
  return loop(player, () => ({
    title: "Past Elections",
    body: nation.history.length ? "§7Most recent first." : "§7No elections yet.",
    options: nation.history.map((r) => {
      const w = r.candidates[r.winnerIdx];
      return { text: `${r.title}\n${w ? `${w.color}${w.name}` : "§7no winner"}`, run: () => viewResult(player, nation, r) };
    }),
  }));
}

// ---------- polls ----------

export async function pollMenu(player, nation) {
  const election = nation.election;
  if (!election) return;
  const out = {};
  player.sendMessage("§7Polling the public...");
  await runJob(forecastJob(S(), nation, election, 100, out));
  if (!nation.election) return;
  const state = S();
  const admin = isAdmin(player);
  const lines = [`§l${election.title}§r §7- poll of ${out.sims} simulated outcomes`, ""];
  const order = election.candidates.map((_, i) => i).sort((a, b) => out.winProb[b] - out.winProb[a]);
  for (const i of order) {
    const p = getPerson(state, election.candidates[i]);
    const color = getParty(nation, p?.partyId)?.color || "§f";
    const share = !admin && out.officialShare ? out.officialShare[i] : out.meanShare[i];
    lines.push(`${candText(state, nation, election.candidates[i])}`);
    lines.push(` §7Chance to win ${bar(out.winProb[i], 16, color)} §f${pct(out.winProb[i], 0)}§7 · expected vote ${pct(share, 0)} (±${pct(out.sdShare[i] * 2, 0)})`);
  }
  const regs = Object.values(out.regions);
  if (regs.length) {
    lines.push("", "§6County by county");
    for (const r of regs) {
      const p = getPerson(state, election.candidates[r.lead]);
      const color = getParty(nation, p?.partyId)?.color || "§f";
      lines.push(` §f${r.name}§7: ${r.rating === "Toss-up" ? "§eToss-up" : `${color}${r.rating} ${displayName(p)}`}`);
    }
  }
  lines.push("", "§6Voters care most about: §f" + issuePriorities(state, nation).slice(0, 4).map((p) => ISSUE_BY_ID[p.id].name).join(", "));
  lines.push("§8Polls can be wrong - upsets happen.");
  return page(player, "Latest Poll", lines.join("\n"));
}

// ---------- public mood ----------

export function moodMenu(player, nation) {
  const state = S();
  const survey = surveyApproval(state, nation, hashSeed(nation.id, "mood", nation.electionCount, JSON.stringify(nation.metrics)));
  if (!survey) return notice(player, "Public Mood", "Nobody is marked as in office. Set it under Leader Performance.");
  nation.approval = survey;
  commit();
  const lines = [
    `§7Approval of §f${displayName(getPerson(state, nation.leaderId))}`,
    `${bar(survey.national, 24, survey.national >= 0.5 ? "§a" : "§c")} §f${pct(survey.national)}`,
    "",
    "§6By county",
    ...survey.regions.map((r) => ` §f${r.name}§r ${bar(r.approval, 12, r.approval >= 0.5 ? "§a" : "§c")} ${pct(r.approval, 0)}${r.unrest ? ` §c(unrest ${r.unrest})` : ""}`),
    "",
    "§6By group",
    ...survey.blocs.sort((x, y) => y.approval - x.approval).map((b) => ` §f${BLOC_BY_ID[b.id]?.name}§r ${bar(b.approval, 12, b.approval >= 0.5 ? "§a" : "§c")} ${pct(b.approval, 0)}`),
  ];
  return page(player, "Public Mood", lines.join("\n"));
}

// ---------- ballots ----------

export async function castBallot(player, nation) {
  const state = S();
  const election = nation.election;
  if (!election || nation.count) return notice(player, "Vote", "Voting is not open right now.");
  if (election.kind !== "popular") return notice(player, "Vote", "This is a council vote - the council electors decide it, not individual players.");
  if (!nation.regions.length) return notice(player, "Vote", "This nation has no counties yet.");
  const residence = state.residents[player.name];
  const homeIdx = residence?.nationId === nation.id ? nation.regions.findIndex((r) => r.id === residence.regionId) : -1;
  const current = election.ballots[player.name];
  const cands = election.candidates.map((id) => getPerson(state, id)).filter(Boolean);
  const gov = effectiveGov(nation);
  const r = await modal(player, election.title, [
    { key: "region", type: "dropdown", label: "Which county do you live in?", options: nation.regions.map((x) => x.name), value: Math.max(0, homeIdx) },
    {
      key: "choice",
      type: "dropdown",
      label: `§7Your ballot counts as §f${gov.ballotWeight}§7 votes. It stays secret until the count.\n\n§fYour vote:`,
      options: ["(no vote)", ...cands.map((c) => `${displayName(c)}${getParty(nation, c.partyId) ? ` (${getParty(nation, c.partyId).name})` : ""}`)],
      value: current ? cands.findIndex((c) => c.id === current.candidateId) + 1 : 0,
    },
  ], "Cast Ballot");
  if (!r || !nation.election) return;
  const region = nation.regions[r.region];
  state.residents[player.name] = { nationId: nation.id, regionId: region.id };
  if (r.choice === 0) delete election.ballots[player.name];
  else election.ballots[player.name] = { candidateId: cands[r.choice - 1].id, regionId: region.id };
  commit();
  player.sendMessage(r.choice === 0 ? "§7You have no ballot in this election." : `§aYour ballot is cast in ${region.name}.`);
}

// ---------- running an election (admin) ----------

async function pickCandidates(player, nation, preselected) {
  const pool = eligibleCandidates(S(), nation);
  if (pool.length < 2) {
    await notice(player, "Candidates", "You need at least two named candidates. Add them under Candidates first.");
    return null;
  }
  const r = await modal(player, "Who is on the ballot?", pool.map((p) => ({ key: p.id, type: "toggle", label: candText(S(), nation, p.id), value: preselected.includes(p.id) })), "Next");
  if (!r) return null;
  const ids = pool.filter((p) => r[p.id]).map((p) => p.id);
  if (ids.length < 2) {
    await notice(player, "Candidates", "Pick at least two candidates.");
    return null;
  }
  return ids;
}

async function startElection(player, nation) {
  const state = S();
  const gov = effectiveGov(nation);
  if (!nation.regions.length) return notice(player, "Election", "Add some counties first - voters live in counties.");
  const ids = await pickCandidates(player, nation, eligibleCandidates(state, nation).map((p) => p.id));
  if (!ids) return;
  const methods = gov.selection === "council" ? [] : gov.methods;
  const fields = [
    { key: "title", type: "text", label: "Election name", value: `${gov.leaderTitle} Election ${nation.electionCount + 1}` },
    { key: "minutes", type: "slider", label: "How long voting stays open, in minutes (0 = until you close it). When it closes, election night starts automatically.", min: 0, max: 180, step: 5, value: 30 },
  ];
  if (methods.length > 1) fields.push({ key: "method", type: "dropdown", label: "How votes are counted", options: methods.map((m) => `${METHODS[m].name} - ${METHODS[m].desc}`), value: Math.max(0, methods.indexOf(gov.method)) });
  if (gov.integrity < 0.999) {
    const def = ids.indexOf(nation.leaderId);
    fields.push({ key: "endorsed", type: "dropdown", label: "The state's endorsed candidate (the count is tilted toward them)", options: ids.map((id) => displayName(getPerson(state, id))), value: def >= 0 ? def : 0 });
  }
  const r = await modal(player, "Start an Election", fields, "Open Voting");
  if (!r) return;
  const e = openElection(state, nation, gov, {
    candidates: ids,
    method: methods.length > 1 ? methods[r.method] : gov.method,
    title: r.title.trim() || "Election",
    endorsedId: r.endorsed !== undefined ? ids[r.endorsed] : null,
  });
  e.closesAt = r.minutes > 0 ? Date.now() + r.minutes * 60000 : null;
  e.reminders = [];
  commit();
  const names = ids.map((id) => displayName(getPerson(state, id))).join(", ");
  announce(`${nation.color}§l${nation.name}§r §a- ${e.title} is open!§r Candidates: ${names}.`);
  announce(e.kind === "popular"
    ? `§7Vote at any Board Table.${e.closesAt ? ` Polls close in ${r.minutes} minutes.` : ""}`
    : `§7The council will vote when the polls close.`);
}

export async function closePolls(player, nation) {
  if (!nation.election || nation.count) return;
  const gov = effectiveGov(nation);
  const r = await modal(player, "Close the Polls", [
    { key: "min", type: "slider", label: `Close voting for §e${nation.election.title}§r and start election night.\n\nHow long should the night last? (minutes)`, min: 1, max: 60, value: gov.nightMinutes },
  ], "Close Polls");
  if (!r || !nation.election || nation.count) return;
  const lines = beginCount(S(), nation, hashSeed(nation.id, nation.election.id, Date.now(), Math.random()), Date.now(), r.min);
  commit();
  lines.forEach(announce);
}

export function liveResults(player, nation) {
  return loop(player, () => {
    const state = S();
    const view = liveView(state, nation);
    if (!view) return null;
    const count = nation.count;
    const result = count.result;
    const gov = effectiveGov(nation);
    const lines = [`§l${result.title}§r §7- ${Math.ceil(view.leftMs / 60000)} min of the night left`, ""];
    for (const row of view.rows) lines.push(`${row.color}${row.name}§r  §f${row.score}${row.unit === "%" ? "%" : ` ${row.unit.toLowerCase()}`}`);
    if (view.countedFrac !== null) lines.push(`§7${bar(view.countedFrac, 24, "§b")} ${pct(view.countedFrac, 0)} ${gov.words.report}`);
    if (view.regions) {
      lines.push("", `§6${gov.words.counties[0].toUpperCase()}${gov.words.counties.slice(1)}`);
      for (const r of view.regions) {
        const c = r.lead >= 0 ? result.candidates[r.lead] : null;
        const status = r.recount ? "§cRECOUNT" : r.called !== null ? `${result.candidates[r.called].color}CALLED ${result.candidates[r.called].name}` : r.frac === 0 ? "§8no returns yet" : `${c.color}${c.name} +${pct(r.margin, 1)}`;
        lines.push(` §f${r.name}§r ${bar(r.frac, 10, "§b")} §7${pct(r.frac, 0)}§r ${status}`);
      }
    }
    lines.push("", "§6Latest", ...count.log.slice(-8).map((l) => ` ${l.replace(/^.*?\]§r /, "")}`));
    return { title: "Live Results", body: lines.join("\n"), options: [{ text: "§bRefresh", run: () => {} }] };
  });
}

export function electionControl(player, nation) {
  return loop(player, () => {
    const state = S();
    const e = nation.election;
    const gov = effectiveGov(nation);
    const lines = [];
    if (nation.count) {
      const c = nation.count;
      lines.push(`§6Election night: ${c.result.title}§r`, `§7${Math.ceil(Math.max(0, c.durationMs - (Date.now() - c.startedAt)) / 60000)} minutes left. Results are coming in live in chat.`);
    } else if (e) {
      lines.push(`§a${e.title}§r is open §7(${e.kind === "council" ? "council vote" : METHODS[e.method]?.name})`);
      lines.push(`§7${e.closesAt ? `Polls close automatically: ${timeLeft(e.closesAt - Date.now())}` : "Polls stay open until you close them."}`);
      lines.push("", ...e.candidates.map((id) => ` • ${candText(state, nation, id)}`), "", `§7Player ballots: §f${Object.keys(e.ballots).length}`);
    } else {
      lines.push("§7No election right now.", "", `§7Style: §f${gov.name}§7. Start an election, let players vote, then close the polls to count it live.`);
    }
    return {
      title: "Run an Election",
      body: lines.join("\n"),
      options: [
        !e && { text: "§2Start an Election", icon: "textures/items/paper", run: () => startElection(player, nation) },
        e && !nation.count && { text: "Run a Poll", icon: "textures/items/compass_item", run: () => pollMenu(player, nation) },
        e && !nation.count && { text: "§2Close the Polls - Start Election Night", icon: "textures/items/book_written", run: () => closePolls(player, nation) },
        e && !nation.count && {
          text: "Edit Candidates",
          run: async () => {
            const ids = await pickCandidates(player, nation, e.candidates);
            if (!ids || !nation.election) return;
            e.candidates = ids;
            for (const [p, b] of Object.entries(e.ballots)) if (!ids.includes(b.candidateId)) delete e.ballots[p];
            commit();
          },
        },
        e && !nation.count && {
          text: "Change Closing Time",
          run: async () => {
            const r = await modal(player, "Closing Time", [{ key: "m", type: "slider", label: "Close the polls in how many minutes from now? (0 = only when you close them)", min: 0, max: 180, step: 5, value: 30 }]);
            if (!r || !nation.election) return;
            e.closesAt = r.m > 0 ? Date.now() + r.m * 60000 : null;
            e.reminders = [];
            commit();
          },
        },
        nation.count && { text: "§bLive Results", icon: "textures/items/compass_item", run: () => liveResults(player, nation) },
        nation.count && {
          text: "Skip to the Final Result",
          run: () => {
            if (!nation.count) return;
            const res = finishCount(S(), nation);
            commit();
            res.lines.forEach(announce);
          },
        },
        e && !nation.count && {
          text: "§cCancel Election",
          run: async () => {
            if (await confirm(player, "Cancel", "Cancel this election and throw away the ballots?", "§cCancel it")) {
              nation.election = null;
              commit();
              announce(`${nation.color}${nation.name}§r: the election was cancelled.`);
            }
          },
        },
      ],
    };
  });
}
