// The Board Table: list of nations and each nation's page.

import { GOVERNMENTS, GOV_BY_ID, effectiveGov } from "../data/governments.js";
import { COLORS } from "../data/names.js";
import { createNation, displayName, getPerson } from "../core/state.js";
import { resetState, stateSize } from "../core/storage.js";
import { STANCES, STANCE_BY_ID, getStance, setStance } from "../engine/diplomacy.js";
import { confirm, modal, notice } from "./forms.js";
import { announce, commit, isAdmin, loop, page, S } from "./nav.js";
import { nationSummary, regionProfile, statusLine } from "./render.js";
import { castBallot, electionControl, historyMenu, liveResults, moodMenu, pollMenu, viewResult } from "./elections.js";
import { candidatesMenu, colorOptions, countiesMenu, partiesMenu, performanceMenu, settingsMenu, termMenu } from "./setup.js";

const HELP = [
  "§lHow the Board Table works§r",
  "",
  "§61. Add a nation§r and pick its government. Every type votes AND plays out differently on election night:",
  " §eDemocracy§r - counties report live, races get called, close ones recounted.",
  " §eParliament§r - seats fill up, then live coalition talks.",
  " §eSingle-Party State§r - fast official bulletins, a secret true count, protests.",
  " §eRoyal Council§r - noble houses swear fealty; gold buys loyalty.",
  " §eClan Council§r - clans raise banners; slighted clans walk out.",
  " §eSacred Conclave§r - secret ballots, dark smoke or bright fire.",
  " §eMilitary Junta§r - garrisons pledge troops; losers may try a coup.",
  " §eGuild Oligarchy§r - wealth-weighted shares; money talks.",
  "",
  "§62. Add counties§r by type (farmland, mining hills, port...). That sets who lives there and which parties they've historically backed. Counties remember every result.",
  "",
  "§63. Add candidates§r - name them, pick main issues, ratings, groups they court and counties they campaign in.",
  "",
  "§64. Judge the term§r - performance sliders plus Issues of the Term (war, recession, scandal...).",
  "",
  "§65. Run the election§r - players vote at any Board Table; run polls during the campaign.",
  "",
  "§66. Election night§r (about 20 min) - results stream into chat with a live sidebar scoreboard. Election-day surprises, exit polls, lead changes, calls and recounts. Polls can be wrong!",
  "",
  "§7Admins: operators, or /tag <player> add electoral_admin",
].join("\n");

export function nationView(player, nation) {
  return loop(player, () => {
    const state = S();
    if (!state.nations[nation.id]) return null;
    const e = nation.election;
    const admin = isAdmin(player);
    const gov = effectiveGov(nation);
    return {
      title: nation.name,
      body: nationSummary(state, nation),
      options: [
        nation.count && { text: "§b§lLIVE RESULTS", icon: "textures/items/compass_item", run: () => liveResults(player, nation) },
        e && !nation.count && e.kind === "popular" && { text: "§2Vote", icon: "textures/items/paper", run: () => castBallot(player, nation) },
        e && !nation.count && { text: "Latest Poll", icon: "textures/items/compass_item", run: () => pollMenu(player, nation) },
        nation.history[0] && { text: "Last Results", icon: "textures/items/book_written", run: () => viewResult(player, nation, nation.history[0]) },
        nation.history.length > 1 && { text: "Past Elections", run: () => historyMenu(player, nation) },
        nation.leaderId && { text: "Public Mood", icon: "textures/items/emerald", run: () => moodMenu(player, nation) },
        nation.regions.length > 0 && {
          text: "Counties & Voters",
          icon: "textures/items/map_filled",
          run: () => loop(player, () => ({ title: "Counties", body: "§7Who lives where and what they want.", options: nation.regions.map((r) => ({ text: r.name, run: () => page(player, r.name, regionProfile(S(), nation, r)) })) })),
        },
        admin && { text: "§eRun an Election", icon: "textures/items/book_writable", run: () => electionControl(player, nation) },
        admin && { text: "§eCandidates", icon: "textures/items/name_tag", run: () => candidatesMenu(player, nation) },
        admin && { text: "§eCounties", run: () => countiesMenu(player, nation) },
        admin && gov.multiParty && { text: "§eParties", icon: "textures/items/banner_pattern", run: () => partiesMenu(player, nation) },
        admin && { text: "§eLeader Performance", icon: "textures/items/clock_item", run: () => performanceMenu(player, nation) },
        admin && { text: "§eIssues of the Term", icon: "textures/items/blaze_powder", run: () => termMenu(player, nation) },
        admin && { text: "§eNation Settings", run: () => settingsMenu(player, nation) },
      ],
    };
  });
}

async function addNation(player) {
  const state = S();
  const used = new Set(Object.values(state.nations).map((n) => n.color));
  const r = await modal(player, "Add a Nation", [
    { key: "name", type: "text", label: "Nation name §c(required)", placeholder: "Type the nation's name", value: "" },
    { key: "gov", type: "dropdown", label: GOVERNMENTS.map((g) => `§e${g.name}§r: §7${g.tagline}`).join("\n") + "\n\n§fVoting style:", options: GOVERNMENTS.map((g) => g.name) },
    { key: "color", type: "dropdown", label: "Color", options: colorOptions(), value: Math.max(0, COLORS.findIndex((c) => !used.has(c))) },
  ], "Create");
  if (!r) return;
  if (!r.name.trim()) return notice(player, "Name needed", "Give the nation a name.");
  const nation = createNation(state, { name: r.name.trim(), gov: GOVERNMENTS[r.gov].id, color: COLORS[r.color] });
  commit();
  player.sendMessage(`§aCreated ${nation.name}. Next: add counties and candidates.`);
  return nationView(player, nation);
}

// ---------- diplomacy ----------

async function setRelation(player) {
  const nations = Object.values(S().nations);
  const r = await modal(player, "Set Relation", [
    { key: "a", type: "dropdown", label: "Nation", options: nations.map((n) => n.name) },
    { key: "b", type: "dropdown", label: "and", options: nations.map((n) => n.name), value: 1 },
    { key: "stance", type: "dropdown", label: "Relation", options: STANCES.map((s) => `${s.color}${s.name}`), value: 3 },
  ], "Set");
  if (!r) return;
  const a = nations[r.a];
  const b = nations[r.b];
  if (a.id === b.id) return notice(player, "Diplomacy", "Pick two different nations.");
  const stance = STANCES[r.stance];
  setStance(S(), a.id, b.id, stance.id);
  commit();
  announce(`§6[Diplomacy]§r ${a.color}${a.name}§r and ${b.color}${b.name}§r: ${stance.color}${stance.name}`);
}

function diplomacyMenu(player) {
  return loop(player, () => {
    const state = S();
    const lines = ["§7Wars make voters care about defense and rally them behind whoever is in office. Trade pacts make trade policy matter more.", ""];
    for (const [key, stance] of Object.entries(state.relations)) {
      const [a, b] = key.split("|").map((id) => state.nations[id]);
      if (a && b) lines.push(`${a.color}${a.name}§r §7<->§r ${b.color}${b.name}§r: ${STANCE_BY_ID[stance].color}${STANCE_BY_ID[stance].name}`);
    }
    if (lines.length === 2) lines.push("§7Everyone is neutral.");
    return {
      title: "Diplomacy",
      body: lines.join("\n"),
      options: [isAdmin(player) && { text: "§eSet a Relation", run: () => setRelation(player) }],
    };
  });
}

export function openBoard(player) {
  return loop(player, () => {
    const state = S();
    const nations = Object.values(state.nations);
    const admin = isAdmin(player);
    const lines = ["§7Pick a nation to vote, see polls and results."];
    if (!nations.length) lines.push("", admin ? "§eNo nations yet - add one to start." : "§7No nations yet. Ask an admin to set one up.");
    const live = nations.filter((n) => n.election || n.count);
    if (live.length) lines.push("", ...live.map((n) => `${n.color}${n.name}§r: ${statusLine(state, n)}`));
    return {
      title: "§lBoard Table",
      body: lines.join("\n"),
      options: [
        ...nations.map((n) => {
          const leader = getPerson(state, n.leaderId);
          const tag = n.count ? " §6[COUNTING]" : n.election ? " §a[VOTING]" : "";
          return { text: `${n.color}${n.name}${tag}\n§7${GOV_BY_ID[n.gov]?.name}${leader ? ` · ${displayName(leader)}` : ""}`, run: () => nationView(player, n) };
        }),
        admin && { text: "§2+ Add a Nation", icon: "textures/items/banner_pattern", run: () => addNation(player) },
        nations.length > 1 && { text: "Diplomacy", icon: "textures/items/compass_item", run: () => diplomacyMenu(player) },
        { text: "How It Works", icon: "textures/items/book_normal", run: () => page(player, "How It Works", HELP) },
        admin && {
          text: "§7Board Data",
          run: () => loop(player, () => ({
            title: "Board Data",
            body: `§7Saved data: ${(stateSize() / 1024).toFixed(1)} KB, ${nations.length} nation(s).`,
            options: [{
              text: "§cErase Everything",
              run: async () => {
                if (!(await confirm(player, "Erase Everything", "Delete every nation, candidate and election? This cannot be undone.", "§cErase"))) return;
                resetState();
                announce("§6[Board]§r All Board Table data was erased.");
                return "back";
              },
            }],
          })),
        },
      ],
    };
  }, "Close");
}
