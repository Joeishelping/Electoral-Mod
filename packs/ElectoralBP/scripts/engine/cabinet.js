// Cabinet formation. Scores every eligible notable for every office according to the
// government's cabinet style, then fills offices greedily (best fit first).
// Coalition governments first split portfolios between parties by seat share.

import { ISSUE_IDS } from "../data/issues.js";
import { OFFICE_BY_ID } from "../data/governments.js";
import { ADULT_AGE, createPerson, getPerson, nationPersons } from "../core/state.js";
import { clamp } from "../core/random.js";
import { personName } from "../data/names.js";

function alignment(a, b) {
  if (!a || !b) return 0.5;
  let d = 0;
  for (const id of ISSUE_IDS) d += Math.abs(a.positions[id] - b.positions[id]);
  return 1 - d / ISSUE_IDS.length / 200;
}

function fitFor(person, officeId) {
  const office = OFFICE_BY_ID[officeId];
  if (!office) return 0.3;
  const hits = office.issues.filter((i) => person.focus.includes(i)).length;
  return Math.min(1, hits * 0.6);
}

export function scoreAppointee(gov, leader, person, officeId) {
  const merit = person.competence / 100;
  const fit = officeId === "deputy" ? 0.3 : fitFor(person, officeId);
  const align = alignment(person, leader);
  const loyal = person.loyalty / 100;
  const pop = person.popularity / 100;
  const sameParty = leader && person.partyId && person.partyId === leader.partyId ? 1 : 0;
  const family = leader && ((leader.dynasty && person.dynasty === leader.dynasty) || (leader.clanId && person.clanId === leader.clanId)) ? 1 : 0;
  const money = person.funds / 100;
  switch (gov.cabinetStyle) {
    case "loyalty":
      return loyal * 0.45 + align * 0.25 + merit * 0.2 + fit * 0.6 + sameParty * 0.1;
    case "family":
      return family * 0.5 + loyal * 0.25 + merit * 0.2 + fit * 0.5;
    case "patronage":
      return money * 0.45 + loyal * 0.2 + merit * 0.2 + fit * 0.5 + sameParty * 0.1;
    case "coalition":
    case "merit":
    default:
      return merit * 0.45 + fit * 1.0 + align * 0.2 + loyal * 0.1 + pop * (officeId === "deputy" ? 0.4 : 0.1) + sameParty * 0.15;
  }
}

function largestRemainder(weights, seats) {
  const total = weights.reduce((s, w) => s + w.weight, 0) || 1;
  const rows = weights.map((w) => {
    const exact = (w.weight / total) * seats;
    return { key: w.key, n: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = seats - rows.reduce((s, r) => s + r.n, 0);
  rows.sort((a, b) => b.rem - a.rem);
  for (const r of rows) if (left-- > 0) r.n++;
  return Object.fromEntries(rows.map((r) => [r.key, r.n]));
}

function makeAppointee(state, nation, leader, rng) {
  const positions = {};
  for (const id of ISSUE_IDS) positions[id] = clamp(Math.round((leader ? leader.positions[id] : 0) + rng.normal(0, 25)), -100, 100);
  return createPerson(state, nation, {
    name: personName(rng),
    partyId: leader?.partyId ?? null,
    positions,
    focus: rng.shuffle(ISSUE_IDS).slice(0, 2),
    competence: rng.int(40, 80),
    loyalty: rng.int(55, 90),
    popularity: rng.int(25, 55),
    charisma: rng.int(30, 70),
    integrity: rng.int(40, 85),
    funds: rng.int(20, 60),
    age: rng.int(30, 65),
    dynasty: nation.dynasty && rng.chance(0.3) ? nation.dynasty : "",
    clanId: leader?.clanId ?? null,
  });
}

/**
 * Forms a government around leaderId. Returns { deputyId, cabinet, notes }.
 * opts.coalition: [{ key: partyId, seats }] for proportional systems.
 * opts.runningMateId: forced deputy (e.g. elected ticket).
 * opts.keepDeputy: keep the current deputy if still valid.
 */
export function formGovernment(state, nation, gov, leaderId, rng, opts = {}) {
  const leader = getPerson(state, leaderId);
  const notes = [];
  const taken = new Set([leaderId]);
  const pool = () =>
    nationPersons(state, nation).filter((p) => !taken.has(p.id) && p.age >= ADULT_AGE && (!gov.vetting || p.approved));

  // Deputy
  let deputyId = null;
  const pinnedDeputy = getPerson(state, nation.cabinetPins.deputy);
  const mate = getPerson(state, opts.runningMateId);
  if (mate && mate.alive && mate.id !== leaderId) {
    deputyId = mate.id;
    notes.push(`${mate.name} takes office as ${gov.deputyTitle} on the winning ticket.`);
  } else if (pinnedDeputy && pinnedDeputy.alive && pinnedDeputy.id !== leaderId) {
    deputyId = pinnedDeputy.id;
  } else if (opts.keepDeputy && nation.deputyId && nation.deputyId !== leaderId && getPerson(state, nation.deputyId)?.alive) {
    deputyId = nation.deputyId;
  } else {
    const cands = pool().map((p) => [p, scoreAppointee(gov, leader, p, "deputy") + rng.normal(0, 0.03)]).sort((a, b) => b[1] - a[1]);
    if (cands.length) deputyId = cands[0][0].id;
  }
  if (deputyId) taken.add(deputyId);

  // Portfolio quotas for coalitions
  const offices = gov.offices.slice();
  let quotas = null;
  if (opts.coalition && opts.coalition.length > 1) {
    quotas = largestRemainder(opts.coalition.map((c) => ({ key: c.key, weight: c.seats })), offices.length);
    notes.push(`Portfolios split by seats: ${opts.coalition.map((c) => `${c.name || c.key} ${quotas[c.key]}`).join(", ")}.`);
  }

  const cabinet = {};
  // Manual pins first
  for (const officeId of offices) {
    const pinned = getPerson(state, nation.cabinetPins[officeId]);
    if (pinned && pinned.alive && !taken.has(pinned.id)) {
      cabinet[officeId] = pinned.id;
      taken.add(pinned.id);
      if (quotas) {
        const key = pinned.partyId || `ind:${pinned.id}`;
        if (quotas[key] > 0) quotas[key]--;
      }
    }
  }

  const pairs = [];
  for (const p of pool()) {
    const key = p.partyId || `ind:${p.id}`;
    if (quotas && !(key in quotas)) continue; // outside the coalition
    for (const officeId of offices) {
      if (cabinet[officeId]) continue;
      pairs.push({ p, officeId, key, score: scoreAppointee(gov, leader, p, officeId) + rng.normal(0, 0.03) });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  for (const pr of pairs) {
    if (cabinet[pr.officeId] || taken.has(pr.p.id)) continue;
    if (quotas) {
      if (!(quotas[pr.key] > 0)) continue;
      quotas[pr.key]--;
    }
    cabinet[pr.officeId] = pr.p.id;
    taken.add(pr.p.id);
  }

  // Coalition seats whose party ran out of people fall back to anyone in the coalition.
  if (quotas) {
    for (const pr of pairs) {
      if (cabinet[pr.officeId] || taken.has(pr.p.id)) continue;
      cabinet[pr.officeId] = pr.p.id;
      taken.add(pr.p.id);
    }
  }

  let filled = 0;
  for (const officeId of offices) {
    if (cabinet[officeId]) continue;
    if (!gov.autoFill) continue;
    const p = makeAppointee(state, nation, leader, rng);
    cabinet[officeId] = p.id;
    taken.add(p.id);
    filled++;
  }
  if (!deputyId && gov.autoFill) {
    const p = makeAppointee(state, nation, leader, rng);
    deputyId = p.id;
    filled++;
  }
  if (filled) notes.push(`${filled} vacant post${filled > 1 ? "s were" : " was"} filled with newly appointed officials.`);
  return { deputyId, cabinet, notes };
}
