// Territories, economy and situations.
import test from "node:test";
import assert from "node:assert/strict";
import { newState, createNation } from "../packs/ElectoralBP/scripts/core/state.js";
import { createRng } from "../packs/ElectoralBP/scripts/core/random.js";
import { transferRegion } from "../packs/ElectoralBP/scripts/engine/territory.js";
import { ensureEconomy, runEconomyTurn, policyAppeal } from "../packs/ElectoralBP/scripts/engine/economy.js";
import { spawnSituation, spawnChance, respond, respondCounter, advanceSituations, ruleDispute, termRecord } from "../packs/ElectoralBP/scripts/engine/situations.js";
import { runNationTurn } from "../packs/ElectoralBP/scripts/engine/turns.js";
import { setStance } from "../packs/ElectoralBP/scripts/engine/diplomacy.js";
import { SCENARIOS } from "../packs/ElectoralBP/scripts/data/scenarios.js";
import { computeElection, openElection } from "../packs/ElectoralBP/scripts/engine/election.js";
import { effectiveGov } from "../packs/ElectoralBP/scripts/data/governments.js";
import { buildNation } from "./helpers.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);

function twoNations(seed = 1) {
  const s = newState();
  const { n: baza, cands } = buildNation(s, "democracy", seed, "Baza");
  const { n: gorg } = buildNation(s, "democracy", seed + 1, "Gorgonzola");
  baza.color = "§9";
  gorg.color = "§6";
  return { s, baza, gorg, cands };
}

test("a county can be handed to another country with its people", () => {
  const { s, baza, gorg } = twoNations();
  const city = baza.regions[4];
  assert.ok(transferRegion(s, city, gorg));
  assert.ok(gorg.regions.includes(city) && !baza.regions.includes(city));
  assert.ok(!transferRegion(s, city, gorg), "already theirs");
});

test("economy: taxes fill the treasury, war and debt hurt, groups notice", () => {
  const { s, baza, gorg } = twoNations();
  const rng = createRng(3);
  const e = ensureEconomy(baza);
  runEconomyTurn(s, baza, rng);
  assert.ok(e.gdp > 0 && e.treasury > 0);
  const calm = e.gdp;
  for (let i = 0; i < 6; i++) runEconomyTurn(s, baza, rng);
  setStance(s, baza.id, gorg.id, "war");
  for (let i = 0; i < 6; i++) runEconomyTurn(s, baza, rng);
  assert.ok(e.gdp < calm * 1.05, "war drags the economy");
  e.businessTax = 50;
  assert.ok(policyAppeal(baza, "capitalists") < -0.1, "business hates high business tax");
  assert.ok(policyAppeal(baza, "unions") > 0, "unions like it");
  e.alloc.military = 60;
  assert.ok(policyAppeal(baza, "military") > 0.2, "veterans love a military budget");
  const before = baza.metrics.security;
  for (let i = 0; i < 8; i++) runEconomyTurn(s, baza, rng);
  assert.ok(baza.metrics.security > before - 5, "military funding props up security");
});

test("every scenario can be spawned, answered, and resolved", () => {
  for (const tpl of SCENARIOS) {
    const { s, baza, gorg } = twoNations(4);
    baza.leaderId = Object.values(s.persons).find((p) => p.nationId === baza.id).id;
    setStance(s, baza.id, gorg.id, tpl.needs === "war" ? "war" : tpl.needs === "enemy" ? "rival" : tpl.needs === "ally" ? "alliance" : "friendly");
    const rng = createRng(7);
    const res = spawnSituation(s, baza, rng, { tplId: tpl.id });
    assert.ok(res, `${tpl.id} spawned`);
    const sit = res.sit;
    assert.doesNotMatch(sit.text, /\{|undefined/, `${tpl.id} text filled: ${sit.text}`);
    assert.doesNotMatch(sit.title, /\{|undefined/, `${tpl.id} title filled: ${sit.title}`);
    assert.equal(tpl.options.length, 3, `${tpl.id} has three options`);
    respond(s, baza, sit, 0, 5);
    for (let i = 0; i < 12 && sit.status === "active"; i++) {
      ensureEconomy(baza).turn++;
      advanceSituations(s, baza, rng);
    }
    assert.notEqual(sit.status, "active", `${tpl.id} ended`);
    if (sit.status === "ruling") {
      const d = s.disputes.find((x) => x.sitId === sit.id);
      assert.ok(d, `${tpl.id} opened a ruling`);
      ruleDispute(s, d, 0, rng);
    }
    assert.ok(baza.record.length >= 1 || sit.status === "expired", `${tpl.id} recorded`);
    for (const line of res.lines) assert.doesNotMatch(line, /undefined|NaN|\{/);
  }
});

test("scenario data only uses real groups, sliders, budget lines, county types and governments", async () => {
  const { BLOCS, REGION_TEMPLATES } = await import("../packs/ElectoralBP/scripts/data/blocs.js");
  const { METRIC_IDS } = await import("../packs/ElectoralBP/scripts/data/metrics.js");
  const { BUDGET_IDS } = await import("../packs/ElectoralBP/scripts/engine/economy.js");
  const { GOVERNMENTS } = await import("../packs/ElectoralBP/scripts/data/governments.js");
  const groups = new Set(BLOCS.map((b) => b.id));
  const types = new Set(REGION_TEMPLATES.map((t) => t.id));
  const govs = new Set(GOVERNMENTS.map((g) => g.id));
  const personKeys = new Set(["popularity", "charisma", "competence", "integrity", "funds"]);
  assert.ok(SCENARIOS.length >= 200, `plenty of scenarios (${SCENARIOS.length})`);
  for (const t of SCENARIOS) {
    for (const p of t.prefer || []) assert.ok(types.has(p), `${t.id}: county type ${p}`);
    for (const g of t.govs || []) assert.ok(govs.has(g), `${t.id}: government ${g}`);
    for (const m of Object.keys(t.metrics || {})) assert.ok(METRIC_IDS.includes(m), `${t.id}: slider ${m}`);
    for (const o of [...t.options, ...(t.counter?.options || [])]) {
      for (const g of Object.keys(o.groups)) assert.ok(groups.has(g), `${t.id}: group ${g}`);
      for (const m of Object.keys(o.fx.metrics || {})) assert.ok(METRIC_IDS.includes(m), `${t.id}: slider ${m}`);
      for (const k of Object.keys(o.fx.stock || {})) assert.ok(BUDGET_IDS.includes(k), `${t.id}: budget ${k}`);
      for (const k of [...Object.keys(o.fx.person || {}), ...Object.keys(o.fx.ruler || {})]) assert.ok(personKeys.has(k), `${t.id}: person stat ${k}`);
      if (o.fx.person) assert.ok(t.person, `${t.id}: changes a person but names none`);
    }
  }
});

test("doing nothing lets a crisis escalate and fail", () => {
  const { s, baza } = twoNations(5);
  const rng = createRng(9);
  const { sit } = spawnSituation(s, baza, rng, { tplId: "plague" });
  respond(s, baza, sit, -1, 0);
  const lines = [];
  for (let i = 0; i < 15 && sit.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    lines.push(...advanceSituations(s, baza, rng).lines);
  }
  assert.ok(sit.escalated, "it escalated");
  assert.equal(sit.grade, "F");
  assert.ok(lines.some((l) => l.includes("ESCALATION")));
});

test("Gorgonzola reacts to Baza's resource strike, and a seizure goes to a ruling", () => {
  const { s, baza, gorg } = twoNations(6);
  const rng = createRng(11);
  const { sit } = spawnSituation(s, baza, rng, { tplId: "deposit" });
  const counter = gorg.situations.find((c) => c.kind === "counter" && c.originSitId === sit.id);
  assert.ok(counter, "Gorgonzola got a counter-situation");
  const seize = 1; // "Seize the deposit"
  const lines = respondCounter(s, gorg, counter, seize, rng);
  assert.ok(lines.some((l) => l.includes("dispute")));
  const d = s.disputes.find((x) => x.status === "open" && x.kind === "contest");
  assert.ok(d && d.odds > 0 && d.odds < 1);
  const city = baza.regions.find((r) => r.id === d.regionId);
  respond(s, baza, sit, 0, 5);
  for (let i = 0; i < 8 && sit.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    advanceSituations(s, baza, rng);
  }
  assert.ok(sit.heldFx, "rewards are held until the ruling");
  ruleDispute(s, d, 1, rng); // Gorgonzola takes it
  assert.ok(gorg.regions.includes(city), "the city changed hands");
  assert.ok(sit.involvement.some((i) => i.text.includes("Gorgonzola")), "the resolution lists every side's move");
});

test("a botched crisis comes back to bite in the debate", () => {
  const { s, baza, cands } = twoNations(8);
  const rng = createRng(13);
  baza.leaderId = cands[0].id;
  const { sit } = spawnSituation(s, baza, rng, { tplId: "flood" });
  respond(s, baza, sit, -1, 0);
  for (let i = 0; i < 15 && sit.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    advanceSituations(s, baza, rng);
  }
  assert.equal(termRecord(baza)[0].grade, "F");
  let attacked = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = computeElection(s, baza, openElection(s, baza, effectiveGov(baza), { candidates: cands.map((c) => c.id) }), seed);
    if (r.dayEvents.some((e) => e.type === "attack" && e.text.includes("botched"))) attacked++;
  }
  assert.ok(attacked >= 10, `challengers attacked the record (${attacked}/20)`);
});

test("turns run the whole loop without errors", () => {
  const { s, baza, gorg } = twoNations(9);
  const rng = createRng(17);
  setStance(s, baza.id, gorg.id, "rival");
  let lines = [];
  for (let i = 0; i < 40; i++) {
    lines = lines.concat(runNationTurn(s, baza, rng, i * 1000), runNationTurn(s, gorg, rng, i * 1000));
    for (const n of [baza, gorg]) for (const sit of n.situations) if (sit.status === "active" && sit.choice === null) {
      if (sit.kind === "counter") lines.push(...respondCounter(s, n, sit, rng.int(-1, 2), rng));
      else lines.push(...respond(s, n, sit, rng.int(-1, 2), rng.int(0, 5)));
    }
    for (const d of s.disputes.filter((x) => x.status === "open")) lines.push(...ruleDispute(s, d, rng.int(0, d.choices.length - 1), rng));
  }
  for (const l of lines) assert.doesNotMatch(l, /undefined|NaN|\{city|\{other/, l);
  assert.ok(Number.isFinite(baza.economy.gdp) && Number.isFinite(baza.economy.treasury));
  assert.ok(baza.record.length + gorg.record.length > 5, "situations happened and were graded");
  JSON.stringify(s);
});

test("situations name the real counties and the other country's real cities", () => {
  const { s, baza, gorg } = twoNations(12);
  baza.regions[0].name = "Northvale";
  gorg.regions.forEach((r, i) => (r.name = ["Kesh", "Dunmar", "Orrow", "Velt", "Pyre"][i]));
  for (const tplId of ["refugees", "border_raid", "spies", "deposit"]) {
    setStance(s, baza.id, gorg.id, "rival");
    const { sit } = spawnSituation(s, baza, createRng(3), { tplId, regionIds: [baza.regions[0].id], otherId: tplId === "deposit" ? null : gorg.id });
    assert.ok(sit.text.includes("Northvale"), `${tplId}: ${sit.text}`);
    if (tplId !== "deposit") {
      assert.ok(gorg.regions.some((r) => sit.text.includes(r.name)), `${tplId} names a real Gorgonzolan city: ${sit.text}`);
      assert.ok(sit.text.includes("Gorgonzola"));
    }
  }
});

test("scenarios about people change the real candidates", () => {
  const { s, baza } = twoNations(5);
  const people = Object.values(s.persons).filter((p) => p.nationId === baza.id);
  baza.leaderId = people[0].id;
  const rng = createRng(3);
  const { sit } = spawnSituation(s, baza, rng, { tplId: "rival_scandal" });
  const rival = s.persons[sit.personId];
  assert.ok(rival && rival.id !== baza.leaderId, "a challenger, not the ruler");
  assert.ok(sit.text.includes(rival.name), `names them: ${sit.text}`);
  const before = rival.popularity;
  respond(s, baza, sit, 0, 5); // leak it to the press
  for (let i = 0; i < 12 && sit.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    advanceSituations(s, baza, rng);
  }
  assert.ok(rival.popularity < before, "the leak hurts them");
});

test("choices have consequences: ignoring a coup plot brings a coup", async () => {
  const { spawnFollowUps, optionsFor } = await import("../packs/ElectoralBP/scripts/engine/situations.js");
  const { s, baza } = twoNations(11);
  const rng = createRng(4);
  const { sit } = spawnSituation(s, baza, rng, { tplId: "coup_plot" });
  respond(s, baza, sit, -1, 0); // do nothing
  for (let i = 0; i < 15 && sit.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    advanceSituations(s, baza, rng);
  }
  assert.notEqual(sit.status, "active");
  assert.ok((baza.pending || []).some((p) => p.tpl === "coup_attempt"), "a coup is coming");
  const lines = [];
  for (let i = 0; i < 3; i++) {
    ensureEconomy(baza).turn++;
    lines.push(...spawnFollowUps(s, baza, rng));
  }
  const coup = baza.situations.find((x) => x.tpl === "coup_attempt");
  assert.ok(coup, "the coup happened");
  assert.ok(lines.some((l) => l.includes("Because of")), "chat explains why");
  assert.equal(optionsFor(coup).length, 3);
});

test("a ruler's traits draw their own trouble and unlock special choices", async () => {
  const { optionsFor, pickTemplate } = await import("../packs/ElectoralBP/scripts/engine/situations.js");
  const { s, baza } = twoNations(12);
  const ruler = Object.values(s.persons).find((p) => p.nationId === baza.id);
  baza.leaderId = ruler.id;
  ruler.traits = [];
  const plain = spawnSituation(s, baza, createRng(1), { tplId: "mutiny" }).sit;
  assert.equal(optionsFor(plain).length, 3);
  ruler.traits = ["warhero"];
  const hero = spawnSituation(s, baza, createRng(2), { tplId: "invasion", otherId: Object.keys(s.nations).find((id) => id !== baza.id) }).sit;
  assert.equal(optionsFor(hero).length, 4, "a War Hero can take personal command");
  assert.match(optionsFor(hero)[3].label, /War Hero/);
  respond(s, baza, hero, 3, 5);
  for (let i = 0; i < 12 && hero.status === "active"; i++) {
    ensureEconomy(baza).turn++;
    advanceSituations(s, baza, createRng(i));
  }
  assert.notEqual(hero.status, "active");
  // corrupt rulers attract scandals far more than clean ones
  baza.situations = [];
  const count = (traits) => {
    ruler.traits = traits;
    const rng = createRng(9);
    let n = 0;
    for (let i = 0; i < 600; i++) if (["corruption", "minister_affair", "slush_fund", "nepotism", "campaign_donor", "ghost_workers", "corrupt_judge", "vote_buying"].includes(pickTemplate(s, baza, rng)?.id)) n++;
    return n;
  };
  assert.ok(count(["corrupt"]) > count(["clean"]) * 3, "the Corrupt trait pulls in scandals");
});

test("situation pace can be set per country", async () => {
  const { s, baza } = twoNations(13);
  const e = ensureEconomy(baza);
  e.eventRate = 0;
  assert.equal(spawnChance(s, baza), 0, "off means off");
  e.eventRate = 4;
  const busy = spawnChance(s, baza);
  e.eventRate = 1;
  assert.ok(busy > spawnChance(s, baza), "chaotic is busier than calm");
});

test("each country's newspaper reports the news, polls and gossip", async () => {
  const { writePaper, paperDue, paperName } = await import("../packs/ElectoralBP/scripts/engine/newspaper.js");
  const { s, baza } = twoNations(14);
  const people = Object.values(s.persons).filter((p) => p.nationId === baza.id);
  baza.leaderId = people[0].id;
  people[1].traits = ["corrupt"];
  const rng = createRng(5);
  for (let i = 0; i < 6; i++) runNationTurn(s, baza, rng, Date.now());
  assert.ok(baza.paper?.last, "an edition was printed");
  const text = baza.paper.last.join("\n");
  assert.ok(text.includes(paperName(baza).toUpperCase()));
  assert.match(text, /approve of/);
  assert.match(text, /Rising star/);
  assert.doesNotMatch(text, /undefined|NaN|\{/);
  assert.equal(paperDue(baza), false);
  const again = writePaper(s, baza, rng);
  assert.ok(again.length >= 3);
});

test("treaties need both sides: alliances, counties, tribute and peace", async () => {
  const T = await import("../packs/ElectoralBP/scripts/engine/treaties.js");
  const { getStance } = await import("../packs/ElectoralBP/scripts/engine/diplomacy.js");
  const { s, baza, gorg } = twoNations(15);
  assert.ok(!T.treatiesFor(s, baza, gorg).some((t) => t.id === "peace"), "no peace without a war");
  const a = T.propose(s, baza, gorg, "alliance", { note: "friends?" });
  assert.equal(getStance(s, baza.id, gorg.id), "neutral", "nothing happens until they answer");
  assert.equal(T.openFor(s, gorg.id).length, 1);
  T.answer(s, a, true);
  assert.equal(getStance(s, baza.id, gorg.id), "alliance");
  const city = gorg.regions[0];
  T.answer(s, T.propose(s, baza, gorg, "demand_county", { regionId: city.id }), false);
  assert.ok(gorg.regions.includes(city), "refused - they keep it");
  T.answer(s, T.propose(s, gorg, baza, "gift_county", { regionId: city.id }), true);
  assert.ok(baza.regions.includes(city), "a gift accepted");
  ensureEconomy(gorg).treasury = 1000;
  ensureEconomy(baza).treasury = 0;
  T.answer(s, T.propose(s, baza, gorg, "tribute", { amount: 300 }), true);
  assert.equal(Math.round(ensureEconomy(baza).treasury), 300);
  setStance(s, baza.id, gorg.id, "war");
  assert.ok(!T.treatiesFor(s, baza, gorg).some((t) => t.id === "alliance"), "make peace before an alliance");
  T.answer(s, T.propose(s, gorg, baza, "peace"), true);
  assert.equal(getStance(s, baza.id, gorg.id), "tense");
  const old = T.propose(s, baza, gorg, "trade", { now: Date.now() - T.EXPIRE_MS - 1 });
  T.expireProposals(s);
  assert.equal(old.status, "expired");
});

test("debates: moves land or backfire, the winner gains, and the vote moves", async () => {
  const D = await import("../packs/ElectoralBP/scripts/engine/debates.js");
  const { s, baza, cands } = twoNations(21);
  const [a, b] = cands;
  baza.leaderId = b.id;
  b.traits = ["corrupt"];
  a.traits = ["silver"];
  a.charisma = 90;
  b.charisma = 30;
  const election = openElection(s, baza, effectiveGov(baza), { candidates: cands.map((c) => c.id) });
  const before = computeElection(s, baza, election, 99, { noDayEvents: true });
  const share = (r, c) => r.national[r.candidates.findIndex((x) => x.id === c.id)] / r.national.reduce((x, y) => x + y, 0);
  // players choose: A goes after B's character (B is corrupt) and lands a knockout
  const picks = { character: { [a.id]: { move: "character", target: b.id }, [b.id]: { move: "presidential" } }, economy: { [a.id]: { move: "knockout", target: b.id }, [b.id]: { move: "case" } } };
  let debate = null;
  for (let seed = 1; seed < 40 && (!debate || debate.winner !== a.id); seed++) {
    delete election.campaign;
    debate = D.runDebate(s, baza, election, { title: "Debate #1", cands: [a.id, b.id], topics: ["character", "economy"], mode: "play" }, (p, topic) => picks[topic][p.id], createRng(seed));
  }
  assert.equal(debate.winner, a.id, "the silver-tongued challenger wins against a corrupt incumbent");
  assert.ok(debate.script.some((l) => l.includes("the bribes")), "the attack names the weakness");
  assert.ok(debate.script.some((l) => l.includes("Snap poll")));
  const after = computeElection(s, baza, election, 99, { noDayEvents: true });
  assert.ok(share(after, a) > share(before, a), "the debate moved the vote toward the winner");
  // the AI can debate on its own
  const auto = D.runDebate(s, baza, election, { title: "Debate #2", cands: cands.map((c) => c.id), topics: ["record", "welfare", "character"], mode: "auto" }, () => null, createRng(3));
  assert.equal(auto.rounds.length, 3);
  for (const l of auto.script) assert.doesNotMatch(l, /undefined|NaN/);
  // submitted after a debate acted out live
  const sub = D.submitDebate(s, baza, election, { title: "Town Hall", cands: [a.id, b.id], topics: ["guns"] }, { [a.id]: 2, [b.id]: 9 }, b.id, createRng(4));
  assert.equal(sub.winner, b.id);
  assert.equal(D.ensureCampaign(election).debates.length, 3);
  // campaign trail: limited actions, costs money
  const funds = a.funds;
  assert.ok(D.trailAction(s, baza, election, a, "rally", { regionId: baza.regions[0].id }, createRng(5)));
  assert.equal(a.funds, funds - 10);
  for (let i = 0; i < 3; i++) D.trailAction(s, baza, election, a, "fundraiser", {}, createRng(6));
  assert.equal(D.trailLeft(election, a.id), 0);
  assert.equal(D.trailAction(s, baza, election, a, "fundraiser", {}, createRng(7)), null, "no actions left");
});
