// Situations, counter-moves, the record of how crises were handled, and the
// admin's dispute rulings.

import { SCENARIOS, SCENARIO_BY_ID, DO_NOTHING, fill } from "../data/scenarios.js";
import { getRegion } from "../core/state.js";
import { createRng } from "../core/random.js";
import { money } from "../engine/economy.js";
import { optionLabel, optionsFor, respond, respondCounter, responseCost, ruleDispute, rollDispute, spawnSituation } from "../engine/situations.js";
import { bar, modal, notice, pct } from "./forms.js";
import { announce, canRun, commit, isAdmin, loop, page, S } from "./nav.js";

const rng = () => createRng(Math.floor(Math.random() * 2 ** 31));
const SEV = ["§aMinor", "§aMinor", "§eSerious", "§6Severe", "§cCritical", "§4Catastrophic"];

function cityNames(nation, ids) {
  return ids.map((id) => getRegion(nation, id)?.name).filter(Boolean).join(", ") || "-";
}

export function activeCount(nation) {
  return (nation.situations || []).filter((s) => s.status === "active" && (s.kind === "counter" ? s.choice === null : true)).length;
}

export function situationsMenu(player, nation) {
  return loop(player, () => {
    const state = S();
    if (!state.nations[nation.id]) return null;
    const list = (nation.situations || []).filter((s) => s.status === "active" || s.status === "ruling");
    const ended = (nation.situations || []).filter((s) => s.status !== "active" && s.status !== "ruling").slice(0, 6);
    const lines = [list.length ? "§7Pick one to see what's happening and choose how to handle it." : "§7Nothing is happening right now."];
    if (ended.length) lines.push("", "§6Recently ended", ...ended.map((s) => ` §7${s.title} - ${s.grade ? `grade §f${s.grade}` : s.status}`));
    return {
      title: `${nation.name}: Situations`,
      body: lines.join("\n"),
      options: [
        ...list.map((s) => {
          const tpl = SCENARIO_BY_ID[s.tpl];
          const head = s.kind === "counter" ? `§b${s.title}` : tpl?.kind === "opportunity" ? `§a${s.title}` : `§c${s.title}`;
          const sub = s.status === "ruling" ? "§6awaiting a ruling" : s.kind === "counter" ? (s.choice === null ? "§eyour move" : "decided") : s.choice === null ? "§eno response yet" : `${optionLabel(state, s, s.choice).slice(0, 28)}`;
          const where = s.kind === "counter" ? state.nations[s.originNationId]?.name || "" : cityNames(nation, s.regionIds);
          return { text: `${head.slice(0, 60)}\n${`§7${where} · ${sub}`.slice(0, 62)}`, run: () => situationPage(player, nation, s) };
        }),
        { text: "Crisis Record", run: () => recordPage(player, nation) },
        isAdmin(player) && { text: "§eTrigger a Situation", run: () => trigger(player, nation) },
      ],
    };
  });
}

export function situationPage(player, nation, sit) {
  return loop(player, () => {
    const state = S();
    if (!(nation.situations || []).includes(sit)) return null;
    const tpl = SCENARIO_BY_ID[sit.tpl];
    const opts = optionsFor(sit);
    const manage = canRun(player, nation);
    const lines = [`§l${sit.title}§r`, `§f${sit.text}`, ""];
    if (sit.kind === "counter") {
      lines.push(`§7How will ${nation.name} react? Decide before the deadline or it counts as doing nothing.`);
    } else {
      lines.push(`§7Where: §f${cityNames(nation, sit.regionIds)}${sit.otherId ? `§7 · involving §f${state.nations[sit.otherId]?.name || "?"}` : ""}`);
      if (tpl.kind === "crisis") lines.push(`§7Severity: ${SEV[Math.round(sit.severity)] || "§c?"} ${bar(sit.severity / 5, 10, "§c")}`);
      lines.push(`§7Progress: ${bar(Math.min(1, sit.progress / 100), 16, "§a")} §f${Math.round(Math.min(100, sit.progress))}%`);
      lines.push(`§7Response: §e${sit.choice === null ? "none yet" : optionLabel(state, sit, sit.choice)}§7 · priority §f${sit.priority}/5 · costs §c${money(responseCost(nation, sit))}§7 per turn`);
      if (tpl.kind === "crisis") lines.push("§8Neglected crises grow, escalate and can spread to neighbouring cities.");
      else lines.push("§8Opportunities expire if not acted on within a few turns.");
      if (sit.involvement.length) lines.push("", "§6Other countries", ...sit.involvement.map((i) => ` §7${i.text}`));
      const pending = sit.counters.filter((c) => state.nations[c.nationId]?.situations?.find((x) => x.id === c.sitId)?.choice === null);
      if (pending.length) lines.push(`§7Still deciding: ${pending.map((c) => state.nations[c.nationId]?.name).join(", ")}`);
    }
    lines.push("", "§6Options");
    opts.forEach((o, i) => lines.push(` §e${optionLabel(state, sit, i)}§7 - ${fill(o.desc, { city: cityNames(state.nations[sit.originNationId] || nation, sit.regionIds), origin: state.nations[sit.originNationId]?.name || "" })}`));
    lines.push(` §e${DO_NOTHING.label}§7 - ${DO_NOTHING.desc}`);
    if (sit.status === "ruling") lines.push("", "§6This one needs an admin's ruling (see Disputes on the Board Table).");
    const open = sit.status === "active" && manage;
    return {
      title: sit.title.slice(0, 40),
      body: lines.join("\n"),
      options: [
        open && sit.kind === "situation" && { text: "§2Choose Response & Priority", run: () => chooseResponse(player, nation, sit) },
        open && sit.kind === "counter" && sit.choice === null && { text: "§2Choose Our Move", run: () => chooseCounter(player, nation, sit) },
      ],
    };
  });
}

async function chooseResponse(player, nation, sit) {
  const state = S();
  const opts = optionsFor(sit);
  const labels = [...opts.map((_, i) => optionLabel(state, sit, i).slice(0, 60)), DO_NOTHING.label];
  const per = responseCost(nation, sit, sit.choice >= 0 ? sit.choice : 0, 1);
  const r = await modal(player, "Response", [
    { key: "o", type: "dropdown", label: "How will you handle it?", options: labels, value: sit.choice === null ? 0 : sit.choice === -1 ? opts.length : sit.choice },
    { key: "p", type: "slider", label: `Priority 0-5: higher is faster and stops escalation, but costs about ${money(per)} per level each turn`, min: 0, max: 5, value: sit.priority || 3 },
  ], "Decide");
  if (!r) return;
  const choice = r.o >= opts.length ? -1 : r.o;
  respond(state, nation, sit, choice, r.p).forEach(announce);
  commit();
}

async function chooseCounter(player, nation, sit) {
  const state = S();
  const opts = optionsFor(sit);
  const labels = [...opts.map((_, i) => optionLabel(state, sit, i).slice(0, 60)), DO_NOTHING.label];
  const r = await modal(player, "Our Move", [{ key: "o", type: "dropdown", label: "What will we do?", options: labels }], "Decide");
  if (!r) return;
  respondCounter(state, nation, sit, r.o >= opts.length ? -1 : r.o, rng()).forEach(announce);
  commit();
}

function recordPage(player, nation) {
  const state = S();
  const rec = nation.record || [];
  const lines = ["§7How this nation handled its situations. Challengers bring up bad grades in debates; good ones help the incumbent.", ""];
  for (const r of rec.slice(0, 20)) {
    const leader = state.persons[r.leaderId]?.name;
    lines.push(`§l${r.grade}§r §f${r.title}§7 in ${r.cities} - ${r.response}${leader ? ` §8(under ${leader})` : ""}`);
    for (const t of r.involvement || []) lines.push(`   §8${t}`);
  }
  if (!rec.length) lines.push("§7Nothing on record yet.");
  return page(player, "Crisis Record", lines.join("\n"));
}

async function trigger(player, nation) {
  const state = S();
  if (!nation.regions.length) return notice(player, "Trigger", "This nation has no cities yet.");
  const others = Object.values(state.nations).filter((n) => n.id !== nation.id);
  const r = await modal(player, "Trigger a Situation", [
    { key: "t", type: "dropdown", label: "Which situation?", options: ["(random)", ...SCENARIOS.map((s) => `${s.cat}: ${s.title}`)] },
    { key: "c", type: "dropdown", label: "Where?", options: ["(pick for me)", ...nation.regions.map((x) => x.name)] },
    { key: "o", type: "dropdown", label: "Other country involved (if the situation needs one)", options: ["(pick for me)", ...others.map((x) => x.name)] },
  ], "Trigger");
  if (!r) return;
  const res = spawnSituation(state, nation, rng(), {
    tplId: r.t ? SCENARIOS[r.t - 1].id : null,
    regionIds: r.c ? [nation.regions[r.c - 1].id] : null,
    otherId: r.o ? others[r.o - 1].id : null,
  });
  if (!res) return notice(player, "Trigger", "That situation can't happen right now (it may need a rival, ally or a war with another country).");
  commit();
  res.lines.forEach(announce);
}

// ---------- disputes (admin) ----------

export function openDisputes() {
  return (S().disputes || []).filter((d) => d.status === "open");
}

export function disputesMenu(player) {
  return loop(player, () => {
    const list = openDisputes();
    return {
      title: "Disputes & Rulings",
      body: list.length ? "§7These outcomes are up to you - pick a winner or roll using military strength." : "§7No disputes are waiting.",
      options: list.map((d) => ({ text: d.title.slice(0, 60), run: () => disputePage(player, d) })),
    };
  });
}

function disputePage(player, d) {
  return loop(player, () => {
    if (d.status !== "open") return null;
    const lines = [`§l${d.title}`, "", `§f${d.text}`];
    if (d.odds !== null && d.odds !== undefined) lines.push("", `§7Odds by military strength: §f${pct(d.odds, 0)}§7 for "${d.choices[0].label}", §f${pct(1 - d.odds, 0)}§7 for "${d.choices[1].label}".`);
    return {
      title: "Ruling",
      body: lines.join("\n"),
      options: [
        ...d.choices.map((c, i) => ({ text: c.label.slice(0, 60), run: () => { ruleDispute(S(), d, i, rng()).forEach(announce); commit(); return "back"; } })),
        d.odds !== null && d.odds !== undefined && { text: "§eRoll the Dice", run: () => { rollDispute(S(), d, rng()).forEach(announce); commit(); return "back"; } },
      ],
    };
  });
}
