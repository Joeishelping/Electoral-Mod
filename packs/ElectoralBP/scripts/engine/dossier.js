// Interest-group opinions with reasons, Democracy-game style: for any person,
// how much each group likes them and WHY ("+ Gun Rights", "- Devout").

import { BLOC_BY_ID } from "../data/blocs.js";
import { ISSUE_BY_ID, ISSUE_IDS } from "../data/issues.js";
import { TRAIT_BY_ID } from "../data/traits.js";
import { getPerson } from "../core/state.js";
import { clamp, sigmoid } from "../core/random.js";
import { buildContext, buildGroups, utility } from "./model.js";

const lossFn = (d) => 0.5 * d * d + 0.5 * d;

export function groupOpinions(state, nation, personId) {
  const person = getPerson(state, personId);
  if (!person) return [];
  const ctx = buildContext(state, nation, [personId]);
  ctx.gov = { ...ctx.gov, electorate: null, wealthWeighted: false }; // the whole public
  const groups = buildGroups(ctx);
  const agg = {};
  let popTotal = 0;
  for (const g of groups) {
    const parts = utility(ctx, g, person, true);
    const a = (agg[g.blocId] = agg[g.blocId] || { voters: 0, u: 0, reasons: {} });
    a.voters += g.voters;
    a.u += parts.total * g.voters;
    popTotal += g.voters;
    const add = (key, v) => (a.reasons[key] = (a.reasons[key] || 0) + v * g.voters);
    // policy: how much closer than a centrist the person is to this group
    let salSum = 0;
    for (const id of ISSUE_IDS) salSum += g.salience[id];
    const scale = (2.2 * ctx.W.policy) / (salSum || 1);
    for (const id of ISSUE_IDS) {
      const vs = g.salience[id] * scale * (lossFn(Math.abs(g.ideal[id]) / 100) - lossFn(Math.abs(g.ideal[id] - person.positions[id]) / 100));
      if (Math.abs(vs) > 0.001) add(`issue:${id}`, vs);
    }
    for (const [t, v] of Object.entries(parts.traits || {})) add(`trait:${t}`, v);
    for (const k of ["mate", "backers", "courting", "record", "loyalty", "local"]) if (parts[k]) add(k, parts[k]);
    add("valence", parts.valence);
  }
  const label = (key) => {
    const [kind, id] = key.split(":");
    if (kind === "issue") {
      const i = ISSUE_BY_ID[id];
      const side = person.positions[id] < 0 ? i.low : i.high;
      return side;
    }
    if (kind === "trait") return TRAIT_BY_ID[id]?.name || id;
    return {
      mate: `Running mate ${getPerson(state, person.runningMateId)?.name || ""}`.trim(),
      backers: "Their lobby backers",
      courting: "Courting them",
      record: "Record in office",
      loyalty: "Party loyalty",
      local: "Local ties",
      valence: "Personal appeal",
    }[kind];
  };
  return Object.entries(agg)
    .map(([blocId, a]) => {
      const u = a.u / a.voters;
      const reasons = Object.entries(a.reasons)
        .map(([k, v]) => [k, v / a.voters])
        .filter(([k, v]) => Math.abs(v) >= (k.startsWith("trait:") ? 0.1 : 0.04))
        .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
        .slice(0, 4)
        .map(([k, v]) => ({ text: label(k), value: v }));
      return {
        blocId,
        name: BLOC_BY_ID[blocId].name,
        share: a.voters / (popTotal || 1),
        approval: clamp(sigmoid(1.6 * (u + 0.55)), 0.01, 0.99),
        reasons,
      };
    })
    .sort((x, y) => y.share - x.share);
}
