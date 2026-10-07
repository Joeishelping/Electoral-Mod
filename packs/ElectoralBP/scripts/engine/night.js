// ELECTION NIGHT
//
// When polls close the full result is computed, then turned into a timeline that
// plays out in real time (default 20 minutes). The timeline lives in world state,
// so a server restart just resumes the night.
//
//   count     (Democracy, Guild)  counties report partial batches; early batches
//             can lean differently from the final count, so leads flip. Counties
//             are called when safe, close ones go to recount, the race is projected.
//   seats     (Parliament)  constituencies fill seats as they finish, then live
//             coalition talks.
//   bulletin  (Single-Party) official bulletins arrive fast with near-total turnout;
//             crowds may gather where the count was cooked; the Party may intervene.
//   council   (Royal, Clan, Conclave, Junta) electors declare one by one, ballot
//             after ballot, with bribes, walkouts, smoke signals and coups.

import { createRng } from "../core/random.js";
import { effectiveGov } from "../data/governments.js";
import { ISSUE_BY_ID, ISSUE_IDS } from "../data/issues.js";
import { computeElection } from "./election.js";
import { applyResult } from "./apply.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const argmax = (a) => a.indexOf(Math.max(...a));

// ---------- building the timeline ----------

function regionFinal(result, r) {
  return result.official ? result.official.regions[r.id] || r.votes : r.votes;
}

// Splits a county's final votes into batches. Each candidate gets a "skew": positive
// means their votes are counted early (they lead early and fade), negative late.
function splitBatches(rng, final, k) {
  const n = final.length;
  const skew = final.map(() => rng.normal(0, 0.35));
  const base = Array.from({ length: k }, () => rng.range(0.6, 1.4));
  const out = Array.from({ length: k }, () => new Array(n).fill(0));
  for (let c = 0; c < n; c++) {
    const w = base.map((b, i) => b * Math.max(0.15, 1 + skew[c] * (1 - (2 * i) / Math.max(1, k - 1))));
    const tot = sum(w);
    let left = final[c];
    for (let i = 0; i < k; i++) {
      const v = i === k - 1 ? left : Math.round((final[c] * w[i]) / tot);
      out[i][c] = Math.max(0, Math.min(v, left));
      left -= out[i][c];
    }
  }
  return out;
}

function popularTimeline(result, gov, rng, D) {
  const tl = [];
  const bulletin = gov.night === "bulletin";
  for (const r of result.regions) {
    if (!(r.cast > 0)) continue;
    const final = regionFinal(result, r);
    const k = bulletin ? 2 : Math.max(4, Math.min(9, Math.round(3 + Math.sqrt(r.eligible / 1200))));
    const start = bulletin ? D * rng.range(0.03, 0.12) : D * rng.range(0.04, 0.3);
    const end = bulletin ? start + D * rng.range(0.08, 0.25) : Math.min(D * 0.88, start + D * rng.range(0.35, 0.6));
    const batches = splitBatches(rng, final, k);
    batches.forEach((votes, i) => {
      const at = start + ((end - start) * (i + rng.range(-0.25, 0.25) * (i > 0 && i < k - 1 ? 1 : 0))) / Math.max(1, k - 1);
      tl.push({ at, t: "batch", r: r.id, votes, last: i === k - 1 });
    });
    const s = final.slice().sort((a, b) => b - a);
    if (!bulletin && sum(final) && (s[0] - (s[1] || 0)) / sum(final) < 0.01) tl.push({ at: end + D * 0.05, t: "recount", r: r.id });
  }
  (result.dayEvents || []).forEach((e, i) => tl.push({ at: D * (0.02 + 0.05 * i), t: "news", text: e.text }));
  if (bulletin) {
    const media = rng.shuffle([
      "State radio hails \"a historic mandate from a united people.\"",
      "The Election Commission reports turnout above 99% in several districts.",
      "Foreign observers are politely refused entry to counting halls.",
      "Rumors spread of ballot boxes arriving already full. The Commission denies everything.",
      "Party officials are seen celebrating before the count is finished.",
      "A state newspaper prints the final results... a little early.",
    ]);
    media.slice(0, 4).forEach((text, i) => tl.push({ at: D * (0.15 + 0.17 * i), t: "news", text }));
    for (const r of result.regions) if ((r.unrestDelta || 0) >= 8) tl.push({ at: D * rng.range(0.35, 0.8), t: "protest", r: r.id });
    if (result.integrityNote && result.integrityNote.includes("forced")) tl.push({ at: D * 0.9, t: "crisis" });
  }
  for (let q = 1; q <= 9; q++) tl.push({ at: (D * q) / 10, t: "summary" });
  if (!bulletin) {
    // exit polls: how the biggest groups say they voted
    const blocs = (result.blocs || []).filter((b) => b.id !== "players").sort((a, b) => sum(b.votes) - sum(a.votes)).slice(0, 4);
    blocs.forEach((b, i) => {
      const w = argmax(b.votes);
      const share = b.votes[w] / (sum(b.votes) || 1);
      const c = result.candidates[w];
      const mood = share > 0.6 ? "breaking hard for" : share > 0.45 ? "leaning toward" : "split, slightly favoring";
      tl.push({ at: D * (0.01 + 0.035 * (i + 1)), t: "news", text: `Exit poll: ${b.name} are ${mood} ${c.color}${c.name}§r (${Math.round(share * 100)}%).` });
    });
    tl.push({ at: D * 0.94, t: "news", text: "Officials begin certifying the final count..." });
  }
  const roundsAfter = result.rounds.slice(1);
  roundsAfter.forEach((_, i) => tl.push({ at: D * (0.9 + 0.025 * (i + 1)), t: "round", i: i + 1 }));
  if (result.coalition) talks(result, tl, D);
  tl.push({ at: D, t: "final" });
  return tl;
}

function platformOf(result, key, persons) {
  const cs = result.candidates.filter((c) => (c.partyId || `ind:${c.id}`) === key).map((c) => persons[c.id]).filter(Boolean);
  const out = {};
  for (const id of ISSUE_IDS) out[id] = cs.length ? sum(cs.map((p) => p.positions[id])) / cs.length : 0;
  return out;
}

function talks(result, tl, D) {
  const co = result.coalition;
  const t0 = D * 0.9;
  const seats = (result.partySeats || []).filter((p) => p.seats > 0).sort((a, b) => b.seats - a.seats);
  const nameOf = (key) => co.parties.find((p) => p.key === key)?.name || result.candidates.find((c) => (c.partyId || `ind:${c.id}`) === key)?.partyName || result.candidates.find((c) => `ind:${c.id}` === key)?.name || "?";
  const lead = co.parties.find((p) => p.key === co.formateur) || co.parties[0];
  if (co.parties.length === 1 && !co.minority) {
    tl.push({ at: t0 + D * 0.02, t: "talk", text: `§a${lead.name} has won an outright majority - no coalition needed.` });
    return;
  }
  const lines = [`§eNo party has a majority. ${lead.name} opens coalition talks.`];
  const outsiders = seats.filter((p) => !co.parties.some((c) => c.key === p.key) && p.key !== co.formateur);
  for (const p of outsiders.slice(0, 2)) lines.push(`§7Talks between ${lead.name} and ${nameOf(p.key)} collapse${p.issue ? ` over ${p.issue}` : ""}.`);
  for (const p of co.parties) if (p.key !== lead.key) lines.push(`§a${p.name} agrees to join a government with ${lead.name}.`);
  if (co.minority) lines.push(`§6No majority deal is possible - ${lead.name} will try to govern as a minority.`);
  lines.forEach((text, i) => tl.push({ at: t0 + (D * 0.08 * (i + 1)) / (lines.length + 1), t: "talk", text }));
}

function councilTimeline(result, gov, D, rng) {
  const cfg = gov.council || {};
  const units = [];
  const flavor = rng.shuffle(cfg.flavor || []);
  let fi = 0;
  result.votesByRound.forEach((votes, r) => {
    units.push({ w: 2, ev: { t: "ballot", r } });
    if (cfg.secret) {
      units.push({ w: 3, ev: { t: "ritual", r, step: 0 } });
      units.push({ w: 3, ev: { t: "ritual", r, step: 1 } });
    } else {
      votes.forEach((v, k) => v >= 0 && units.push({ w: 1, ev: { t: "declare", r, k } }));
    }
    units.push({ w: 2, ev: { t: "tally", r } });
    for (const it of result.intrigue.filter((x) => x.after === r)) units.push({ w: 1.5, ev: { t: "news", text: it.text } });
    if (r < result.votesByRound.length - 1) {
      // deliberation between ballots
      const round = result.rounds[r];
      const ranked = round.votes.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).map(([, i]) => result.candidates[i].name);
      for (let j = 0; j < 2 && flavor.length; j++) {
        const text = flavor[fi++ % flavor.length].replace("{a}", ranked[0]).replace("{b}", ranked[1] || ranked[0]);
        units.push({ w: 2, ev: { t: "news", text: `§7${text}` } });
      }
    }
  });
  if (result.coup) units.push({ w: 4, ev: { t: "coup" } });
  const total = sum(units.map((u) => u.w)) + 2;
  let acc = 1;
  const tl = units.map((u) => {
    acc += u.w;
    return { ...u.ev, at: (D * acc) / total };
  });
  tl.push({ at: D, t: "final" });
  return tl;
}

/** Closes the polls and starts the night. Returns opening lines. */
export function beginCount(state, nation, seed, now, minutes = null) {
  const election = nation.election;
  const gov = effectiveGov(nation);
  const result = computeElection(state, nation, election, seed);
  const rng = createRng(seed ^ 0x7a11);
  const D = Math.max(1, minutes ?? gov.nightMinutes) * 60000;
  // remember why each party fell out of talks
  if (result.partySeats) {
    for (const p of result.partySeats) {
      const lead = result.coalition.formateur;
      if (p.key === lead) continue;
      const a = platformOf(result, lead, state.persons);
      const b = platformOf(result, p.key, state.persons);
      const worst = ISSUE_IDS.slice().sort((x, y) => Math.abs(b[y] - a[y]) - Math.abs(b[x] - a[x]))[0];
      p.issue = ISSUE_BY_ID[worst].name.toLowerCase();
    }
  }
  const tl = (gov.night === "council" ? councilTimeline(result, gov, D, rng) : popularTimeline(result, gov, rng, D)).sort((a, b) => a.at - b.at);
  election.status = "counting";
  const n = result.candidates.length;
  nation.count = {
    result,
    night: gov.night,
    startedAt: now,
    durationMs: D,
    timeline: tl,
    idx: 0,
    live: {
      votes: {}, // regionId -> votes counted so far
      leader: {}, // regionId -> current leader
      called: {}, // regionId -> called winner
      firstSeen: {},
      recount: {},
      alloc: new Array(n).fill(0),
      national: new Array(n).fill(0),
      raceCalled: null,
      round: -1,
      roundVotes: new Array(n).fill(0),
    },
    log: [],
  };
  const lines = [];
  const tag = `${nation.color}§l${nation.name}§r`;
  if (gov.night === "bulletin") lines.push(`${tag} §6- The polls have closed. The Election Commission will now issue official bulletins.`);
  else if (gov.night === "council") lines.push(`${tag} §6- The ${gov.name} convenes to choose the next ${gov.leaderTitle}. ${result.electors.length} electors take their seats.`);
  else lines.push(`${tag} §6- Polls are closed for §e${result.title}§6! Results will come in over the next ${Math.round(D / 60000)} minutes.`);
  return lines;
}

// ---------- playing the timeline ----------

function name(result, i) {
  const c = result.candidates[i];
  return c ? `${c.color}${c.name}§r` : "§7nobody§r";
}

function shareLine(result, votes, alloc = null, label = "") {
  const total = sum(votes) || 1;
  return votes
    .map((v, i) => [v, i])
    .sort((a, b) => b[0] - a[0])
    .filter(([v], j) => v > 0 || j < 2)
    .map(([v, i]) => `${name(result, i)} ${pct(v / total)}${alloc ? ` §7(${alloc[i]})§r` : ""}`)
    .join(" §8|§r ") + (label ? ` §7${label}` : "");
}

function countedFrac(count) {
  const result = count.result;
  const total = sum(result.regions.map((r) => sum(regionFinal(result, r)))) || 1;
  return sum(count.live.national) / total;
}

function callCounty(count, r, idx, lines, tag, gov) {
  const live = count.live;
  if (live.called[r.id] !== undefined) return;
  live.called[r.id] = idx;
  const result = count.result;
  const a = r.alloc || null;
  if (a) a.forEach((v, i) => (live.alloc[i] += v));
  const label = result.allocLabel ? ` §7(+${a ? a[idx] : 0} ${result.allocLabel.toLowerCase()})` : "";
  if (gov.night === "seats") {
    const seats = a ? a.map((v, i) => [v, i]).filter(([v]) => v > 0).map(([v, i]) => `${result.candidates[i].partyName || result.candidates[i].name} ${v}`).join(", ") : "";
    lines.push(`${tag} §e${r.name}§r declared: ${seats || "no seats"}`);
  } else if (gov.night === "bulletin") {
    lines.push(`${tag} §cThe Commission confirms ${name(result, idx)} §cin ${r.name}.`);
  } else {
    lines.push(`${tag} §e§lCALL:§r ${name(result, idx)} wins §e${r.name}§r${label}`);
  }
}

function checkRaceCall(count, lines, tag, gov, out) {
  const live = count.live;
  const result = count.result;
  if (live.raceCalled !== null) return;
  let projected = null;
  if (result.method === "electoral" && result.totalAlloc) {
    const i = argmax(live.alloc);
    if (live.alloc[i] * 2 > result.totalAlloc) projected = i;
  } else if (result.method === "plurality") {
    const f = countedFrac(count);
    const nat = live.national;
    const order = nat.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const remaining = sum(result.regions.map((r) => sum(regionFinal(result, r)))) - sum(nat);
    if (f >= (gov.night === "bulletin" ? 0.3 : 0.55) && order.length > 1 && order[0][0] - order[1][0] > remaining * 0.45) projected = order[0][1];
  }
  if (projected !== null && projected === result.winnerIdx) {
    live.raceCalled = projected;
    const c = result.candidates[projected];
    if (gov.night === "bulletin") lines.push(`${tag} §c§lTHE PARTY ANNOUNCES VICTORY:§r ${name(result, projected)} §cwill continue to lead the nation.`);
    else lines.push(`${tag} §e§l>>> RACE CALL:§r ${name(result, projected)} §eis projected to win the ${result.title}! §7(${result.allocLabel ? `${live.alloc[projected]} of ${result.totalAlloc} ${result.allocLabel.toLowerCase()}` : `${pct(countedFrac(count), 0)} counted`})`);
    out.call = { title: `${c.color}${c.name}`, subtitle: "§eprojected winner" };
  }
}

function runEvent(state, nation, ev, out) {
  const count = nation.count;
  const result = count.result;
  const gov = effectiveGov(nation);
  const live = count.live;
  const tag = `${nation.color}[${nation.name}]§r`;
  const lines = out.lines;
  const words = gov.words;
  switch (ev.t) {
    case "news":
      lines.push(gov.night === "council" ? `${tag} ${ev.text}` : `${tag} §d[News]§r ${ev.text}`);
      break;
    case "batch": {
      const r = result.regions.find((x) => x.id === ev.r);
      const final = regionFinal(result, r);
      const cur = (live.votes[r.id] = (live.votes[r.id] || new Array(final.length).fill(0)).map((v, i) => v + ev.votes[i]));
      ev.votes.forEach((v, i) => (live.national[i] += v));
      const frac = sum(cur) / (sum(final) || 1);
      const lead = argmax(cur);
      const before = live.leader[r.id];
      live.leader[r.id] = lead;
      const head = gov.night === "bulletin" ? `${tag} §cBulletin from ${r.name}` : `${tag} §b${r.name}§r`;
      if (!live.firstSeen[r.id]) {
        live.firstSeen[r.id] = true;
        lines.push(`${head} - first returns (${pct(frac, 0)} ${words.report}): ${shareLine(result, cur)}`);
      } else if (before !== undefined && before !== lead && frac < 1) {
        lines.push(`${tag} §6LEAD CHANGE in ${r.name}!§r ${name(result, lead)} pulls ahead of ${name(result, before)} (${pct(frac, 0)} ${words.report})`);
      } else if (ev.last) {
        lines.push(`${head} - all ${words.unit} ${words.report}: ${shareLine(result, cur)}`);
      } else if (frac >= 0.5 && !live.half?.[r.id]) {
        live.half = live.half || {};
        live.half[r.id] = true;
        lines.push(`${head} - ${pct(frac, 0)} ${words.report}: ${shareLine(result, cur)}`);
      }
      // county calls: safe leads are called early; close counties go to recount
      const hasRecount = count.timeline.some((e) => e.t === "recount" && e.r === r.id);
      const remaining = sum(final) - sum(cur);
      const sorted = cur.slice().sort((x, y) => y - x);
      const safe = frac >= 0.3 && sorted[0] - (sorted[1] || 0) > remaining * 0.6;
      if (ev.last && hasRecount) {
        live.recount[r.id] = true;
        lines.push(`${tag} §c§lTOO CLOSE TO CALL:§r ${r.name} is within one point - a recount is ordered!`);
      } else if (live.called[r.id] === undefined && lead === argmax(final) && (gov.night === "seats" ? ev.last : safe || ev.last) && !hasRecount) {
        callCounty(count, r, lead, lines, tag, gov);
      }
      checkRaceCall(count, lines, tag, gov, out);
      break;
    }
    case "recount": {
      const r = result.regions.find((x) => x.id === ev.r);
      const final = regionFinal(result, r);
      const w = argmax(final);
      const s = final.slice().sort((a, b) => b - a);
      live.recount[r.id] = false;
      lines.push(`${tag} §eRecount in ${r.name} complete:§r ${name(result, w)} holds on by just ${fmt(s[0] - (s[1] || 0))} ${words.unit}!`);
      callCounty(count, r, w, lines, tag, gov);
      checkRaceCall(count, lines, tag, gov, out);
      break;
    }
    case "summary": {
      if (!sum(live.national)) break;
      const f = countedFrac(count);
      const called = Object.keys(live.called).length;
      const alloc = result.allocLabel ? live.alloc : null;
      const key = `${sum(live.national)}:${called}`;
      if (live.lastSummary === key) break; // nothing new to report
      live.lastSummary = key;
      lines.push(`${tag} §6=== ${pct(f, 0)} ${words.report} · ${called}/${result.regions.filter((r) => r.cast > 0).length} ${words.counties} called ===`);
      lines.push(`   ${shareLine(result, live.national, alloc, alloc ? result.allocLabel.toLowerCase() : "")}`);
      break;
    }
    case "round": {
      const round = result.rounds[ev.i];
      lines.push(`${tag} §e${round.label}:§r ${shareLine(result, round.votes, round.alloc)}`);
      if (round.eliminated !== undefined && round.eliminated !== null) lines.push(`   §c${result.candidates[round.eliminated].name} is eliminated - their voters move to their next choice.`);
      if (round.note) lines.push(`   §7${round.note}`);
      break;
    }
    case "talk":
      lines.push(`${tag} §e[Talks]§r ${ev.text}`);
      break;
    case "protest": {
      const r = result.regions.find((x) => x.id === ev.r);
      lines.push(`${tag} §4Crowds gather in ${r.name}, disputing the official count. Security forces are deployed.`);
      break;
    }
    case "crisis":
      lines.push(`${tag} §4§lThe Party Central Council has convened an emergency session...`);
      break;
    case "ballot": {
      live.round = ev.r;
      live.roundVotes = new Array(result.candidates.length).fill(0);
      const r = result.rounds[ev.r];
      const flavor = { theocracy: "The doors are sealed. The electors bow their heads and write.", monarchy: "The great houses gather in the throne hall.", clan: "The clan banners are raised around the fire.", junta: "The garrison commanders take their seats at the war table." }[gov.id] || "The council votes.";
      lines.push(`${tag} §6§l${r.label}§r §7- ${flavor}`);
      break;
    }
    case "ritual":
      lines.push(`${tag} §7${ev.step === 0 ? "One by one, the electors place their folded ballots in the urn..." : "The ballots are read aloud in silence..."}`);
      if (ev.step === 1) {
        // secret ballots: reveal tallies at once
        live.roundVotes = result.rounds[ev.r].votes.slice();
      }
      break;
    case "declare": {
      const e = result.electors[ev.k];
      const v = result.votesByRound[ev.r][ev.k];
      live.roundVotes[v] += Math.round((e.weight / sum(result.electors.map((x) => x.weight))) * 1000);
      lines.push(`${tag} §f${e.name}§r ${gov.council?.verb || "votes for"} ${name(result, v)}`);
      break;
    }
    case "tally": {
      const r = result.rounds[ev.r];
      live.roundVotes = r.votes.slice();
      const done = ev.r === result.rounds.length - 1 && !result.deadlock;
      lines.push(`${tag} §e${r.label} result:§r ${shareLine(result, r.votes)}`);
      if (r.eliminated !== undefined && r.eliminated !== null) lines.push(`   §c${result.candidates[r.eliminated].name} is out.`);
      if (r.note && r.note.startsWith("A nominating")) lines.push(`   §7${r.note}`);
      if (gov.id === "theocracy") lines.push(done ? "   §f§lBRIGHT FIRE rises from the sanctuary! A High Prophet has been chosen!" : "   §8Dark smoke rises from the sanctuary... no Prophet yet.");
      else if (!done) lines.push(`   §7${{ monarchy: "The houses remain divided.", clan: "The clans cannot agree. The horns sound for another round.", junta: "The officers are split. Another vote is called." }[gov.id] || "No decision."}`);
      break;
    }
    case "coup": {
      const c = result.coup;
      lines.push(`${tag} §4§lCOUP ATTEMPT!§r ${name(result, c.by)}'s loyal units move on the capital!`);
      lines.push(c.success ? `   §4The coup succeeds. ${result.candidates[c.by].name} seizes command of the nation.` : `   §aThe garrisons stay loyal - the coup collapses.`);
      break;
    }
    case "final": {
      const w = result.winnerIdx;
      const nat = result.official ? result.official.national : result.national;
      lines.push(`${tag} §a§l======== RESULT ========`);
      if (result.kind === "popular") {
        lines.push(`   ${shareLine(result, nat, result.alloc, result.allocLabel ? result.allocLabel.toLowerCase() : "")}`);
        lines.push(`   §7Turnout ${pct(result.official ? result.official.turnout : result.turnout)} · ${fmt(sum(nat))} ${words.unit}`);
      }
      if (result.integrityNote && result.integrityNote.includes("forced")) lines.push(`   §4The Party Council has replaced its candidate - ${name(result, w)} takes power.`);
      lines.push(`${tag} §a§l${result.candidates[w].name} §r§awill be the next ${gov.leaderTitle} of ${nation.name}!`);
      const order = nat.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
      const runner = order.find(([, i]) => i !== w);
      if (result.kind === "popular" && runner && gov.night !== "bulletin") {
        const margin = (nat[w] - runner[0]) / (sum(nat) || 1);
        lines.push(margin < 0.03 ? `   §7${result.candidates[runner[1]].name} calls it "a hard-fought race" and congratulates the winner.` : `   §7${result.candidates[runner[1]].name} concedes.`);
      }
      applyResult(state, nation, result);
      nation.count = null;
      nation.election = null;
      const c = result.candidates[w];
      out.headline = { title: `${c.color}${c.name}`, subtitle: `§7${gov.leaderTitle} of ${nation.name}` };
      out.done = true;
      break;
    }
  }
}

/**
 * Plays every timeline event that is due. Returns { lines, done, call, headline }.
 * call = a race projection to flash on screen; headline = the final winner.
 */
export function tickNight(state, nation, now, force = false) {
  const out = { lines: [], done: false, call: null, headline: null };
  const count = nation.count;
  if (!count) return out;
  const elapsed = now - count.startedAt;
  while (nation.count && count.idx < count.timeline.length && (force || count.timeline[count.idx].at <= elapsed)) {
    runEvent(state, nation, count.timeline[count.idx++], out);
  }
  if (nation.count) {
    count.log.push(...out.lines);
    if (count.log.length > 14) count.log.splice(0, count.log.length - 14);
  }
  return out;
}

/** Plays the rest of the night instantly; returns only the final lines. */
export function finishCount(state, nation) {
  const res = tickNight(state, nation, Infinity, true);
  const start = res.lines.findIndex((l) => l.includes("======== RESULT"));
  return { ...res, lines: start >= 0 ? res.lines.slice(start) : res.lines };
}

// ---------- live view (sidebar, action bar, Board Table) ----------

export function liveView(state, nation) {
  const count = nation.count;
  if (!count) return null;
  const result = count.result;
  const live = count.live;
  const gov = effectiveGov(nation);
  const n = result.candidates.length;
  const short = (i) => result.candidates[i].name.split(" ")[0] || "?";
  const elapsed = Math.max(0, Date.now() - count.startedAt);
  const left = Math.max(0, count.durationMs - elapsed);
  if (count.night === "council") {
    const votes = live.roundVotes;
    const total = sum(votes) || 1;
    return {
      title: `${nation.name}: ${result.rounds[live.round]?.label || "Council"}`,
      rows: result.candidates.map((c, i) => ({ name: c.name || "?", color: c.color, score: Math.round((votes[i] / total) * 100), unit: "%" })).sort((a, b) => b.score - a.score),
      bar: result.candidates.map((c, i) => `${c.color}${short(i)} ${Math.round((votes[i] / total) * 100)}%`).join(" §8| ") + ` §7· ${live.round >= 0 ? result.rounds[live.round].label : "convening"}`,
      leftMs: left,
      countedFrac: null,
    };
  }
  const f = countedFrac(count);
  const total = sum(live.national) || 1;
  const useAlloc = !!result.allocLabel;
  return {
    title: `${nation.name} Live`,
    rows: result.candidates.map((c, i) => ({ name: c.name || "?", color: c.color, score: useAlloc ? live.alloc[i] : Math.round((live.national[i] / total) * 100), unit: useAlloc ? result.allocLabel : "%" })).sort((a, b) => b.score - a.score),
    bar: result.candidates.map((c, i) => [c, i]).sort((a, b) => live.national[b[1]] - live.national[a[1]]).map(([c, i]) => `${c.color}${short(i)} ${pct(live.national[i] / total)}${useAlloc ? ` §7(${live.alloc[i]})` : ""}`).join(" §8| ") + ` §7· ${pct(f, 0)} ${gov.words.report}`,
    leftMs: left,
    countedFrac: f,
    regions: result.regions.filter((r) => r.cast > 0).map((r) => {
      const cur = live.votes[r.id] || new Array(n).fill(0);
      const fr = sum(cur) / (sum(regionFinal(result, r)) || 1);
      const lead = sum(cur) ? argmax(cur) : -1;
      const called = live.called[r.id];
      return { name: r.name, frac: fr, lead, called: called ?? null, recount: !!live.recount[r.id], margin: sum(cur) ? (cur.slice().sort((a, b) => b - a)[0] - (cur.slice().sort((a, b) => b - a)[1] || 0)) / sum(cur) : 0 };
    }),
  };
}

