// The campaign menu: debates (played move by move, by the AI, or submitted after
// a debate acted out live) and the campaign trail.

import { system, world } from "@minecraft/server";
import { BLOCS } from "../data/blocs.js";
import { ISSUES } from "../data/issues.js";
import { createRng } from "../core/random.js";
import { ensureCampaign, MAX_TRAIL, MOVES, runDebate, submitDebate, TOPICS, TOPIC_BY_ID, trailAction, trailLeft, TRAIL } from "../engine/debates.js";
import { modal, notice } from "./forms.js";
import { announce, canRun, commit, loop, page, S } from "./nav.js";

const rng = () => createRng(Math.floor(Math.random() * 2 ** 31));
const LINE_TICKS = 70; // a debate plays out in chat, one line every 3.5 seconds

function playInChat(lines, live) {
  if (!live) return lines.forEach(announce);
  lines.forEach((l, i) => system.runTimeout(() => announce(l), i * LINE_TICKS));
}

export function campaignMenu(player, nation) {
  return loop(player, () => {
    const state = S();
    const e = nation.election;
    if (!e || nation.count) return null;
    const camp = ensureCampaign(e);
    const manage = canRun(player, nation);
    const people = e.candidates.map((id) => state.persons[id]).filter(Boolean);
    const lines = [`§7${e.title}: the campaign. Debates and the campaign trail move the polls - run a poll to see.`, ""];
    lines.push(camp.debates.length ? "§6Debates" : "§7No debates yet.");
    for (const d of camp.debates) lines.push(` §f${d.title}§7 - won by §f${state.persons[d.winner]?.name || "?"}`);
    lines.push("", "§6Campaign trail §7(actions left)");
    for (const p of people) lines.push(` §f${p.name}§7: ${trailLeft(e, p.id)}/${MAX_TRAIL} · war chest ${p.funds ?? 50}`);
    if (camp.log.length) lines.push("", "§6Lately", ...camp.log.slice(0, 5).map((l) => ` §7${l}`));
    return {
      title: "Campaign",
      body: lines.join("\n"),
      options: [
        manage && people.length > 1 && { text: "§2Hold a Debate", run: () => holdDebate(player, nation) },
        manage && { text: "Campaign Trail", run: () => trailMenu(player, nation) },
        ...camp.debates.slice().reverse().map((d) => ({ text: `Transcript: ${d.title}`.slice(0, 60), run: () => page(player, d.title.slice(0, 40), d.script.join("\n")) })),
      ],
    };
  });
}

async function holdDebate(player, nation) {
  const state = S();
  const e = nation.election;
  const people = e.candidates.map((id) => state.persons[id]).filter(Boolean);
  const n = ensureCampaign(e).debates.length + 1;
  const topicNames = ["(none)", ...TOPICS.map((t) => t.name)];
  const r = await modal(player, "Hold a Debate", [
    { key: "title", type: "text", label: "Name of the debate", value: `Debate #${n}` },
    ...people.slice(0, 6).map((p, i) => ({ key: `c${i}`, type: "toggle", label: `${p.name} takes part`, value: i < 4 })),
    { key: "t0", type: "dropdown", label: "Round 1 topic", options: topicNames, value: 1 },
    { key: "t1", type: "dropdown", label: "Round 2 topic", options: topicNames, value: TOPICS.findIndex((t) => t.id === "record") + 1 },
    { key: "t2", type: "dropdown", label: "Round 3 topic", options: topicNames, value: TOPICS.findIndex((t) => t.id === "character") + 1 },
    { key: "mode", type: "dropdown", label: "How does it go?", options: ["Play it out - choose every move", "Let the AI debate", "Submit results (acted out live)"] },
    { key: "live", type: "toggle", label: "Play it out in chat line by line (otherwise all at once)", value: true },
  ], "Next");
  if (!r) return;
  const cands = people.slice(0, 6).filter((_, i) => r[`c${i}`]).map((p) => p.id);
  if (cands.length < 2) return notice(player, "Debate", "A debate needs at least two candidates.");
  const topics = [r.t0, r.t1, r.t2].filter((x) => x > 0).map((x) => TOPICS[x - 1].id);
  if (!topics.length) return notice(player, "Debate", "Pick at least one topic.");
  const cfg = { title: (r.title || `Debate #${n}`).trim().slice(0, 40), cands, topics, mode: ["play", "auto", "submit"][r.mode] };
  let debate;
  if (cfg.mode === "submit") {
    const ppl = cands.map((id) => state.persons[id]);
    const s = await modal(player, "Debate Results", [
      ...ppl.map((p) => ({ key: p.id, type: "slider", label: `${p.name}'s performance (0 = disaster, 10 = brilliant)`, min: 0, max: 10, value: 5 })),
      { key: "w", type: "dropdown", label: "Who won?", options: ["(nobody clearly)", ...ppl.map((p) => p.name)] },
    ], "Submit");
    if (!s) return;
    debate = submitDebate(state, nation, e, cfg, Object.fromEntries(ppl.map((p) => [p.id, s[p.id]])), s.w ? ppl[s.w - 1].id : null, rng());
  } else {
    const picks = {};
    if (cfg.mode === "play") {
      // round by round: candidates played by someone online choose their own move
      // on their own screen; the host chooses for the rest
      for (const topic of topics) {
        const asks = cands.map(async (id) => {
          const me = state.persons[id];
          const others = cands.filter((x) => x !== id).map((x) => state.persons[x]);
          const owner = me.player && world.getPlayers().find((p) => p.name.toLowerCase() === me.player.toLowerCase() && p.id !== player.id);
          return [id, owner ? await withTimeout(askMove(owner, me, others, topic), 60000) : undefined, others, me];
        });
        const answers = await Promise.all(asks);
        for (const [id, pick, others, me] of answers) {
          if (pick !== undefined) {
            picks[`${topic}:${id}`] = pick;
            continue;
          }
          const m = await askMove(player, me, others, topic);
          if (m === false) return;
          picks[`${topic}:${id}`] = m;
        }
      }
    }
    debate = runDebate(state, nation, e, cfg, (p, topic) => picks[`${topic}:${p.id}`] || null, rng());
  }
  commit();
  playInChat(debate.script, r.live);
}

/** Asks one player for a candidate's move. Returns a move, null (AI picks) or false (cancelled). */
async function askMove(who, me, others, topic) {
  const m = await modal(who, `${TOPIC_BY_ID[topic].name}: ${me.name}`.slice(0, 40), [
    { key: "move", type: "dropdown", label: `Debate round on ${TOPIC_BY_ID[topic].name}. What does ${me.name} do?`, options: ["(let the AI choose)", ...MOVES.map((x) => x.name)] },
    { key: "target", type: "dropdown", label: "Aimed at (for attacks)", options: others.map((o) => o.name) },
    { key: "issue", type: "dropdown", label: "Pivot to (if pivoting)", options: ISSUES.map((i) => i.name) },
  ], "Next");
  if (!m) return false;
  return m.move ? { move: MOVES[m.move - 1].id, target: others[m.target]?.id, issue: ISSUES[m.issue].id } : null;
}

/** A player who doesn't answer in time gets the AI's move. */
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    system.runTimeout(() => !done && ((done = true), resolve(null)), Math.round(ms / 50));
    promise.then((v) => !done && ((done = true), resolve(v === false ? null : v)));
  });
}

function trailMenu(player, nation) {
  return loop(player, () => {
    const state = S();
    const e = nation.election;
    if (!e || nation.count) return null;
    const people = e.candidates.map((id) => state.persons[id]).filter(Boolean);
    return {
      title: "Campaign Trail",
      body: `§7Each candidate gets ${MAX_TRAIL} actions this campaign. Rallies, ads and courting cost from the war chest; fundraisers refill it.\n\n${TRAIL.map((t) => `§f${t.name}§7 - ${t.desc}`).join("\n")}`,
      options: people.map((p) => ({ text: `${p.name}\n§7${trailLeft(e, p.id)} actions left · war chest ${p.funds ?? 50}`, run: () => trailFor(player, nation, p) })),
    };
  });
}

async function trailFor(player, nation, person) {
  const state = S();
  const e = nation.election;
  if (trailLeft(e, person.id) <= 0) return notice(player, "Campaign Trail", `${person.name} has used every campaign action.`);
  const others = e.candidates.filter((id) => id !== person.id).map((id) => state.persons[id]).filter(Boolean);
  const r = await modal(player, person.name.slice(0, 40), [
    { key: "a", type: "dropdown", label: "What do they do?", options: TRAIL.map((t) => `${t.name}${t.funds ? ` (${t.funds > 0 ? "+" : ""}${t.funds} funds)` : ""}`) },
    { key: "region", type: "dropdown", label: "Where (for a rally)", options: nation.regions.map((x) => x.name) },
    { key: "issue", type: "dropdown", label: "On which issue (for ads)", options: ISSUES.map((i) => i.name) },
    { key: "target", type: "dropdown", label: "Against whom (for attack ads)", options: others.length ? others.map((o) => o.name) : ["(nobody)"] },
    { key: "bloc", type: "dropdown", label: "Which group (for courting)", options: BLOCS.map((b) => b.name) },
  ], "Go");
  if (!r) return;
  const t = TRAIL[r.a];
  const out = trailAction(state, nation, e, person, t.id, { regionId: nation.regions[r.region]?.id, issue: ISSUES[r.issue].id, target: others[r.target]?.id, blocId: BLOCS[r.bloc].id }, rng());
  if (!out) return notice(player, "Campaign Trail", "That couldn't be done.");
  commit();
  out.forEach(announce);
}
