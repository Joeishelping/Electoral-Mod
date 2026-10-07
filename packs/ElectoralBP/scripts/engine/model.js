// Voter model. Every voter group (a bloc inside a region, or a council elector)
// scores every candidate with a random-utility model built from the same pieces
// political scientists use to explain real elections:
//
//   policy     spatial distance between the group's ideal and the candidate's
//              stance, weighted by how much the group cares about each issue
//   emphasis   issue ownership: candidates gain when they *campaign* on issues the
//              group cares about and agrees with (and lose if they push the
//              opposite stance hard)
//   valence    popularity, charisma, competence, integrity, money - weighted by
//              what that particular group values in a leader
//   local      home-region and campaign-stop bonuses
//   courting   targeting a group helps with it and slightly annoys its rivals
//   record     retrospective voting on the performance sliders, routed through
//              which metrics this group actually cares about
//   loyalty    party leanings of the region and learned voting habits
//   kin        clan / bloodline / legitimacy (councils & hereditary systems)
//
// Groups then pick with a multinomial logit, with correlated national, regional
// and group-level shocks (the "polling error").

import { ISSUE_IDS } from "../data/issues.js";
import { BLOCS, BLOC_BY_ID } from "../data/blocs.js";
import { METRICS } from "../data/metrics.js";
import { effectiveGov } from "../data/governments.js";
import { getPerson, regionBlocShares } from "../core/state.js";
import { clamp } from "../core/random.js";
import { diplomacySummary } from "./diplomacy.js";

export const ADULT_SHARE = 0.72;
const DEFAULT_SALIENCE = 0.2;

// How much each bloc cares about each performance metric (cached, static data).
const METRIC_CARE = {};
for (const bloc of BLOCS) {
  const care = {};
  for (const m of METRICS) {
    const wsum = Object.values(m.issues).reduce((s, w) => s + w, 0);
    let c = m.base ?? 0.1;
    if (wsum > 0) {
      for (const [issue, w] of Object.entries(m.issues)) c += ((bloc.salience[issue] ?? DEFAULT_SALIENCE) * w) / wsum;
    }
    c += bloc.metrics?.[m.id] ?? 0;
    care[m.id] = c;
  }
  METRIC_CARE[bloc.id] = care;
}
export const metricCare = (blocId) => METRIC_CARE[blocId];

export function buildContext(state, nation, candidateIds = []) {
  const gov = effectiveGov(nation);
  const candidates = candidateIds.map((id) => getPerson(state, id)).filter(Boolean);
  const dip = diplomacySummary(state, nation.id);

  const natSal = {};
  for (const id of ISSUE_IDS) natSal[id] = nation.salience[id] ?? 1;
  natSal.military *= 1 + 0.35 * dip.wars + 0.1 * dip.rivals;
  natSal.expansion *= 1 + 0.2 * dip.wars;
  natSal.order *= 1 + 0.1 * dip.wars;
  natSal.trade *= 1 + 0.05 * dip.trade;

  // Agenda setting: issues the field campaigns on become more salient for everyone.
  const agenda = {};
  for (const c of candidates) for (const f of c.focus) agenda[f] = (agenda[f] || 0) + 1;
  for (const id of ISSUE_IDS) natSal[id] *= 1 + 0.12 * Math.min(agenda[id] || 0, 3);

  const leader = getPerson(state, nation.leaderId);
  const avgUnrest = nation.regions.length ? nation.regions.reduce((s, r) => s + (r.unrest || 0), 0) / nation.regions.length : 0;
  return {
    state, nation, gov, candidates, dip, natSal,
    incumbentId: nation.leaderId,
    incumbentParty: leader ? leader.partyId : null,
    rulerDynasty: leader ? leader.dynasty : nation.dynasty,
    leaderTerms: nation.leaderTerms || 0,
    avgUnrest,
    W: gov.weights,
  };
}

// ---------- voter groups ----------

function groupFromBloc(ctx, region, blocId, share) {
  const bloc = BLOC_BY_ID[blocId];
  const salience = {};
  for (const id of ISSUE_IDS) {
    salience[id] = (bloc.salience[id] ?? DEFAULT_SALIENCE) * Math.max(0.1, 1 + (region.issueMods[id] || 0)) * ctx.natSal[id];
  }
  const ideal = {};
  for (const id of ISSUE_IDS) ideal[id] = bloc.ideal[id] ?? 0;
  const ew = ctx.gov.electorate ? ctx.gov.electorate[blocId] || 0 : 1;
  const wealthMul = ctx.gov.wealthWeighted ? clamp(region.wealth / 50, 0.2, 3) : 1;
  return {
    key: `${region.id}:${blocId}`,
    region,
    blocId,
    name: bloc.name,
    voters: region.population * ADULT_SHARE * share * ew * wealthMul,
    ideal,
    salience,
    traits: bloc.traits,
    loyalty: bloc.loyalty,
    volatility: bloc.volatility,
    baseTurnout: bloc.turnout,
    rivals: bloc.rivals,
    retro: retroScore(ctx, region, [[blocId, 1]]),
    memory: region.memory?.[blocId] || {},
  };
}

export function buildGroups(ctx) {
  const groups = [];
  for (const region of ctx.nation.regions) {
    const shares = regionBlocShares(region);
    for (const [blocId, share] of Object.entries(shares)) {
      const g = groupFromBloc(ctx, region, blocId, share);
      if (g.voters >= 1) groups.push(g);
    }
  }
  return groups;
}

// Retrospective evaluation (-1.5..1.5) of the government's record for a mix of blocs.
export function retroScore(ctx, region, blocMix) {
  const m = ctx.nation.metrics;
  let num = 0;
  let den = 0;
  for (const [blocId, w] of blocMix) {
    const care = METRIC_CARE[blocId];
    for (const metric of METRICS) {
      num += w * care[metric.id] * (((m[metric.id] ?? 50) - 50) / 50);
      den += w * care[metric.id];
    }
  }
  let score = den > 0 ? num / den : 0;
  if (region) score += (region.favor || 0) / 100 - (region.unrest || 0) / 200;
  return score;
}

// Blended ideal/salience/traits of a weighted set of blocs (used for council electors).
export function blendBlocs(ctx, region, weights) {
  const ideal = {};
  const salience = {};
  const traits = { charisma: 0, competence: 0, integrity: 0, wealth: 0 };
  let total = 0;
  const mix = [];
  for (const [blocId, w] of Object.entries(weights)) {
    if (w <= 0 || !BLOC_BY_ID[blocId]) continue;
    total += w;
    mix.push([blocId, w]);
  }
  if (total <= 0) return null;
  for (const id of ISSUE_IDS) {
    ideal[id] = 0;
    salience[id] = 0;
  }
  for (const [blocId, w] of mix) {
    const bloc = BLOC_BY_ID[blocId];
    for (const id of ISSUE_IDS) {
      ideal[id] += ((bloc.ideal[id] ?? 0) * w) / total;
      salience[id] += ((bloc.salience[id] ?? DEFAULT_SALIENCE) * w) / total;
    }
    for (const t of Object.keys(traits)) traits[t] += ((bloc.traits[t] ?? 1) * w) / total;
  }
  for (const id of ISSUE_IDS) {
    salience[id] *= ctx.natSal[id] * (region ? Math.max(0.1, 1 + (region.issueMods[id] || 0)) : 1);
  }
  return { ideal, salience, traits, mix, retro: retroScore(ctx, region, mix) };
}

// ---------- utility ----------

const lossFn = (d) => 0.5 * d * d + 0.5 * d; // d in 0..2

export function utility(ctx, group, cand, detail = false) {
  const W = ctx.W;
  const parts = detail ? { issues: {} } : null;

  // Policy distance.
  let salSum = 0;
  let loss = 0;
  let maxSal = 0;
  for (const id of ISSUE_IDS) {
    const s = group.salience[id];
    salSum += s;
    if (s > maxSal) maxSal = s;
  }
  const policyScale = (2.2 * W.policy) / (salSum || 1);
  let policy = 0;
  for (const id of ISSUE_IDS) {
    const d = Math.abs(group.ideal[id] - cand.positions[id]) / 100;
    const contrib = -group.salience[id] * lossFn(d) * policyScale;
    policy += contrib;
    if (detail) parts.issues[id] = contrib;
  }
  loss = policy;

  // Issue ownership / emphasis.
  let emphasis = 0;
  for (const f of cand.focus) {
    if (group.salience[f] === undefined) continue;
    const d = Math.abs(group.ideal[f] - cand.positions[f]) / 100;
    const e = (group.salience[f] / (maxSal || 1)) * (1 - d) * 0.35 * W.policy;
    emphasis += e;
    if (detail) parts.issues[f] = (parts.issues[f] || 0) + e;
  }

  // Valence.
  const t = group.traits;
  let valence =
    W.valence *
    (((cand.popularity - 50) / 50) * 0.4 +
      ((cand.charisma - 50) / 50) * 0.3 * t.charisma +
      ((cand.integrity - 50) / 50) * 0.25 * t.integrity) +
    ((cand.competence - 50) / 50) * 0.3 * t.competence * W.competence +
    ((cand.funds - 50) / 50) * 0.2 * t.wealth * W.money;

  // Local ties.
  let local = 0;
  if (group.region) {
    if (cand.homeRegion === group.region.id) local += 0.35;
    if (cand.campaignRegions.includes(group.region.id)) local += 0.2;
  }

  // Courting specific groups.
  let courting = 0;
  if (group.blocId) {
    if (cand.targets.includes(group.blocId)) courting += 0.45 * W.group;
    for (const tgt of cand.targets) if (group.rivals?.includes(tgt)) courting -= 0.12 * W.group;
  }

  // Record in office.
  let record = 0;
  if (cand.id === ctx.incumbentId) {
    record += group.retro * 1.2 * W.retro + 0.12 - 0.08 * ctx.leaderTerms;
    if (ctx.dip.wars > 0) record += 0.15; // rally round the flag
  } else if (ctx.incumbentParty && cand.partyId === ctx.incumbentParty) {
    record += group.retro * 0.6 * W.retro;
  } else if (ctx.gov.selection === "hereditary" && ctx.rulerDynasty && cand.dynasty === ctx.rulerDynasty) {
    record += group.retro * 0.3 * W.retro;
  }

  // Partisan loyalty and learned habits.
  let loyalty = 0;
  if (cand.partyId && group.region) {
    loyalty += (group.region.lean[cand.partyId] || 0) * 0.6 * group.loyalty * W.party;
    loyalty += (group.memory[cand.partyId] || 0) * group.loyalty * W.party;
  }

  // Kinship, legitimacy and personal opinions (council electors).
  let kin = 0;
  if (group.kinId && cand.clanId === group.kinId) kin += 0.8 * (W.kin || 0.5);
  if (group.opinions && group.opinions[cand.id]) kin += (group.opinions[cand.id] / 100) * 1.2;
  if (W.legitimacy) kin += ((cand.legitimacy - 50) / 50) * 0.5 * W.legitimacy;
  if (group.heirBonus && group.heirBonus[cand.id]) kin += group.heirBonus[cand.id];

  const total = loss + emphasis + valence + local + courting + record + loyalty + kin;
  if (!detail) return total;
  Object.assign(parts, { policy: loss, emphasis, valence, local, courting, record, loyalty, kin, total });
  return parts;
}

export const FACTOR_LABELS = {
  policy: "policy stances",
  emphasis: "campaign focus",
  valence: "personal appeal",
  local: "local ties",
  courting: "courting voter groups",
  record: "the government's record",
  loyalty: "party loyalty",
  kin: "kinship & legitimacy",
};

export function turnoutFor(ctx, group, utils, rng) {
  const gov = ctx.gov;
  if (gov.compulsory > 0) return clamp(gov.compulsory + rng.normal(0, 0.015), 0.05, 0.995);
  let max = -Infinity;
  let second = -Infinity;
  let mean = 0;
  for (const u of utils) {
    mean += u / utils.length;
    if (u > max) {
      second = max;
      max = u;
    } else if (u > second) second = u;
  }
  const engagement = clamp((max - mean) * 0.5 + (utils.length > 1 ? Math.max(0, 0.6 - (max - second)) * 0.3 : 0), 0, 1);
  let mobil = 0;
  for (const c of ctx.candidates) if (group.blocId && c.targets.includes(group.blocId)) mobil += 0.03;
  let t = group.baseTurnout * (0.82 + 0.3 * engagement) + Math.min(mobil, 0.09);
  if (group.region) t += 0.04 * ((group.region.urban ?? 0.5) - 0.5);
  if (max < -1.2) t *= 0.85; // alienation
  t += rng.normal(0, 0.03 * (group.volatility || 1));
  return clamp(t, 0.05, 0.97);
}
