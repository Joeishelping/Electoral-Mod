// Each country's newspaper: every few turns it prints what happened, how the
// leader handled it, the polls, who is rising, the economy, wars, and gossip
// about the candidates. Printed to chat and kept on the Board to re-read.

import { effectiveGov } from "../data/governments.js";
import { TRAIT_BY_ID } from "../data/traits.js";
import { surveyApproval } from "./apply.js";
import { ensureEconomy } from "./economy.js";
import { getStance } from "./diplomacy.js";

export const PAPER_EVERY = 3; // economy turns between editions

export const paperName = (nation) => nation.settings?.paperName || `The ${nation.name} Herald`;

const HEADLINE = {
  A: ["{leader} TRIUMPHS: {title} handled brilliantly", "Praise for the {leader} as {title} ends well"],
  B: ["{title} resolved - a steady hand from the {leader}", "{title}: the government delivers"],
  C: ["{title} over, but questions remain", "Mixed verdict on the {leader}'s handling of {title}"],
  D: ["{title}: too little, too late?", "Critics savage the response to {title}"],
  F: ["DISASTER: the {leader} BOTCHES {title}", "{title} spirals out of control - who is to blame?"],
};

// gossip about the people running, keyed by trait
const RUMOURS = {
  corrupt: "Sources say {name} dined with three contractors last week. Nobody will say who paid.",
  clean: "{name} returned a gift basket worth less than a loaf of bread. Rivals call it a stunt.",
  libertine: "{name} was seen leaving a party at dawn. Again.",
  devout: "{name} was spotted praying alone in the temple at midnight.",
  warhero: "Old soldiers cheered as {name} visited the veterans' hall.",
  gaffe: "{name} called the national anthem 'a bit long' on a hot microphone.",
  charismatic: "A crowd followed {name} for three streets just to shake hands.",
  mogul: "{name}'s companies posted record profits. Coincidence?",
  heir: "{name} bought a third summer house this year.",
  populist: "{name} ate lunch at a workers' canteen and the photos are everywhere.",
  elitist: "{name} asked a farmer what a 'harvest' was, witnesses claim.",
  young: "{name} out-danced everyone at a university ball.",
  elder: "{name} fell asleep during a committee meeting. Aides say it was 'deep thought'.",
  demagogue: "{name}'s latest speech left the crowd chanting - and the shopkeepers nervous.",
  green: "{name} cycled to parliament in the rain.",
  marksman: "{name} won the county shooting contest. Opponents are taking note.",
  intellectual: "{name} published a 600-page book nobody has finished.",
  outsider: "{name} still doesn't know where the parliament canteen is.",
};

const pct = (x) => `${Math.round(x * 100)}%`;

/** Writes this country's next edition. Returns the lines (also stored on nation.paper.last). */
export function writePaper(state, nation, rng) {
  const e = ensureEconomy(nation);
  const gov = effectiveGov(nation);
  const paper = (nation.paper = nation.paper || { edition: 0, turn: 0, approval: null, gdp: null });
  paper.edition++;
  const fill = (t, f) => t.replace(/\{(\w+)\}/g, (m, k) => f[k] ?? m);
  const lines = [`§6§l${paperName(nation).toUpperCase()}§r §7- edition ${paper.edition}`];

  // the headline: the most dramatic thing that ended since the last edition
  const since = (nation.record || []).filter((r) => r.turn > paper.turn);
  const drama = { F: 5, A: 4, D: 3, B: 2, C: 1 };
  const top = since.slice().sort((a, b) => (drama[b.grade] || 0) - (drama[a.grade] || 0))[0];
  const live = (nation.situations || []).filter((s) => s.status === "active" && s.kind === "situation");
  if (top) lines.push(`§f§l${fill(rng.pick(HEADLINE[top.grade] || HEADLINE.C), { leader: gov.leaderTitle.toUpperCase(), title: top.title })}`);
  else if (live.length) lines.push(`§f§l${live[0].title.toUpperCase()} GRIPS ${live[0].text.includes(nation.name) ? nation.name.toUpperCase() : "THE NATION"}`);
  else lines.push("§f§lA quiet season in the capital");
  for (const r of since.slice(0, 3)) lines.push(` §7${r.title} in ${r.cities}: §f${r.response}§7 - grade §f${r.grade}`);
  if (live.length) lines.push(` §7Still unfolding: §f${live.map((s) => s.title).slice(0, 3).join(", ")}`);

  // the polls
  const survey = surveyApproval(state, nation, rng.int(1, 1e9));
  const leader = state.persons[nation.leaderId];
  if (survey && leader) {
    const change = paper.approval === null ? "" : ` (${survey.national >= paper.approval ? "§a+" : "§c"}${Math.round((survey.national - paper.approval) * 100)}§7)`;
    lines.push(`§7Our poll: §f${pct(survey.national)}§7 approve of ${gov.leaderTitle} ${leader.name}${change}`);
    paper.approval = survey.national;
  }
  // who is rising
  const rivals = Object.values(state.persons).filter((p) => p.nationId === nation.id && p.name && p.id !== nation.leaderId);
  const star = rivals.sort((a, b) => b.popularity - a.popularity)[0];
  if (star) lines.push(`§7Rising star: §f${star.name}§7 (popularity ${star.popularity})`);

  // money
  const gdpNow = e.gdp || 0;
  if (paper.gdp) {
    const g = (gdpNow - paper.gdp) / (paper.gdp || 1);
    lines.push(`§7Economy: ${g >= 0 ? "§agrew" : "§cshrank"} ${Math.abs(Math.round(g * 1000) / 10)}%§7 · treasury ${e.treasury >= 0 ? "§a" : "§c"}${Math.round(e.treasury)}`);
  }
  paper.gdp = gdpNow;

  // the campaign
  const camp = nation.election?.campaign;
  const lastDebate = camp?.debates?.[camp.debates.length - 1];
  if (lastDebate && !nation.count) lines.push(`§7Debate: §f${state.persons[lastDebate.winner]?.name || "nobody"}§7 won "${lastDebate.title}" (${Math.round((lastDebate.snap[lastDebate.winner] || 0) * 100)}% in our snap poll)`);
  if (camp?.log?.length) lines.push(`§7On the trail: ${camp.log[0]}`);

  // the world
  const wars = Object.values(state.nations).filter((o) => o.id !== nation.id && getStance(state, nation.id, o.id) === "war");
  if (wars.length) lines.push(`§cAt war with ${wars.map((o) => o.name).join(", ")}`);

  // gossip
  const gossip = Object.values(state.persons).filter((p) => p.nationId === nation.id && p.name && (p.traits || []).some((t) => RUMOURS[t]));
  if (gossip.length) {
    const who = rng.pick(gossip);
    const t = rng.pick(who.traits.filter((x) => RUMOURS[x]));
    lines.push(`§8Rumour mill: ${fill(RUMOURS[t], { name: who.name })} §8(${TRAIT_BY_ID[t]?.name})`);
  }
  paper.turn = e.turn;
  paper.last = lines;
  return lines;
}

export const paperDue = (nation) => ensureEconomy(nation).turn - (nation.paper?.turn || 0) >= PAPER_EVERY;
