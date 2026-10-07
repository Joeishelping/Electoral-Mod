// Lines of succession and what happens when the top office falls vacant.

import { ADULT_AGE, getPerson, nationPersons } from "../core/state.js";
import { effectiveGov, OFFICE_BY_ID } from "../data/governments.js";
import { computeCouncil } from "./council.js";
import { candidateSummary } from "./election.js";

function childrenMap(state, nation) {
  const map = {};
  for (const p of nationPersons(state, nation, true)) {
    if (!p.parentId) continue;
    (map[p.parentId] = map[p.parentId] || []).push(p);
  }
  for (const kids of Object.values(map)) kids.sort((a, b) => b.age - a.age || (a.id < b.id ? -1 : 1));
  return map;
}

// Eldest child's whole line first, then younger children, then siblings' lines, then up the tree.
export function primogenitureOrder(state, nation, rulerId) {
  const ruler = getPerson(state, rulerId);
  const kids = childrenMap(state, nation);
  const out = [];
  const seen = new Set([rulerId]);
  const descend = (id) => {
    for (const k of kids[id] || []) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      if (k.alive && k.legitimacy >= 30) out.push(k);
      descend(k.id);
    }
  };
  if (ruler) {
    descend(ruler.id);
    let cur = ruler;
    while (cur && cur.parentId) {
      const parent = getPerson(state, cur.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(cur.id);
      descend(parent.id);
      cur = parent;
    }
  }
  if (!out.length) {
    const dyn = ruler?.dynasty || nation.dynasty;
    return nationPersons(state, nation)
      .filter((p) => p.id !== rulerId && dyn && p.dynasty === dyn)
      .sort((a, b) => b.legitimacy - a.legitimacy || b.age - a.age);
  }
  return out;
}

export function dynastyMembers(state, nation, excludeId) {
  const ruler = getPerson(state, nation.leaderId);
  const dyn = ruler?.dynasty || nation.dynasty;
  if (!dyn) return [];
  return nationPersons(state, nation).filter((p) => p.dynasty === dyn && p.id !== excludeId);
}

function notableScore(p) {
  return p.competence * 0.4 + p.loyalty * 0.3 + p.popularity * 0.3;
}

export function lineOfSuccession(state, nation) {
  const gov = effectiveGov(nation);
  const leaderId = nation.leaderId;
  const leader = getPerson(state, leaderId);
  const alive = (id) => {
    const p = getPerson(state, id);
    return p && p.alive && p.id !== leaderId ? p : null;
  };
  const cabinetOrder = gov.offices.map((o) => alive(nation.cabinet[o])).filter(Boolean);
  const out = [];
  const push = (p, why) => {
    if (p && !out.some((x) => x.person.id === p.id)) out.push({ person: p, why });
  };
  switch (gov.succession) {
    case "line":
      push(alive(nation.deputyId), gov.deputyTitle);
      gov.offices.forEach((o) => push(alive(nation.cabinet[o]), `${gov.officePrefix} ${OFFICE_BY_ID[o].name}`));
      break;
    case "party": {
      push(alive(nation.deputyId), gov.deputyTitle);
      const partyMates = nationPersons(state, nation).filter((p) => p.id !== leaderId && leader && p.partyId === leader.partyId && p.age >= ADULT_AGE);
      partyMates.sort((a, b) => b.popularity + b.competence - (a.popularity + a.competence)).forEach((p) => push(p, "Party caucus pick"));
      cabinetOrder.forEach((p) => push(p, "Cabinet"));
      break;
    }
    case "designated":
      push(alive(nation.heirId), "Designated successor");
      push(alive(nation.deputyId), gov.deputyTitle);
      cabinetOrder.slice().sort((a, b) => b.loyalty - a.loyalty).forEach((p) => push(p, "Senior official"));
      break;
    case "bloodline": {
      const law = gov.successionLaw;
      if (law === "designated") push(alive(nation.heirId), "Named heir");
      if (law === "seniority") {
        dynastyMembers(state, nation, leaderId).filter((p) => p.age >= ADULT_AGE).sort((a, b) => b.age - a.age).forEach((p) => push(p, "Eldest of the blood"));
      } else if (law === "elective") {
        dynastyMembers(state, nation, leaderId).filter((p) => p.age >= ADULT_AGE && p.legitimacy >= 30)
          .sort((a, b) => notableScore(b) + b.legitimacy * 0.3 - (notableScore(a) + a.legitimacy * 0.3))
          .forEach((p) => push(p, "Eligible (council decides)"));
      }
      primogenitureOrder(state, nation, leaderId).forEach((p) => push(p, p.age < ADULT_AGE ? "By birth (minor)" : "By birth"));
      break;
    }
    case "council":
    default:
      push(alive(nation.deputyId), `${gov.deputyTitle} (interim)`);
      break;
  }
  return out;
}

function councilPool(state, nation, excludeId, gov, limit = 5) {
  return nationPersons(state, nation)
    .filter((p) => p.id !== excludeId && p.age >= ADULT_AGE && (!gov.vetting || p.approved))
    .sort((a, b) => notableScore(b) - notableScore(a))
    .slice(0, limit);
}

function simpleResult(state, nation, gov, heir, title, lines) {
  return {
    id: `s${nation.electionCount + 1}`,
    no: (nation.electionCount || 0) + 1,
    kind: "succession",
    method: "succession",
    methodName: "Line of succession",
    gov: nation.gov,
    title,
    candidates: heir ? candidateSummary(state, nation, [heir.id]) : [],
    national: heir ? [1] : [],
    regions: [],
    blocs: [],
    rounds: [],
    winnerIdx: heir ? 0 : -1,
    winnerId: heir ? heir.id : null,
    narrative: lines,
  };
}

/** Pure: decides who takes over. Apply with applySuccession(). */
export function computeSuccession(state, nation, reason, seed) {
  const res = decideSuccession(state, nation, reason, seed);
  const heir = getPerson(state, res.winnerId);
  if (heir && heir.age < ADULT_AGE) {
    const gov = effectiveGov(nation);
    res.narrative.push(`§e${heir.name} is only ${heir.age}; the ${gov.deputyTitle} governs in their name until they come of age.`);
  }
  return res;
}

function decideSuccession(state, nation, reason, seed) {
  const gov = effectiveGov(nation);
  const departing = getPerson(state, nation.leaderId);
  const title = `Succession (${reason})`;
  const pre = departing ? `${departing.name}'s reign as ${gov.leaderTitle} ends (${reason}).` : `The office of ${gov.leaderTitle} is vacant.`;
  const line = lineOfSuccession(state, nation);

  const council = (candidates, opts, extra) => {
    if (!candidates.length) return simpleResult(state, nation, gov, null, title, [pre, "§cNo eligible successor exists. Appoint a leader manually."]);
    if (candidates.length === 1) return simpleResult(state, nation, gov, candidates[0], title, [pre, `${candidates[0].name} is the only eligible successor.`]);
    const election = { id: `s${nation.electionCount + 1}`, kind: "council", candidates: candidates.map((c) => c.id), title };
    const res = computeCouncil(state, nation, election, seed, { ...opts, title });
    res.kind = "succession";
    res.narrative.unshift(pre);
    if (extra) res.narrative.push(...extra(res));
    return res;
  };

  if (gov.succession === "council") {
    return council(councilPool(state, nation, nation.leaderId, gov), {});
  }

  if (gov.succession === "bloodline") {
    const law = gov.successionLaw;
    if (law === "elective") {
      const claimants = line.map((l) => l.person).filter((p) => p.age >= ADULT_AGE).slice(0, 6);
      const legal = primogenitureOrder(state, nation, nation.leaderId)[0];
      return council(claimants.length ? claimants : councilPool(state, nation, nation.leaderId, gov), { fallbackId: legal?.id });
    }
    const heir = line[0]?.person;
    if (!heir) {
      return council(councilPool(state, nation, nation.leaderId, gov), {}, () => ["§6The bloodline is extinct; the great houses chose a new ruler."]);
    }
    if (gov.confirmation) {
      const claimants = [heir, ...line.slice(1).map((l) => l.person).filter((p) => p.age >= ADULT_AGE).slice(0, 2)];
      const bonus = { [heir.id]: 0.9 * (gov.weights.legitimacy || 1) };
      return council(claimants, { heirBonus: bonus, fallbackId: heir.id, favoredId: nation.heirId || heir.id }, (res) =>
        res.winnerId === heir.id
          ? [`The ${gov.assemblyName} confirms the rightful heir.`]
          : [`§6Contested succession! The ${gov.assemblyName} passed over ${heir.name} (the legal heir).`]);
    }
    return simpleResult(state, nation, gov, heir, title, [pre, `${heir.name} inherits by ${law === "seniority" ? "seniority" : "birthright"}.`]);
  }

  const heir = line[0]?.person;
  if (!heir) {
    return simpleResult(state, nation, gov, null, title, [pre, "§cThe line of succession is empty. Hold an election or appoint a leader."]);
  }
  return simpleResult(state, nation, gov, heir, title, [pre, `${heir.name} (${line[0].why}) assumes office as ${gov.leaderTitle}.`]);
}
