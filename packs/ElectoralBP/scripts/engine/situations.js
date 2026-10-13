// Situations: scenarios that strike a nation's cities, its responses (one of
// three, or do nothing) and funding priority, escalation and spread, other
// countries' counter-moves, disputes ruled by an admin, and a graded record of how
// every crisis was handled - which voters remember at the next election.

import { SCENARIOS, SCENARIO_BY_ID, DO_NOTHING, fill } from "../data/scenarios.js";
import { BLOCS, BLOC_BY_ID } from "../data/blocs.js";
import { effectiveGov } from "../data/governments.js";
import { createNation, getRegion, nextId, regionBlocShares } from "../core/state.js";
import { clamp } from "../core/random.js";
import { getStance, setStance } from "./diplomacy.js";
import { ensureEconomy, isBroke } from "./economy.js";
import { transferRegion } from "./territory.js";

const ORDER = ["war", "rival", "tense", "neutral", "friendly", "trade", "alliance"];
const HOSTILE = new Set(["war", "rival", "tense"]);
const FRIENDLY = new Set(["alliance", "trade", "friendly"]);
export const GRADE_VALUE = { A: 0.35, B: 0.15, C: 0, D: -0.2, F: -0.45 };

export function ensureSituations(state, nation) {
  nation.situations = nation.situations || [];
  nation.record = nation.record || [];
  nation.groupMemory = nation.groupMemory || {};
  state.disputes = state.disputes || [];
}

const others = (state, nation) => Object.values(state.nations).filter((n) => n.id !== nation.id);
const turnOf = (nation) => ensureEconomy(nation).turn;
const tagOf = (nation) => `${nation.color}[${nation.name}]§r`;

export function stepRelation(state, a, b, steps) {
  if (!a || !b || a === b || !steps || !state.nations[a] || !state.nations[b]) return null;
  const cur = ORDER.indexOf(getStance(state, a, b));
  const next = ORDER[clamp(cur + steps, 0, ORDER.length - 1)];
  setStance(state, a, b, next);
  return next;
}

/** Military strength: army funding times the size of the economy. */
export function strength(nation) {
  const e = ensureEconomy(nation);
  return (0.2 + e.stock.military) * Math.sqrt((e.gdp || nation.regions.reduce((s, r) => s + r.population * 15, 0)) + 1);
}

export function odds(state, a, b) {
  const sa = strength(a);
  const sb = strength(b);
  return sa / (sa + sb || 1);
}

function candidatesFor(state, nation, needs) {
  const all = others(state, nation);
  if (!needs) return all;
  if (needs === "war") return all.filter((o) => getStance(state, nation.id, o.id) === "war");
  if (needs === "enemy") return all.filter((o) => HOSTILE.has(getStance(state, nation.id, o.id)));
  if (needs === "ally") return all.filter((o) => FRIENDLY.has(getStance(state, nation.id, o.id)));
  return all;
}

function pickRegions(nation, tpl, rng, count) {
  const pool = nation.regions.slice();
  if (!pool.length) return [];
  const weight = (r) => ((tpl.prefer || []).includes(r.template) ? 4 : 1) * Math.sqrt(r.population + 1);
  const out = [];
  while (out.length < count && pool.length) {
    const r = rng.weighted(pool, weight);
    out.push(r.id);
    pool.splice(pool.indexOf(r), 1);
  }
  return out;
}

/** One of the other country's cities: the one nearest the trouble, if the map knows. */
function otherCity(state, sit) {
  const other = state.nations[sit.otherId];
  if (!other || !other.regions.length) return "their border towns";
  const r = other.regions.find((x) => x.id === sit.otherCityId) || other.regions[0];
  return r.name;
}

/** A city of the other country to name in the story (the same one every time for this situation). */
function nearestCity(state, other, regionIds) {
  if (!other?.regions.length) return null;
  const seed = [...regionIds.join("")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return other.regions[seed % other.regions.length].id;
}

function fillers(state, nation, sit) {
  const gov = effectiveGov(nation);
  return {
    country: nation.name,
    city: sit.regionIds.map((id) => getRegion(nation, id)?.name).filter(Boolean).join(" & ") || "the capital",
    other: state.nations[sit.otherId]?.name || "a foreign power",
    othercity: otherCity(state, sit),
    lobby: BLOC_BY_ID[sit.lobby]?.name || "Business Lobby",
    leader: gov.leaderTitle,
    ruler: state.persons[nation.leaderId]?.name || `the ${gov.leaderTitle}`,
    rival: state.persons[sit.personId]?.name || "a challenger",
  };
}

function reactorsFor(state, nation, tpl, sit, rng) {
  const who = tpl.counter?.who;
  if (!who) return [];
  const all = others(state, nation);
  let list = [];
  if (who === "other") list = sit.otherId && state.nations[sit.otherId] ? [state.nations[sit.otherId]] : [];
  else if (who === "rivals") list = all.filter((o) => HOSTILE.has(getStance(state, nation.id, o.id)));
  else if (who === "trade") list = all.filter((o) => FRIENDLY.has(getStance(state, nation.id, o.id)));
  else if (who !== "neighbours") list = all;
  if (!list.length && who !== "other") list = rng.shuffle(all).slice(0, 2);
  return rng.shuffle(list).slice(0, 3);
}

export function pickTemplate(state, nation, rng) {
  const e = ensureEconomy(nation);
  const active = new Set(nation.situations.filter((s) => s.status === "active" && s.kind === "situation").map((s) => s.tpl));
  const war = others(state, nation).some((o) => getStance(state, nation.id, o.id) === "war");
  const gov = effectiveGov(nation).id;
  const hasLeader = !!state.persons[nation.leaderId];
  const hasRival = Object.values(state.persons).some((p) => p.nationId === nation.id && p.name && p.id !== nation.leaderId);
  const pool = SCENARIOS.filter((t) =>
    !active.has(t.id) &&
    (!t.needs || candidatesFor(state, nation, t.needs).length) &&
    (!t.govs || t.govs.includes(gov)) &&
    (t.person !== "ruler" || hasLeader) &&
    (t.person !== "rival" || hasRival) &&
    (t.person !== "any" || hasLeader || hasRival));
  if (!pool.length) return null;
  return rng.weighted(pool, (t) => {
    let w = 1;
    if (war && (t.cat === "War" || t.cat === "Military")) w *= 3;
    if (t.id === "tax_revolt") w *= e.incomeTax > 35 ? 4 : 0.2;
    if (t.id === "famine") w *= nation.metrics.food < 40 ? 3 : 1;
    if (t.id === "strike") w *= nation.metrics.jobs < 40 ? 3 : 1;
    if (t.id === "riots") w *= 1 + nation.regions.reduce((s, r) => s + (r.unrest || 0), 0) / (50 * (nation.regions.length || 1));
    if (t.kind === "opportunity") w *= e.growth > 0.02 ? 1.3 : 1;
    if (t.govs) w *= 1.5; // flavour for this kind of government
    return w * (t.w ?? 1);
  });
}

/** Starts a situation (random unless opts say otherwise). Returns { sit, lines } or null. */
export function spawnSituation(state, nation, rng, opts = {}) {
  ensureSituations(state, nation);
  if (!nation.regions.length) return null;
  const tpl = opts.tplId ? SCENARIO_BY_ID[opts.tplId] : pickTemplate(state, nation, rng);
  if (!tpl) return null;
  let otherId = opts.otherId || null;
  if (tpl.needs && !otherId) {
    const c = candidatesFor(state, nation, tpl.needs);
    if (!c.length) return null;
    otherId = rng.pick(c).id;
  }
  const count = rng.int((tpl.cities || [1, 1])[0], (tpl.cities || [1, 1])[1]);
  const regionIds = opts.regionIds?.length ? opts.regionIds : pickRegions(nation, tpl, rng, count);
  const person = personFor(state, nation, tpl.person, rng);
  if (tpl.person && !person) return null;
  const sit = {
    id: nextId(state, "s"),
    kind: "situation",
    tpl: tpl.id,
    nationId: nation.id,
    regionIds,
    otherId,
    otherCityId: otherId ? nearestCity(state, state.nations[otherId], regionIds) : null,
    personId: person?.id || null,
    lobby: rng.pick(BLOCS).id,
    severity: tpl.severity || 2,
    startSeverity: tpl.severity || 2,
    maxSeverity: tpl.severity || 2,
    progress: 0,
    turns: 0,
    atMax: 0,
    choice: null,
    priority: 0,
    escalated: false,
    status: "active",
    startTurn: turnOf(nation),
    involvement: [],
    counters: [],
  };
  const f = fillers(state, nation, sit);
  sit.title = fill(tpl.title, f);
  sit.text = fill(tpl.text, f);
  nation.situations.unshift(sit);
  const lines = [`${tagOf(nation)} §e§lNEW SITUATION:§r §f${sit.title}§r - ${sit.text}`];
  for (const reactor of reactorsFor(state, nation, tpl, sit, rng)) {
    ensureSituations(state, reactor);
    const c = {
      id: nextId(state, "s"),
      kind: "counter",
      tpl: tpl.id,
      nationId: reactor.id,
      originNationId: nation.id,
      originSitId: sit.id,
      regionIds: sit.regionIds.slice(),
      title: fill(tpl.counter.title, { ...f, country: reactor.name, origin: nation.name }),
      text: fill(tpl.counter.text, { ...f, country: reactor.name, origin: nation.name }),
      status: "active",
      deadline: turnOf(reactor) + 3,
      choice: null,
    };
    reactor.situations.unshift(c);
    sit.counters.push({ nationId: reactor.id, sitId: c.id });
    lines.push(`${tagOf(reactor)} §7must decide how to react to ${nation.name}'s ${sit.title.toLowerCase()}.`);
  }
  trim(nation);
  return { sit, lines };
}

function trim(nation) {
  const ended = nation.situations.filter((s) => s.status !== "active" && s.status !== "ruling");
  if (ended.length > 12) {
    const drop = new Set(ended.slice(12).map((s) => s.id));
    nation.situations = nation.situations.filter((s) => !drop.has(s.id));
  }
}

export function optionsFor(sit) {
  const tpl = SCENARIO_BY_ID[sit.tpl];
  return sit.kind === "counter" ? tpl.counter.options : tpl.options;
}

export function optionLabel(state, sit, i) {
  if (i === -1 || i === null || i === undefined) return DO_NOTHING.label;
  const nation = state.nations[sit.kind === "counter" ? sit.originNationId : sit.nationId];
  const opt = optionsFor(sit)[i];
  if (!nation || !opt) return opt?.label || "?";
  const f = fillers(state, nation, sit.kind === "counter" ? { ...sit, otherId: null } : sit);
  return fill(opt.label, { ...f, origin: nation.name });
}

/** Per-turn cost of a response at a given priority. */
export function responseCost(nation, sit, choice = sit.choice, priority = sit.priority) {
  if (choice === null || choice === -1 || !priority) return 0;
  const opt = optionsFor(sit)[choice];
  const e = ensureEconomy(nation);
  return priority * (e.gdp || 1000) * 0.01 * (opt?.cost ?? 1) * Math.sqrt(Math.max(1, sit.severity));
}

/** The owner picks how to handle a situation. choice -1 = do nothing. */
export function respond(state, nation, sit, choice, priority) {
  sit.choice = choice;
  sit.priority = choice === -1 ? 0 : clamp(Math.round(priority), 0, 5);
  const lines = [`${tagOf(nation)} ${sit.title}: §e${optionLabel(state, sit, choice)}§r${choice === -1 ? "" : ` §7(priority ${sit.priority}/5)`}`];
  return lines;
}

// ---------- effects ----------

/** People a situation can be about: the ruler, or someone else running in this country. */
function personFor(state, nation, who, rng) {
  if (!who) return null;
  const leader = state.persons[nation.leaderId] || null;
  if (who === "ruler") return leader;
  const pool = Object.values(state.persons).filter((p) => p.nationId === nation.id && p.name && p.id !== nation.leaderId);
  if (who === "rival") return pool.length ? rng.pick(pool) : null;
  return pool.length || leader ? rng.pick(leader ? [...pool, leader] : pool) : null;
}

function changePerson(person, changes, lines) {
  if (!person || !changes) return;
  const said = [];
  for (const [k, v] of Object.entries(changes)) {
    if (typeof person[k] !== "number") continue;
    person[k] = clamp(person[k] + v, 0, 100);
    said.push(`${k} ${v > 0 ? "+" : ""}${v}`);
  }
  if (said.length) lines.push(`§7   ${person.name}: ${said.join(", ")}`);
}

function applyFx(state, nation, fx, otherId, regionIds, rng, lines, personId = null) {
  if (!fx) return;
  if (fx.person) changePerson(state.persons[personId], fx.person, lines);
  if (fx.ruler) changePerson(state.persons[nation.leaderId], fx.ruler, lines);
  const e = ensureEconomy(nation);
  const gdp = e.gdp || 1000;
  if (fx.treasury) e.treasury = (e.treasury || 0) + fx.treasury * gdp;
  if (fx.gdp) e.boost += fx.gdp;
  if (fx.tech) e.tech += fx.tech;
  for (const [k, v] of Object.entries(fx.stock || {})) e.stock[k] = clamp((e.stock[k] || 0) + v, 0, 1);
  for (const [m, v] of Object.entries(fx.metrics || {})) {
    if (e.autoMetrics) e.mods[m] = (e.mods[m] || 0) + v;
    else nation.metrics[m] = clamp((nation.metrics[m] ?? 50) + v, 0, 100);
  }
  if (fx.tariff) e.tariff = clamp(e.tariff + fx.tariff, 0, 60);
  if (fx.incomeTax) e.incomeTax = clamp(e.incomeTax + fx.incomeTax, 0, 70);
  if (fx.unrest) for (const id of regionIds || []) {
    const r = getRegion(nation, id);
    if (r) r.unrest = clamp((r.unrest || 0) + fx.unrest, 0, 100);
  }
  if (fx.relation && otherId && state.nations[otherId]) {
    const s = stepRelation(state, nation.id, otherId, fx.relation);
    if (s) lines.push(`§7   Relations between ${nation.name} and ${state.nations[otherId]?.name} are now §f${s}§7.`);
  }
  if (fx.allyBoost) {
    const friend = others(state, nation).filter((o) => !HOSTILE.has(getStance(state, nation.id, o.id)) && getStance(state, nation.id, o.id) !== "alliance");
    if (friend.length) {
      const f = rng.pick(friend);
      lines.push(`§7   ${f.name} moves closer to ${nation.name} (${stepRelation(state, nation.id, f.id, fx.allyBoost)}).`);
    }
  }
  if (fx.special === "cede" && otherId && state.nations[otherId]) {
    for (const id of regionIds || []) {
      const r = getRegion(nation, id);
      if (r && transferRegion(state, r, state.nations[otherId])) lines.push(`§6   ${r.name} now belongs to ${state.nations[otherId].name}.`);
    }
  }
}

function remember(nation, groups, mult) {
  for (const [g, v] of Object.entries(groups || {})) nation.groupMemory[g] = clamp((nation.groupMemory[g] || 0) + v * mult, -1, 1);
}

function gradeOf(sit, tpl, outcome) {
  if (outcome === "failure") return "F";
  if (outcome === "declined") return tpl.kind === "opportunity" ? "C" : "F";
  if (outcome === "missed") return "D";
  const score = 100 - (sit.maxSeverity - sit.startSeverity) * 15 - Math.max(0, sit.turns - 3) * 4 + (sit.priority >= 4 ? 5 : 0);
  return score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
}

const QUALITY = { A: 1.2, B: 1, C: 0.8, D: 0.6, F: 0.4 };

/** Ends a situation and records how it was handled. */
export function resolveSituation(state, nation, sit, outcome, rng) {
  const tpl = SCENARIO_BY_ID[sit.tpl];
  const lines = [];
  const opt = sit.choice >= 0 ? tpl.options[sit.choice] : null;
  const held = (state.disputes || []).some((d) => d.status === "open" && d.sitId === sit.id && d.kind === "contest");
  const grade = gradeOf(sit, tpl, outcome);
  sit.status = outcome === "success" ? "resolved" : outcome;
  sit.grade = grade;
  sit.endTurn = turnOf(nation);
  const cities = fillers(state, nation, sit).city;
  if (outcome === "success" && opt) {
    if (held) sit.heldFx = opt.fx; // rewards wait for the dispute ruling
    else applyFx(state, nation, opt.fx, sit.otherId, sit.regionIds, rng, lines, sit.personId);
    remember(nation, opt.groups, QUALITY[grade]);
  } else if (outcome === "failure") {
    const e = ensureEconomy(nation);
    e.treasury -= (e.gdp || 0) * 0.04;
    e.boost -= 0.03;
    for (const id of sit.regionIds) {
      const r = getRegion(nation, id);
      if (!r) continue;
      r.unrest = clamp((r.unrest || 0) + 12, 0, 100);
      // the people hit hardest blame the government
      for (const [b, sh] of Object.entries(regionBlocShares(r))) nation.groupMemory[b] = clamp((nation.groupMemory[b] || 0) - 0.15 * sh * 3, -1, 1);
    }
    if (opt) remember(nation, opt.groups, 0.4);
  }
  const verdict = {
    success: tpl.kind === "opportunity" ? "§aseized the opportunity" : "§aresolved",
    failure: "§cspiralled out of control",
    missed: "§7let the opportunity slip away",
    declined: tpl.kind === "opportunity" ? "§7passed on it" : "§cdid nothing",
  }[outcome];
  lines.unshift(`${tagOf(nation)} §lRESOLUTION:§r ${sit.title} in ${cities} - ${nation.name} ${verdict}§r. Response: §e${optionLabel(state, sit, sit.choice)}§r. Grade: §l${grade}`);
  for (const inv of sit.involvement) lines.push(`§7   ${inv.text}`);
  nation.record.unshift({
    id: sit.id,
    title: sit.title,
    cities,
    regionIds: sit.regionIds.slice(),
    response: optionLabel(state, sit, sit.choice),
    grade,
    outcome,
    leaderId: nation.leaderId,
    term: nation.electionCount || 0,
    turn: turnOf(nation),
    involvement: sit.involvement.map((i) => i.text),
  });
  if (nation.record.length > 40) nation.record.length = 40;
  for (const c of sit.counters) {
    const reactor = state.nations[c.nationId];
    const cs = reactor?.situations?.find((x) => x.id === c.sitId);
    if (cs && cs.status === "active") cs.status = "expired";
  }
  return lines;
}

/** A reacting country picks its move. choice -1 = do nothing. */
export function respondCounter(state, reactor, csit, choice, rng) {
  const tpl = SCENARIO_BY_ID[csit.tpl];
  const origin = state.nations[csit.originNationId];
  const osit = origin?.situations?.find((s) => s.id === csit.originSitId);
  csit.choice = choice;
  csit.status = "resolved";
  const lines = [];
  const label = optionLabel(state, csit, choice);
  const text = `${reactor.name} chose: ${label}.`;
  if (osit) osit.involvement.push({ nationId: reactor.id, text });
  if (choice === -1 || !origin) {
    lines.push(`${tagOf(reactor)} stays out of ${origin?.name || "it"}'s ${osit?.title?.toLowerCase() || "situation"}.`);
    return lines;
  }
  const opt = tpl.counter.options[choice];
  const e = ensureEconomy(reactor);
  e.treasury -= (opt.cost || 0) * (e.gdp || 0);
  lines.push(`${tagOf(reactor)} §e${label}§r §7(reacting to ${origin.name}'s ${osit?.title || tpl.title} in ${fill("{city}", fillers(state, origin, osit || csit))})`);
  applyFx(state, reactor, opt.fx, origin.id, [], rng, lines);
  remember(reactor, opt.groups, 1);
  if (opt.origin && osit && osit.status === "active") {
    const oe = ensureEconomy(origin);
    if (opt.origin.progress) osit.progress += opt.origin.progress;
    if (opt.origin.severity) osit.severity = clamp(osit.severity + opt.origin.severity, 0.5, 5);
    if (opt.origin.treasury) oe.treasury += opt.origin.treasury * (oe.gdp || 0);
    if (opt.origin.gdp) oe.boost += opt.origin.gdp;
  }
  if (opt.war) {
    setStance(state, reactor.id, origin.id, "war");
    lines.push(`§4   ${reactor.name} and ${origin.name} are now at WAR.`);
  }
  if (opt.contest && origin.regions.length) {
    const regionId = csit.regionIds.find((id) => getRegion(origin, id)) || origin.regions[0].id;
    const city = getRegion(origin, regionId).name;
    const d = {
      id: nextId(state, "d"),
      kind: "contest",
      status: "open",
      title: `${reactor.name} vs ${origin.name} over ${city}`,
      text: `${reactor.name} chose to "${label}". Who comes out on top?`,
      sitId: osit?.id || null,
      originNationId: origin.id,
      regionId,
      choices: [
        { label: `${origin.name} holds ${city}`, winner: origin.id, effect: "keep" },
        { label: `${reactor.name} takes ${city}`, winner: reactor.id, effect: "transfer" },
      ],
      odds: odds(state, origin, reactor),
    };
    state.disputes.push(d);
    lines.push(`§c   A dispute has opened: ${d.title}. An admin must rule on it.`);
  }
  return lines;
}

/** Situations that need an admin ruling instead of resolving on their own. */
function openRuling(state, nation, sit) {
  const tpl = SCENARIO_BY_ID[sit.tpl];
  const city = fillers(state, nation, sit).city;
  const other = state.nations[sit.otherId];
  let choices;
  if (sit.tpl === "separatists") {
    choices = [
      { label: `${city} votes to stay in ${nation.name}`, effect: "success" },
      { label: `${city} votes to leave`, effect: "secede" },
    ];
  } else if (other) {
    choices = [
      { label: `${nation.name} holds ${city}`, winner: nation.id, effect: "success" },
      { label: `${other.name} wins - takes ${city}`, winner: other.id, effect: "lose" },
    ];
  } else {
    choices = [
      { label: "It works out", effect: "success" },
      { label: "It fails", effect: "failure" },
    ];
  }
  sit.status = "ruling";
  state.disputes.push({
    id: nextId(state, "d"),
    kind: "ruling",
    status: "open",
    title: `${tpl.title} in ${city} (${nation.name})`,
    text: `${sit.text} ${nation.name} chose "${optionLabel(state, sit, sit.choice)}". What happened?`,
    sitId: sit.id,
    originNationId: nation.id,
    regionId: sit.regionIds[0],
    choices,
    odds: other ? odds(state, nation, other) * (0.6 + (sit.priority || 0) * 0.15) : null,
  });
  return [`${tagOf(nation)} §6${sit.title} in ${city} awaits an admin's ruling.`];
}

/** The admin decides a dispute. Returns chat lines. */
export function ruleDispute(state, d, choiceIdx, rng) {
  const c = d.choices[choiceIdx];
  const origin = state.nations[d.originNationId];
  d.status = "closed";
  d.ruling = c.label;
  const lines = [`§6[Ruling]§r ${d.title}: §e${c.label}`];
  if (!origin) return lines;
  const sit = origin.situations?.find((s) => s.id === d.sitId);
  const region = getRegion(origin, d.regionId);
  if (d.kind === "contest") {
    const winner = state.nations[c.winner];
    if (c.effect === "transfer" && region && winner) {
      transferRegion(state, region, winner);
      lines.push(`§6   ${region.name} now belongs to ${winner.name}.`);
    }
    if (sit?.heldFx && winner) {
      applyFx(state, winner, sit.heldFx, winner.id === origin.id ? sit.otherId : origin.id, winner.id === origin.id ? sit.regionIds : [], rng, lines);
      sit.heldFx = null;
    }
    return lines;
  }
  // rulings on a nation's own situation
  if (!sit) return lines;
  sit.status = "active";
  if (c.effect === "success") lines.push(...resolveSituation(state, origin, sit, "success", rng));
  else if (c.effect === "failure") lines.push(...resolveSituation(state, origin, sit, "failure", rng));
  else if (c.effect === "lose") {
    const winner = state.nations[c.winner];
    lines.push(...resolveSituation(state, origin, sit, "failure", rng));
    if (region && winner) {
      transferRegion(state, region, winner);
      lines.push(`§6   ${region.name} now belongs to ${winner.name}.`);
    }
  } else if (c.effect === "secede" && region) {
    lines.push(...resolveSituation(state, origin, sit, "failure", rng));
    const free = createNation(state, { name: `Free ${region.name}`, gov: "democracy", color: "§e" });
    transferRegion(state, region, free);
    lines.push(`§6   ${region.name} declares independence as ${free.name}!`);
  }
  return lines;
}

export function rollDispute(state, d, rng) {
  const p = d.odds ?? 0.5;
  return ruleDispute(state, d, rng.chance(p) ? 0 : 1, rng);
}

// ---------- each economy turn ----------

export function advanceSituations(state, nation, rng) {
  ensureSituations(state, nation);
  const e = ensureEconomy(nation);
  const out = { cost: 0, regionDrag: {}, metrics: {}, lines: [] };
  const broke = isBroke(nation);
  const turn = e.turn;
  for (const sit of nation.situations) {
    if (sit.status !== "active") continue;
    if (sit.kind === "counter") {
      if (turn >= sit.deadline) {
        sit.choice = -1;
        sit.status = "expired";
        const origin = state.nations[sit.originNationId];
        const osit = origin?.situations?.find((s) => s.id === sit.originSitId);
        if (osit) osit.involvement.push({ nationId: nation.id, text: `${nation.name} did nothing.` });
      }
      continue;
    }
    const tpl = SCENARIO_BY_ID[sit.tpl];
    if (!tpl) continue;
    sit.regionIds = sit.regionIds.filter((id) => getRegion(nation, id));
    if (!sit.regionIds.length) {
      sit.status = "expired"; // the city changed hands
      continue;
    }
    sit.turns++;
    const opt = sit.choice >= 0 ? tpl.options[sit.choice] : null;
    let pr = opt ? sit.priority : 0;
    if (broke && pr > 1) {
      pr = 1;
      if (sit.turns % 2 === 1) out.lines.push(`${tagOf(nation)} §cThe treasury is empty - the response to ${sit.title} is starved of funds.`);
    }
    if (opt) out.cost += responseCost(nation, sit, sit.choice, pr);
    const pace = pr * 12 * (opt?.speed ?? 0) * (0.8 + e.stock.infrastructure * 0.4) * (1 + e.tech * 0.02);
    if (tpl.kind === "opportunity") {
      if (sit.choice === -1) {
        out.lines.push(...resolveSituation(state, nation, sit, "declined", rng));
        continue;
      }
      sit.progress += pace;
      if (sit.progress >= 100) out.lines.push(...((tpl.manual || opt?.manual) ? openRuling(state, nation, sit) : resolveSituation(state, nation, sit, "success", rng)));
      else if (sit.turns >= 4) out.lines.push(...resolveSituation(state, nation, sit, "missed", rng));
      continue;
    }
    // crises
    sit.progress += pace / Math.sqrt(Math.max(1, sit.severity));
    sit.severity = clamp(sit.severity + (tpl.growth ?? 0.5) - pr * 0.22, 0.5, 5);
    sit.maxSeverity = Math.max(sit.maxSeverity, sit.severity);
    if (sit.severity >= 4 && !sit.escalated) {
      sit.escalated = true;
      sit.title = fill(tpl.escalated || `Worsening ${tpl.title}`, fillers(state, nation, sit));
      out.lines.push(`${tagOf(nation)} §c§lESCALATION:§r the situation in ${fillers(state, nation, sit).city} has become a §c${sit.title}§r!`);
      if (tpl.spread && rng.chance(tpl.spread) && sit.regionIds.length < 4) {
        const pool = nation.regions.filter((r) => !sit.regionIds.includes(r.id));
        if (pool.length) {
          const r = rng.pick(pool);
          sit.regionIds.push(r.id);
          out.lines.push(`${tagOf(nation)} §cIt is spreading to ${r.name}!`);
        }
      }
    }
    for (const id of sit.regionIds) out.regionDrag[id] = Math.min(0.8, (out.regionDrag[id] || 0) + (tpl.gdp ?? 0.02) * sit.severity);
    for (const [m, v] of Object.entries(tpl.metrics || {})) out.metrics[m] = (out.metrics[m] || 0) + v * sit.severity;
    if (sit.progress >= 100) {
      out.lines.push(...((tpl.manual || opt?.manual) ? openRuling(state, nation, sit) : resolveSituation(state, nation, sit, "success", rng)));
    } else if (sit.severity >= 5) {
      sit.atMax++;
      if (sit.atMax >= 2) out.lines.push(...resolveSituation(state, nation, sit, sit.choice === -1 || sit.choice === null ? "declined" : "failure", rng));
    }
  }
  trim(nation);
  return out;
}

/** How likely a new situation is this turn. */
export function spawnChance(state, nation) {
  const active = (nation.situations || []).filter((s) => s.status === "active" && s.kind === "situation").length;
  if (active >= 3) return 0;
  const wars = others(state, nation).filter((o) => getStance(state, nation.id, o.id) === "war").length;
  const unrest = nation.regions.length ? nation.regions.reduce((s, r) => s + (r.unrest || 0), 0) / nation.regions.length : 0;
  return clamp(0.3 + 0.12 * wars + unrest / 200 - active * 0.08, 0, 0.8);
}

/** Records from the current term (since the last election). */
export function termRecord(nation) {
  return (nation.record || []).filter((r) => r.term === (nation.electionCount || 0) && r.grade && r.grade !== "-");
}
