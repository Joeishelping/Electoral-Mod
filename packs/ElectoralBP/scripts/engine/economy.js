// National economy. Every economy turn a nation's GDP is produced by its counties,
// shaped by its policy sliders, trade, war, debt, unrest and active situations.
// Taxes fill the treasury; the budget is split between Military, Infrastructure,
// Welfare, Research and Propaganda, which build up "stocks" that pay off over time.
// The economy then drives the performance sliders and how each interest group
// judges whoever is in office.

import { clamp } from "../core/random.js";
import { diplomacySummary, getStance, setStance } from "./diplomacy.js";

export const BUDGET = [
  { id: "military", name: "Military & Defense", desc: "Army strength, war outcomes, security" },
  { id: "infrastructure", name: "Infrastructure", desc: "GDP growth, trade, containing disasters" },
  { id: "welfare", name: "Welfare & Health", desc: "Public services, approval, calmer streets" },
  { id: "research", name: "Research", desc: "Long-term growth, faster crisis response" },
  { id: "propaganda", name: "Civic Propaganda", desc: "Approval and calm - at the cost of honesty" },
];
export const BUDGET_IDS = BUDGET.map((b) => b.id);

const BASE = { incomeTax: 25, businessTax: 20, tariff: 10, alloc: { military: 20, infrastructure: 25, welfare: 25, research: 15, propaganda: 15 } };

// Output per person by county type.
const PRODUCTIVITY = {
  capital: 2.5, farmland: 1.2, mining: 1.8, port: 2.2, frontier: 0.9, temple: 1.1, garrison: 1.3, market: 3.0,
  academy: 2.0, estates: 2.4, forest: 0.8, slums: 0.8, migrant: 1.2, retirement: 1.3, custom: 1.5,
};

export function defaultEconomy() {
  return {
    enabled: true,
    autoMetrics: true,
    turnMinutes: 20,
    eventRate: 2, // index into EVENT_RATES (situations.js): Normal
    nextTurnAt: null,
    turn: 0,
    treasury: null,
    gdp: 0,
    growth: 0,
    incomeTax: BASE.incomeTax,
    businessTax: BASE.businessTax,
    tariff: BASE.tariff,
    spending: 100,
    alloc: { ...BASE.alloc },
    stock: { military: 0.4, infrastructure: 0.4, welfare: 0.4, research: 0.3, propaganda: 0.3 },
    tech: 0,
    boost: 0, // lasting GDP effects from situations
    mods: {}, // short-lived performance effects from situations
    last: null,
    history: [],
  };
}

export function ensureEconomy(nation) {
  const d = defaultEconomy();
  if (!nation.economy) nation.economy = d;
  const e = nation.economy;
  for (const [k, v] of Object.entries(d)) if (e[k] === undefined) e[k] = v;
  for (const k of ["alloc", "stock"]) for (const [id, v] of Object.entries(d[k])) if (e[k][id] === undefined) e[k][id] = v;
  return e;
}

export function regionOutput(region, drag = 0) {
  const prod = PRODUCTIVITY[region.template] ?? 1.5;
  return region.population * prod * Math.sqrt(Math.max(5, region.wealth) / 50) * 10 * clamp(1 - drag, 0.2, 1);
}

export function tradePartners(state, nation) {
  const d = diplomacySummary(state, nation.id);
  return d.trade + d.allies + d.friendly * 0.5;
}

export const money = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}k` : `${Math.round(a)}`;
  return `${v < 0 ? "-" : ""}$${s}`;
};

const STEP_DOWN = { alliance: "trade", trade: "friendly", friendly: "neutral" };

/**
 * One economy turn. `situ` = { cost, regionDrag: {regionId: 0..1}, metrics: {metric: -x} }
 * from the situations engine. Returns news lines.
 */
export function runEconomyTurn(state, nation, rng, situ = { cost: 0, regionDrag: {}, metrics: {} }) {
  const e = ensureEconomy(nation);
  const lines = [];
  const tag = `${nation.color}[${nation.name}]§r`;
  const dip = diplomacySummary(state, nation.id);
  const partners = tradePartners(state, nation);
  const st = e.stock;
  const potential = nation.regions.reduce((s, r) => s + regionOutput(r, situ.regionDrag[r.id] || 0), 0);
  const avgUnrest = nation.regions.length ? nation.regions.reduce((s, r) => s + (r.unrest || 0), 0) / nation.regions.length : 0;
  const prevGdp = e.gdp || 0;
  const debtRatio = prevGdp ? Math.max(0, -(e.treasury || 0)) / prevGdp : 0;

  const mult =
    (0.85 + 0.3 * st.infrastructure) *
    (1 + 0.03 * e.tech) *
    (1 - (0.4 * Math.max(0, e.incomeTax - 25)) / 100 - (0.5 * Math.max(0, e.businessTax - 20)) / 100 + (0.15 * Math.max(0, 20 - e.businessTax)) / 100) *
    (1 + 0.03 * partners * (1 - e.tariff / 50)) *
    (1 - 0.07 * dip.wars * (1 - 0.5 * st.military)) *
    (1 - avgUnrest / 300) *
    (1 - 0.04 * Math.max(0, debtRatio - 0.5)) *
    (1 + e.boost) *
    (1 + rng.normal(0, 0.015));
  const target = potential * Math.max(0.2, mult);
  const gdp = prevGdp ? prevGdp * 0.5 + target * 0.5 : target;
  if (e.treasury === null) e.treasury = gdp * 0.1; // starting reserves
  const growth = prevGdp ? gdp / prevGdp - 1 : 0;

  const taxRevenue = gdp * ((0.5 * e.incomeTax) / 100 + (0.35 * e.businessTax) / 100) * (0.8 + 0.2 * st.infrastructure);
  const tariffRevenue = gdp * (e.tariff / 100) * 0.12 * Math.min(1.3, 0.4 + 0.15 * partners);
  const revenue = taxRevenue + tariffRevenue;
  const spending = revenue * (e.spending / 100);
  const interest = Math.max(0, -e.treasury) * 0.02;
  const warCost = dip.wars * gdp * 0.02;
  e.treasury += revenue - spending - (situ.cost || 0) - interest - warCost;

  // budget stocks build up (or decay) toward what is being funded
  const spendRatio = gdp ? spending / gdp : 0;
  const allocTotal = Object.values(e.alloc).reduce((a, b) => a + b, 0) || 1;
  for (const id of Object.keys(st)) {
    const t = clamp(((e.alloc[id] || 0) / allocTotal) * spendRatio * 8, 0, 1);
    st[id] = clamp(st[id] + (t - st[id]) * 0.3, 0, 1);
  }
  st.military = clamp(st.military - 0.03 * dip.wars, 0, 1);
  e.tech += st.research * 0.2;
  e.boost *= 0.92;

  // high tariffs strain trade partners
  if (e.tariff > 30) {
    for (const other of Object.values(state.nations)) {
      if (other.id === nation.id) continue;
      const s = getStance(state, nation.id, other.id);
      if (STEP_DOWN[s] && s !== "alliance" && rng.chance((0.1 * (e.tariff - 30)) / 20)) {
        setStance(state, nation.id, other.id, STEP_DOWN[s]);
        lines.push(`${tag} §6${other.name} is angered by ${nation.name}'s tariffs. Relations cool to ${STEP_DOWN[s]}.`);
      }
    }
  }

  // unrest follows taxes, welfare, propaganda and debt
  const unrestDelta = (e.incomeTax - 30) / 10 + (e.businessTax - 35) / 20 - st.welfare * 3 - st.propaganda * 2 + Math.max(0, debtRatio - 1) * 3 + (growth < -0.03 ? 3 : 0);
  for (const r of nation.regions) r.unrest = clamp(Math.round((r.unrest || 0) + unrestDelta * 0.5), 0, 100);

  // performance sliders follow the economy
  for (const [k, v] of Object.entries(e.mods)) {
    e.mods[k] = v * 0.8;
    if (Math.abs(e.mods[k]) < 0.5) delete e.mods[k];
  }
  if (e.autoMetrics) {
    const g = growth * 100;
    const targets = {
      economy: 50 + g * 6 - debtRatio * 10,
      jobs: 50 + g * 4 + (st.welfare - 0.4) * 25 + (st.infrastructure - 0.4) * 15,
      security: 30 + st.military * 55 - dip.wars * 8,
      services: 20 + st.welfare * 40 + st.infrastructure * 30,
      food: 55,
      integrity: 70 - st.propaganda * 35,
    };
    for (const [m, t] of Object.entries(targets)) {
      const goal = clamp(t + (e.mods[m] || 0) + (situ.metrics[m] || 0), 0, 100);
      nation.metrics[m] = Math.round(clamp((nation.metrics[m] ?? 50) * 0.5 + goal * 0.5, 0, 100));
    }
  }

  e.gdp = gdp;
  e.growth = growth;
  e.turn++;
  e.last = { revenue, taxRevenue, tariffRevenue, spending, crisis: situ.cost || 0, interest, warCost, potential };
  e.history.push({ turn: e.turn, gdp: Math.round(gdp), treasury: Math.round(e.treasury), growth: Math.round(growth * 1000) / 10 });
  if (e.history.length > 16) e.history.shift();

  if (growth <= -0.04) lines.push(`${tag} §cThe economy is shrinking (${(growth * 100).toFixed(1)}% this turn).`);
  else if (growth >= 0.04) lines.push(`${tag} §aThe economy is booming (+${(growth * 100).toFixed(1)}% this turn).`);
  if (e.treasury < -gdp * 1.5) lines.push(`${tag} §4The treasury is drowning in debt. Crises can no longer be funded properly.`);
  return lines;
}

/** Can the nation still pay for crisis responses? */
export function isBroke(nation) {
  const e = nation.economy;
  return !!e && e.gdp > 0 && e.treasury < -e.gdp * 1.5;
}

// How each interest group feels about the government's fiscal choices (-0.6..0.6).
const POLICY_TASTES = {
  capitalists: { businessTax: -0.25, incomeTax: -0.08, tariff: -0.1, welfare: -0.08, infrastructure: 0.05 },
  wealthy: { incomeTax: -0.2, businessTax: -0.15, welfare: -0.1 },
  middle: { incomeTax: -0.15, infrastructure: 0.08, welfare: 0.03 },
  poor: { welfare: 0.25, incomeTax: 0.05, businessTax: 0.08 },
  unions: { businessTax: 0.1, welfare: 0.12, tariff: 0.12, infrastructure: 0.08 },
  workers: { tariff: 0.18, infrastructure: 0.12 },
  farmers: { tariff: 0.15 },
  merchants: { tariff: -0.25, businessTax: -0.1, infrastructure: 0.08 },
  retirees: { welfare: 0.18 },
  military: { military: 0.3 },
  patriots: { military: 0.15, propaganda: 0.1, tariff: 0.08 },
  progressives: { welfare: 0.1, research: 0.12, military: -0.1, propaganda: -0.1 },
  greens: { research: 0.1, infrastructure: -0.05 },
  youth: { research: 0.12, propaganda: -0.08 },
  libertarians: { incomeTax: -0.12, businessTax: -0.08, propaganda: -0.2, military: -0.05 },
  immigrants: { welfare: 0.12 },
  religious: { propaganda: 0.03 },
  gunowners: { incomeTax: -0.05 },
};

export function policyAppeal(nation, blocId) {
  const e = nation.economy;
  const tastes = POLICY_TASTES[blocId];
  if (!e || !e.enabled || !tastes) return 0;
  const total = Object.values(e.alloc).reduce((a, b) => a + b, 0) || 1;
  const dev = {
    incomeTax: (e.incomeTax - BASE.incomeTax) / 25,
    businessTax: (e.businessTax - BASE.businessTax) / 20,
    tariff: (e.tariff - BASE.tariff) / 20,
  };
  for (const id of BUDGET_IDS) dev[id] = ((e.alloc[id] / total) * 100 - BASE.alloc[id]) / BASE.alloc[id];
  let v = 0;
  for (const [k, c] of Object.entries(tastes)) v += c * clamp(dev[k] || 0, -1.5, 2);
  return clamp(v, -0.6, 0.6);
}
