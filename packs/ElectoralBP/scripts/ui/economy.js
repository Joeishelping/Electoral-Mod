// National Economy: treasury, GDP, taxes, tariffs and the budget.

import { EVENT_RATES } from "../engine/situations.js";
import { BUDGET, ensureEconomy, money, tradePartners } from "../engine/economy.js";
import { runNationTurn } from "../engine/turns.js";
import { createRng } from "../core/random.js";
import { bar, modal, pct } from "./forms.js";
import { announce, canRun, commit, isAdmin, loop, S } from "./nav.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);

function sparkline(history) {
  if (history.length < 2) return "§7(not enough turns yet)";
  const vals = history.map((h) => h.gdp);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const steps = ["§8_", "§7.", "§7-", "§f=", "§a#"];
  return vals.map((v) => steps[hi === lo ? 2 : Math.round(((v - lo) / (hi - lo)) * 4)]).join("");
}

export function economyPage(player, nation) {
  return loop(player, () => {
    const state = S();
    if (!state.nations[nation.id]) return null;
    const e = ensureEconomy(nation);
    const manage = canRun(player, nation);
    const last = e.last;
    const allocTotal = sum(Object.values(e.alloc)) || 1;
    const debt = e.treasury < 0;
    const next = e.nextTurnAt ? Math.max(0, Math.ceil((e.nextTurnAt - Date.now()) / 60000)) : e.turnMinutes;
    const lines = [
      `${nation.color}§l${nation.name}§r §7- National Economy · turn ${e.turn}${e.enabled ? ` · next turn in ${next} min` : " · §cpaused"}`,
      "",
      `§7Treasury: ${debt ? "§c" : "§a"}${money(e.treasury ?? 0)}${debt ? " (in debt)" : ""}`,
      `§7GDP: §f${money(e.gdp)}§7 per turn · growth ${e.growth >= 0 ? "§a+" : "§c"}${(e.growth * 100).toFixed(1)}%`,
      `§7GDP trend: ${sparkline(e.history)}`,
    ];
    if (last) {
      lines.push(`§7Last turn: income §a${money(last.revenue)}§7 (tariffs ${money(last.tariffRevenue)}) · spending §c${money(last.spending)}`);
      if (last.crisis || last.interest || last.warCost) lines.push(`§7Crisis response §c${money(last.crisis)}§7 · debt interest §c${money(last.interest)}§7 · war §c${money(last.warCost)}`);
    }
    lines.push("", "§6Taxes");
    lines.push(` §fIncome tax ${e.incomeTax}%§7 · §fBusiness tax ${e.businessTax}%§7 · §fTariffs ${e.tariff}%§7 · trade partners ${tradePartners(state, nation)}`);
    lines.push(` §fSpending level ${e.spending}%§7 of income`);
    lines.push("", "§6Budget (share -> how built-up it is)");
    for (const b of BUDGET) lines.push(` §f${b.name}§7 ${Math.round((e.alloc[b.id] / allocTotal) * 100)}% ${bar(e.stock[b.id], 12, "§b")} §8${b.desc}`);
    lines.push(`§7Research level: §f${e.tech.toFixed(1)}§7 · lasting boost from events: §f${(e.boost * 100).toFixed(1)}%`);
    lines.push("", e.autoMetrics ? "§7The economy drives the Leader Performance sliders." : "§7Leader Performance sliders are set by hand.");
    return {
      title: "Economy",
      body: lines.join("\n"),
      options: [
        manage && { text: "Taxes & Tariffs", run: () => taxes(player, nation) },
        manage && { text: "Budget Allocation", run: () => budget(player, nation) },
        isAdmin(player) && { text: "§eRun a Turn Now", run: () => turnNow(nation) },
        isAdmin(player) && { text: "§7Economy Settings", run: () => settings(player, nation) },
      ],
    };
  });
}

async function taxes(player, nation) {
  const e = ensureEconomy(nation);
  const r = await modal(player, "Taxes & Tariffs", [
    { key: "it", type: "slider", label: "Income tax % - more money, but the middle class and wealthy resent it", min: 0, max: 60, value: e.incomeTax },
    { key: "bt", type: "slider", label: "Business tax % - more money, slower growth, the Business Lobby hates it", min: 0, max: 60, value: e.businessTax },
    { key: "t", type: "slider", label: "Tariffs % - protects workers and farmers, angers merchants and trade partners", min: 0, max: 50, value: e.tariff },
    { key: "sp", type: "slider", label: "Spending level (% of income spent; over 100 runs a deficit)", min: 50, max: 150, step: 5, value: e.spending },
  ], "Set Policy");
  if (!r) return;
  e.incomeTax = r.it;
  e.businessTax = r.bt;
  e.tariff = r.t;
  e.spending = r.sp;
  commit();
}

async function budget(player, nation) {
  const e = ensureEconomy(nation);
  const total = sum(Object.values(e.alloc)) || 1;
  const r = await modal(player, "Budget Allocation", BUDGET.map((b) => ({
    key: b.id, type: "slider", label: `${b.name} §7(${b.desc})`, min: 0, max: 100, step: 5, value: Math.round((e.alloc[b.id] / total) * 100 / 5) * 5,
  })), "Set Budget");
  if (!r) return;
  const t = sum(BUDGET.map((b) => r[b.id])) || 1;
  for (const b of BUDGET) e.alloc[b.id] = Math.round((r[b.id] / t) * 100);
  commit();
  player.sendMessage(`§7Budget set: ${BUDGET.map((b) => `${b.name.split(" ")[0]} ${pct(e.alloc[b.id] / 100, 0)}`).join(", ")}`);
}

function turnNow(nation) {
  const lines = runNationTurn(S(), nation, createRng(Math.floor(Math.random() * 2 ** 31)));
  commit();
  lines.forEach(announce);
}

async function settings(player, nation) {
  const e = ensureEconomy(nation);
  const r = await modal(player, "Economy Settings", [
    { key: "on", type: "toggle", label: "Economy & situations running for this nation", value: e.enabled },
    { key: "min", type: "slider", label: "Minutes per economy turn", min: 2, max: 120, value: e.turnMinutes },
    { key: "pace", type: "dropdown", label: "How often situations strike this country", options: EVENT_RATES.map((x) => x.name), value: e.eventRate ?? 2 },
    { key: "auto", type: "toggle", label: "Economy drives the Leader Performance sliders", value: e.autoMetrics },
  ]);
  if (!r) return;
  e.enabled = r.on;
  e.turnMinutes = r.min;
  e.autoMetrics = r.auto;
  e.eventRate = r.pace;
  e.nextTurnAt = Date.now() + r.min * 60000;
  commit();
}
