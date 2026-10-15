// The campaign: debates and the campaign trail. Everything here feeds the same
// vote model as election day - a candidate's overall swing, swings with single
// interest groups, and how much voters care about each issue - so polls move as
// the campaign goes.
//
// Debates have rounds, one per topic. In each round every candidate makes a move:
// make the case, attack a rival on the topic or their character or record, pivot
// to a better issue, stay above the fray, go for a knockout, or rebut. How well a
// move lands depends on charisma, competence, traits and luck. Rounds can be
// chosen by players, left to the AI, or skipped entirely by submitting how each
// candidate performed (for debates acted out live on the server).

import { BLOCS } from "../data/blocs.js";
import { ISSUES, ISSUE_BY_ID } from "../data/issues.js";
import { TRAIT_BY_ID } from "../data/traits.js";
import { clamp } from "../core/random.js";
import { termRecord } from "./situations.js";

export const SPECIAL_TOPICS = [
  { id: "character", name: "Character & Honesty" },
  { id: "record", name: "The Record in Office" },
];
export const TOPICS = [...ISSUES.map((i) => ({ id: i.id, name: i.name })), ...SPECIAL_TOPICS];
export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

export const MOVES = [
  { id: "case", name: "Make the case", desc: "Argue our side of the topic. Wins over groups who agree.", target: false },
  { id: "attack", name: "Attack their position", desc: "Go after a rival's stance on this topic.", target: true },
  { id: "character", name: "Attack their character", desc: "Scandals, vices, honesty. Lands hard if there's dirt - backfires if not.", target: true },
  { id: "record", name: "Hammer their record", desc: "Botched crises in office. Only works on whoever holds office.", target: true },
  { id: "pivot", name: "Pivot to a better issue", desc: "Change the subject to a strength.", target: false, issue: true },
  { id: "presidential", name: "Stay above the fray", desc: "Calm and statesmanlike. Safe, small gain.", target: false },
  { id: "knockout", name: "Go for the knockout line", desc: "A memorable zinger. Huge if it lands, ugly if it doesn't.", target: true },
  { id: "rebut", name: "Rebut the attacks", desc: "Defend yourself - blunts attacks against you this round.", target: false },
];
export const MOVE_BY_ID = Object.fromEntries(MOVES.map((m) => [m.id, m]));

// traits that give an opponent something to attack
const WEAK_SPOTS = { corrupt: "the bribes", libertine: "the parties", gaffe: "the gaffes", heir: "never working a day", elitist: "being out of touch", demagogue: "stoking hatred", career: "a lifetime in office" };

export const MAX_TRAIL = 4; // campaign trail actions per candidate per election

export const TRAIL = [
  { id: "rally", name: "Hold a Rally", desc: "Boost support in one county.", region: true, funds: -10 },
  { id: "ad_positive", name: "Run a Positive Ad", desc: "Promote our stance on an issue.", issue: true, funds: -15 },
  { id: "ad_attack", name: "Run an Attack Ad", desc: "Hit a rival on an issue. A little dirty.", issue: true, target: true, funds: -15 },
  { id: "court", name: "Court an Interest Group", desc: "Win a group over - its rivals notice.", bloc: true, funds: -8 },
  { id: "fundraiser", name: "Hold a Fundraiser", desc: "Refill the war chest. Donors expect favours.", funds: 20 },
];
export const TRAIL_BY_ID = Object.fromEntries(TRAIL.map((t) => [t.id, t]));

// ---------- campaign state ----------

export function ensureCampaign(election) {
  election.campaign = election.campaign || { debates: [], trail: {}, effects: { nat: {}, bloc: {}, region: {}, salience: {} }, log: [] };
  return election.campaign;
}

function addFx(target, fx) {
  for (const k of ["nat", "bloc", "region"]) for (const [key, v] of Object.entries(fx[k] || {})) target[k][key] = clamp((target[k][key] || 0) + v, -1, 1);
  for (const [issue, m] of Object.entries(fx.salience || {})) target.salience[issue] = clamp((target.salience[issue] || 1) * m, 0.5, 2.5);
}

const blankFx = () => ({ nat: {}, bloc: {}, region: {}, salience: {}, person: {} });
const bump = (o, k, v) => (o[k] = (o[k] || 0) + v);

/** Day-of-election modifiers from the whole campaign (merged into the vote model). */
export function campaignMods(election) {
  const c = election?.campaign;
  return c ? c.effects : null;
}

// ---------- how well a move lands ----------

const traitsOf = (p) => p.traits || [];
const has = (p, t) => traitsOf(p).includes(t);

function skill(p) {
  let s = ((p.charisma ?? 50) * 0.55 + (p.competence ?? 50) * 0.45 - 50) / 50; // -1..1
  for (const t of traitsOf(p)) s += { silver: 0.45, charismatic: 0.25, intellectual: 0.1, gaffe: -0.25, elder: 0.05, young: 0.05 }[t] || 0;
  return s;
}

/** Interest-group agreement with a position on an issue, 0..1. */
const agree = (bloc, issue, pos) => 1 - Math.abs((bloc.ideal[issue] ?? 0) - pos) / 200;

function weakSpot(state, nation, p) {
  const t = traitsOf(p).find((x) => WEAK_SPOTS[x]);
  if (t) return WEAK_SPOTS[t];
  if ((p.integrity ?? 50) < 40) return "their honesty";
  return null;
}

function badRecord(nation, p) {
  if (p.id !== nation.leaderId) return null;
  const rank = { A: 0, B: 1, C: 2, D: 3, F: 4 };
  return termRecord(nation).filter((r) => rank[r.grade] >= 3).sort((a, b) => rank[b.grade] - rank[a.grade])[0] || null;
}

/** The AI's pick of move for a candidate, given the topic and who they're up against. */
export function autoMove(state, nation, me, others, topic, rng) {
  const options = [];
  const lead = (me.popularity ?? 50) - Math.max(...others.map((o) => o.popularity ?? 50));
  const target = others.slice().sort((a, b) => (b.popularity ?? 50) - (a.popularity ?? 50))[0];
  options.push([{ move: "case" }, ISSUE_BY_ID[topic] ? 3 : 0.5]);
  options.push([{ move: "presidential" }, lead > 10 ? 3 : 1]);
  options.push([{ move: "attack", target: target.id }, ISSUE_BY_ID[topic] && Math.abs((me.positions[topic] ?? 0) - (target.positions[topic] ?? 0)) > 40 ? 3 : 0.5]);
  const dirt = others.find((o) => weakSpot(state, nation, o));
  if (dirt) options.push([{ move: "character", target: dirt.id }, topic === "character" ? 5 : 1.5]);
  const inc = others.find((o) => badRecord(nation, o));
  if (inc) options.push([{ move: "record", target: inc.id }, topic === "record" ? 5 : 2]);
  if (lead < -10) options.push([{ move: "knockout", target: target.id }, has(me, "silver") || has(me, "charismatic") ? 3 : 1.2]);
  const best = bestIssue(me);
  if (best && best !== topic) options.push([{ move: "pivot", issue: best }, ISSUE_BY_ID[topic] ? 0.8 : 2]);
  if (topic === "record" && me.id === nation.leaderId) options.push([{ move: "rebut" }, 4]);
  return rng.weighted(options, (o) => o[1])[0];
}

/** The issue where this candidate's stance is strongest. */
function bestIssue(p) {
  return Object.entries(p.positions || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] || null;
}

/**
 * Plays one round. moves: [{ who, move, target?, issue? }]. Returns
 * { topic, lines: [text], points: { personId: n }, fx }.
 */
export function playRound(state, nation, people, topic, moves, rng) {
  const fx = blankFx();
  const lines = [];
  const points = {};
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const rebutting = new Set(moves.filter((m) => m.move === "rebut").map((m) => m.who));
  const issueName = (id) => ISSUE_BY_ID[id]?.name || TOPIC_BY_ID[id]?.name || id;
  const side = (p, issue) => {
    const v = p.positions?.[issue] ?? 0;
    const i = ISSUE_BY_ID[issue];
    return !i || Math.abs(v) < 15 ? "the middle ground" : v > 0 ? `"${i.high}"` : `"${i.low}"`;
  };
  if (ISSUE_BY_ID[topic]) fx.salience[topic] = 1.08;
  for (const m of moves) {
    const me = byId[m.who];
    if (!me) continue;
    const foe = byId[m.target];
    let q = skill(me) * 0.6 + rng.normal(0, 0.45);
    // gaffe-prone candidates can stumble whatever they try
    if (has(me, "gaffe") && rng.chance(0.2)) {
      lines.push(`§c${me.name} stumbles over their words - the clip will be everywhere tomorrow.`);
      bump(fx.nat, me.id, -0.06);
      bump(points, me.id, -1);
      continue;
    }
    const gain = (who, amt) => bump(fx.nat, who, amt);
    const blocShift = (who, issue, pos, amt) => {
      for (const b of BLOCS) if (b.ideal[issue] !== undefined) bump(fx.bloc, `${who}:${b.id}`, amt * (agree(b, issue, pos) - 0.5) * 2);
    };
    const softened = (who, v) => (rebutting.has(who) ? v * 0.4 : v);
    switch (m.move) {
      case "case": {
        const issue = ISSUE_BY_ID[topic] ? topic : bestIssue(me);
        if (!issue) break;
        blocShift(me.id, issue, me.positions[issue] ?? 0, 0.1 * (0.6 + q));
        lines.push(q > 0.3 ? `§a${me.name} makes a powerful case for ${side(me, issue)} on ${issueName(issue)}.` : q < -0.3 ? `§7${me.name} rambles through their position on ${issueName(issue)}.` : `§f${me.name} sets out their stance on ${issueName(issue)}.`);
        bump(points, me.id, q);
        break;
      }
      case "attack": {
        if (!foe || !ISSUE_BY_ID[topic]) break;
        const issue = topic;
        if (q > -0.3) {
          // groups closer to the attacker than the target turn on the target
          for (const b of BLOCS) {
            if (b.ideal[issue] === undefined) continue;
            const edge = agree(b, issue, me.positions[issue] ?? 0) - agree(b, issue, foe.positions[issue] ?? 0);
            if (edge > 0) bump(fx.bloc, `${foe.id}:${b.id}`, softened(foe.id, -0.14 * edge * (0.7 + q)));
          }
          lines.push(`§e${me.name} goes after ${foe.name}'s ${side(foe, issue)} stance on ${issueName(issue)}${q > 0.6 ? " - and it lands hard." : "."}`);
          bump(points, me.id, q);
          bump(points, foe.id, -q * 0.6 * (rebutting.has(foe.id) ? 0.4 : 1));
        } else {
          gain(me.id, -0.04);
          lines.push(`§7${me.name}'s attack on ${foe.name} over ${issueName(issue)} falls flat.`);
          bump(points, me.id, -0.8);
        }
        break;
      }
      case "character": {
        if (!foe) break;
        const dirt = weakSpot(state, nation, foe);
        bump(fx.person, `${me.id}:integrity`, -2);
        if (dirt && q > -0.5) {
          gain(foe.id, softened(foe.id, -0.1 * (0.8 + q)));
          bump(fx.person, `${foe.id}:integrity`, -4);
          lines.push(`§c${me.name} brings up ${dirt} - ${foe.name} visibly flinches.`);
          bump(points, me.id, 0.5 + q);
          bump(points, foe.id, -(0.6 + q) * (rebutting.has(foe.id) ? 0.4 : 1));
        } else {
          gain(me.id, -0.07);
          lines.push(`§7${me.name} takes a cheap shot at ${foe.name}'s character. The audience groans.`);
          bump(points, me.id, -1.2);
        }
        break;
      }
      case "record": {
        if (!foe) break;
        const rec = badRecord(nation, foe);
        if (rec && q > -0.5) {
          gain(foe.id, softened(foe.id, -0.12 * (0.8 + q)));
          for (const r of rec.regionIds || []) bump(fx.region, `${foe.id}:${r}`, softened(foe.id, -0.2));
          lines.push(`§c${me.name} hammers ${foe.name} over the ${rec.title} in ${rec.cities} - grade ${rec.grade}.`);
          bump(points, me.id, 0.6 + q);
          bump(points, foe.id, -(0.7 + q) * (rebutting.has(foe.id) ? 0.4 : 1));
        } else {
          gain(me.id, -0.04);
          lines.push(`§7${me.name} attacks ${foe.name}'s record, but there's not much to attack.`);
          bump(points, me.id, -0.8);
        }
        break;
      }
      case "pivot": {
        const issue = m.issue || bestIssue(me);
        if (!issue || !ISSUE_BY_ID[issue]) break;
        fx.salience[issue] = (fx.salience[issue] || 1) * 1.1;
        blocShift(me.id, issue, me.positions[issue] ?? 0, 0.06 * (0.6 + q));
        lines.push(q > 0 ? `§b${me.name} smoothly changes the subject to ${issueName(issue)}.` : `§7${me.name} dodges the question and talks about ${issueName(issue)} instead. Nobody is fooled.`);
        bump(points, me.id, q * 0.6);
        break;
      }
      case "presidential": {
        const attacked = moves.some((x) => x.target === me.id && ["attack", "character", "record", "knockout"].includes(x.move));
        gain(me.id, attacked ? 0.01 : 0.03);
        lines.push(`§f${me.name} stays calm and above the fray${attacked ? ", though the attacks go unanswered" : ""}.`);
        bump(points, me.id, attacked ? -0.2 : 0.3);
        break;
      }
      case "knockout": {
        if (!foe) break;
        const k = q * 1.8 + (has(me, "silver") ? 0.4 : 0);
        if (k > 0.5) {
          gain(me.id, 0.08);
          gain(foe.id, softened(foe.id, -0.12));
          bump(fx.person, `${me.id}:popularity`, 5);
          lines.push(`§a§l${me.name} lands the line of the night on ${foe.name}.§r §7The crowd erupts.`);
          bump(points, me.id, 2);
          bump(points, foe.id, -1.2);
        } else {
          gain(me.id, -0.08);
          bump(fx.person, `${me.id}:popularity`, -4);
          lines.push(`§c${me.name}'s prepared zinger at ${foe.name} lands with a thud. Awkward silence.`);
          bump(points, me.id, -1.5);
        }
        break;
      }
      case "rebut": {
        const hit = moves.some((x) => x.target === me.id);
        lines.push(hit ? `§b${me.name} pushes back on every attack, point by point.` : `§7${me.name} rebuts attacks nobody made.`);
        bump(points, me.id, hit ? 0.5 + q * 0.5 : -0.3);
        break;
      }
    }
  }
  return { topic, lines, points, fx };
}

/** Builds a whole debate (all rounds). choose(person, topic, others) returns a move (or null for the AI). */
export function runDebate(state, nation, election, cfg, choose, rng) {
  const people = cfg.cands.map((id) => state.persons[id]).filter(Boolean);
  const debate = { id: `${election.id}:d${(ensureCampaign(election).debates.length || 0) + 1}`, title: cfg.title, cands: people.map((p) => p.id), topics: cfg.topics, rounds: [], points: {}, mode: cfg.mode };
  const total = blankFx();
  for (const topic of cfg.topics) {
    const moves = people.map((p) => {
      const others = people.filter((o) => o.id !== p.id);
      const pick = choose(p, topic, others) || autoMove(state, nation, p, others, topic, rng);
      return { who: p.id, ...pick };
    });
    const r = playRound(state, nation, people, topic, moves, rng);
    debate.rounds.push({ topic, moves, lines: r.lines });
    for (const [id, v] of Object.entries(r.points)) bump(debate.points, id, v);
    mergeFx(total, r.fx);
  }
  return finishDebate(state, nation, election, debate, total, people, rng);
}

function mergeFx(total, fx) {
  for (const k of ["nat", "bloc", "region"]) for (const [key, v] of Object.entries(fx[k])) bump(total[k], key, v);
  for (const [key, v] of Object.entries(fx.salience)) total.salience[key] = (total.salience[key] || 1) * v;
  for (const [key, v] of Object.entries(fx.person)) bump(total.person, key, v);
}

/** For debates acted out live: performance 0-10 per candidate, and who won. */
export function submitDebate(state, nation, election, cfg, scores, winnerId, rng) {
  const people = cfg.cands.map((id) => state.persons[id]).filter(Boolean);
  const debate = { id: `${election.id}:d${(ensureCampaign(election).debates.length || 0) + 1}`, title: cfg.title, cands: people.map((p) => p.id), topics: cfg.topics, rounds: [], points: {}, mode: "submitted" };
  const total = blankFx();
  for (const p of people) {
    const s = scores[p.id] ?? 5;
    debate.points[p.id] = s - 5 + (p.id === winnerId ? 2 : 0);
    bump(total.nat, p.id, (s - 5) * 0.025 + (p.id === winnerId ? 0.06 : 0));
    bump(total.person, `${p.id}:popularity`, Math.round((s - 5) * 1.5));
  }
  for (const t of cfg.topics) if (ISSUE_BY_ID[t]) total.salience[t] = 1.1;
  return finishDebate(state, nation, election, debate, total, people, rng);
}

function finishDebate(state, nation, election, debate, total, people, rng) {
  const camp = ensureCampaign(election);
  // snap poll: who won?
  const pts = people.map((p) => debate.points[p.id] || 0);
  const exp = pts.map((v) => Math.exp(v * 0.6 + rng.normal(0, 0.15)));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  debate.snap = Object.fromEntries(people.map((p, i) => [p.id, exp[i] / sum]));
  const winner = people.slice().sort((a, b) => debate.snap[b.id] - debate.snap[a.id])[0];
  debate.winner = winner?.id || null;
  // the winner gets a bump of momentum, the clear loser a dip
  if (winner) bump(total.nat, winner.id, 0.05);
  const loser = people.slice().sort((a, b) => debate.snap[a.id] - debate.snap[b.id])[0];
  if (loser && loser !== winner && debate.snap[loser.id] < 0.25) bump(total.nat, loser.id, -0.03);
  addFx(camp.effects, total);
  for (const [key, v] of Object.entries(total.person)) {
    const [id, stat] = key.split(":");
    const p = state.persons[id];
    if (p && typeof p[stat] === "number") p[stat] = clamp(p[stat] + v, 0, 100);
  }
  debate.fx = { nat: total.nat };
  camp.debates.push(debate);
  // what chat sees, round by round
  const names = (ids) => ids.map((id) => state.persons[id]?.name).filter(Boolean).join(" vs ");
  const script = [`§6§l[DEBATE] ${debate.title}§r §7- ${names(debate.cands)}`];
  if (debate.mode === "submitted") script.push(`§7Topics: ${debate.topics.map((t) => TOPIC_BY_ID[t]?.name).join(", ")}`);
  for (const r of debate.rounds) script.push(`§6Round: ${TOPIC_BY_ID[r.topic]?.name || r.topic}`, ...r.lines);
  script.push(`§6§lSnap poll - who won?§r ${people.map((p) => `${p.name} ${Math.round(debate.snap[p.id] * 100)}%`).join(" · ")}`);
  if (winner) script.push(`§a${winner.name} wins the night.`);
  debate.script = script;
  return debate;
}

// ---------- the campaign trail ----------

export function trailLeft(election, personId) {
  return MAX_TRAIL - (ensureCampaign(election).trail[personId] || 0);
}

/** A campaign trail action. Returns chat lines, or null if not allowed. */
export function trailAction(state, nation, election, person, actionId, opts, rng) {
  const a = TRAIL_BY_ID[actionId];
  const camp = ensureCampaign(election);
  if (!a || trailLeft(election, person.id) <= 0) return null;
  if (a.funds < 0 && (person.funds ?? 50) < -a.funds) return [`§c${person.name} can't afford that - the war chest is too low.`];
  camp.trail[person.id] = (camp.trail[person.id] || 0) + 1;
  person.funds = clamp((person.funds ?? 50) + a.funds, 0, 100);
  const fx = blankFx();
  const q = skill(person) * 0.4 + rng.normal(0.4, 0.3);
  let line = "";
  switch (actionId) {
    case "rally": {
      const r = nation.regions.find((x) => x.id === opts.regionId);
      if (!r) return null;
      bump(fx.region, `${person.id}:${r.id}`, 0.12 * (0.6 + q));
      line = `${person.name} holds a ${q > 0.6 ? "packed" : "modest"} rally in ${r.name}.`;
      break;
    }
    case "ad_positive": {
      const issue = opts.issue;
      for (const b of BLOCS) if (b.ideal[issue] !== undefined) bump(fx.bloc, `${person.id}:${b.id}`, 0.06 * (agree(b, issue, person.positions[issue] ?? 0) - 0.5) * 2 * (0.6 + q));
      fx.salience[issue] = 1.06;
      line = `${person.name}'s new ad on ${ISSUE_BY_ID[issue]?.name} is everywhere.`;
      break;
    }
    case "ad_attack": {
      const foe = state.persons[opts.target];
      const issue = opts.issue;
      if (!foe) return null;
      for (const b of BLOCS) {
        if (b.ideal[issue] === undefined) continue;
        const edge = agree(b, issue, person.positions[issue] ?? 0) - agree(b, issue, foe.positions[issue] ?? 0);
        if (edge > 0) bump(fx.bloc, `${foe.id}:${b.id}`, -0.1 * edge * (0.6 + q));
      }
      bump(fx.person, `${person.id}:integrity`, -2);
      line = `${person.name} runs attack ads against ${foe.name} on ${ISSUE_BY_ID[issue]?.name}.`;
      break;
    }
    case "court": {
      const b = BLOCS.find((x) => x.id === opts.blocId);
      if (!b) return null;
      bump(fx.bloc, `${person.id}:${b.id}`, 0.15 * (0.6 + q));
      for (const r of b.rivals || []) bump(fx.bloc, `${person.id}:${r}`, -0.05);
      line = `${person.name} courts the ${b.name}.`;
      break;
    }
    case "fundraiser": {
      bump(fx.person, `${person.id}:integrity`, -1);
      line = `${person.name} holds a fundraiser with wealthy donors.`;
      break;
    }
  }
  addFx(camp.effects, fx);
  for (const [key, v] of Object.entries(fx.person)) {
    const [id, stat] = key.split(":");
    const p = state.persons[id];
    if (p) p[stat] = clamp((p[stat] ?? 50) + v, 0, 100);
  }
  camp.log.unshift(line);
  if (camp.log.length > 30) camp.log.length = 30;
  return [`§6[Campaign]§r ${line}`];
}
