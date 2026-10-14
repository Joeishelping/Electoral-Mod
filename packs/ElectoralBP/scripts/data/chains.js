// Consequences and character, CK3 style.
//
// FOLLOW_UPS only ever happen because of an earlier choice. LINKS says what leads
// to what: a choice ("2": ">martyr@70" = 70% chance after choice #3), a failure,
// or doing nothing. TRAIT_PULL makes a ruler's traits draw matching situations.
// TRAIT_OPTIONS adds a fourth choice only a ruler (or the person involved) with
// that trait can take.

import { opt, sc } from "./scenarios_more.js";

export const FOLLOW_UPS = [
  sc("libel_suit", "Campaign", "c", "{rival} Sues for Libel", "Trial of the Century", "{rival} is suing over the leaked dossier and the courts in {city} have taken the case.", "chain:1 person:rival sev:2 grow:.4 m:integrity-2", [
    "Settle quietly | Pay and move on. | $-.02 ^integrity-3",
    "Fight it in court | An admin decides who wins. | M ^integrity+3",
    "Leak even more | Double down. | ~popularity-10 ^integrity-6 progressives-1",
  ]),
  sc("martyr", "Unrest", "c", "A Martyr Is Made", "Martyr's Uprising", "Someone was killed when authorities broke up the protest in {city}. Their face is on every wall.", "chain:1 sev:3 grow:.7 spread:.4 m:security-4,integrity-3", [
    "Public inquiry | Find out what happened. | c1 integrity+3 u-6",
    "State funeral | Honour the dead, calm the living. | c.8 poor+2 u-4",
    "Ban the memorials | Stamp it out. | u+8 progressives-3 patriots+1",
  ]),
  sc("rebuild_contracts", "Scandal", "o", "Rebuilding Contracts", "", "Billions in rebuilding contracts for {city} are about to be handed out.", "chain:1", [
    "Open public tender | Fair and slow. | s.8 integrity+3 merchants+1",
    "Give them to our friends | Loyalty pays. | s1.4 ^funds+15 ^integrity-8 integrity-3 >cover_up_exposed@40",
    "Local co-ops do the work | Money stays in town. | workers+2 farmers+1 g.01",
  ]),
  sc("second_wave", "Health", "c", "Second Wave", "Unstoppable Sickness", "The disease is back in {city} - worse than before.", "chain:1 sev:3 grow:.7 spread:.5 m:services-5,jobs-3", [
    "Lockdown | Everything closes. | jobs-3 capitalists-2 services+2",
    "Mass vaccination | Every arm, every town. | c1.8 services+3",
    "Accept it and carry on | We can't stop living. | retirees-3 capitalists+1",
  ]),
  sc("black_market", "Crime", "c", "Black Market Booms", "Shadow Economy", "With prices frozen, smugglers in {city} sell everything at triple the price.", "chain:1 sev:2 grow:.5 gdp:.02 m:economy-2,integrity-2", [
    "Lift the price controls | Let markets work. | merchants+2 poor-2",
    "Raid the smugglers | Enforce the law. | c1.2 security+2",
    "Tax the black market | If you can't beat them. | $.03 integrity-2",
  ]),
  sc("union_seats", "Lobbies", "c", "Unions Want Board Seats", "Workers' Councils", "Emboldened unions in {city} now demand seats on company boards.", "chain:1 sev:2 grow:.4", [
    "Grant them | Workers in the boardroom. | unions+3 capitalists-3",
    "Advisory seats only | A voice, not a vote. | unions+1",
    "Refuse | Owners own. | unions-3 capitalists+2 >strike@50",
  ]),
  sc("cartel_revenge", "Crime", "c", "The Cartel Strikes Back", "Narco War", "After the army crackdown, cartel gunmen ambushed police in {city}.", "chain:1 sev:3 grow:.6 spread:.3 m:security-6", [
    "Total war on the cartel | No retreat. | c1.6 military+2 u+4",
    "Protect witnesses and judges | Win in court. | c1.2 integrity+3",
    "Secret truce | Peace in the streets. | integrity-6 ^integrity-8 >cover_up_exposed@50",
  ]),
  sc("cover_up_exposed", "Scandal", "c", "The Cover-Up Exposed", "Watergate Moment", "Journalists have proof that the {leader}'s people covered up what happened in {city}.", "chain:1 person:ruler sev:3 grow:.6 m:integrity-6", [
    "Resign the chief of staff | A scapegoat. | ^integrity-3 s1.3",
    "Come clean on live TV | Ask forgiveness. | ^integrity+4 ^popularity-8",
    "Attack the journalists | Fake news! | ^integrity-8 patriots+2 progressives-3 integrity-4",
  ]),
  sc("coup_attempt", "Barracks", "c", "Coup Attempt!", "Civil War", "Tanks are rolling toward the palace in {city}. The plotters have struck.", "chain:1 sev:4 grow:.6 m:security-8", [
    "Loyal troops fight back | An admin rules who wins. | M c1.6",
    "Negotiate with the plotters | Share power to survive. | military+3 integrity-5",
    "Flee to a loyal province | Live to fight another day. | ^popularity-10 security-4",
  ]),
  sc("underground_church", "Religion", "c", "Underground Church", "Faith in Revolt", "Followers of the condemned meet in secret cellars across {city}.", "chain:1 sev:2 grow:.5 spread:.3", [
    "Tolerate them | Let people pray. | religious+1 progressives+1",
    "Raid the cellars | Root out heresy. | religious-2 u+5",
    "Invite them back with amnesty | Heal the split. | religious+2 u-4",
  ]),
  sc("launch_disaster", "Science", "c", "Launch Disaster", "", "A rocket exploded on the pad near {city}.", "chain:1 sev:2 grow:.3 m:integrity-2", [
    "Investigate and try again | Science learns from failure. | c1.2 tech.3 youth+1",
    "Cancel the programme | Too dangerous. | $.04 patriots-2",
    "Blame foreign sabotage | Point fingers. | r-1 patriots+2",
  ]),
  sc("first_orbit", "Science", "o", "First in Orbit!", "", "A rocket from {city} has reached orbit. The world is watching {country}.", "chain:1", [
    "National celebration | History made! | c.6 patriots+3 youth+2 ^popularity+6",
    "Share the data with allies | Science for everyone. | ally1 tech.3",
    "Militarise it | Satellites for defence. | @military+.08 progressives-2",
  ]),
  sc("displaced_villagers", "Counties", "c", "Drowned Villages", "Dam Protests", "Families whose villages were flooded by the dam camp outside {city}'s offices.", "chain:1 sev:2 grow:.4", [
    "Generous compensation | Make it right. | c1.4 farmers+2 poor+1",
    "New towns built for them | A fresh start. | c1.6 @infrastructure+.03",
    "Move them along | Progress has victims. | farmers-3 u+5",
  ]),
  sc("lawless_camps", "Crime", "c", "Lawless Mining Camps", "Wild Frontier", "The gold camps around {city} have no law. Claim jumpers shoot each other daily.", "chain:1 sev:2 grow:.5 m:security-4", [
    "Send marshals | Bring law to the frontier. | c1.2 security+3",
    "Let them form their own councils | Frontier democracy. | libertarians+2 u-2",
    "Shut the goldfields | Too dangerous. | $-.02 gunowners-2",
  ]),
  sc("pretender", "Court", "c", "The Pretender", "War of the Pretender", "The heir passed over for succession has raised a banner in {city}.", "chain:1 sev:3 grow:.6 m:security-5", [
    "Crush the pretender | An admin rules who wins. | M c1.4",
    "Grant them a duchy | Buy them off. | $-.03 wealthy+1",
    "Exile them abroad | Out of the kingdom. | r-1",
  ]),
  sc("clan_war", "Court", "c", "Clan War", "The Burning Hills", "The feud has become open war between the clans of {city}.", "chain:1 sev:4 grow:.6 spread:.4 m:security-6,food-3", [
    "March the {leader}'s host between them | Force peace. | c1.4 military+1 u-6",
    "Back the stronger clan | End it quickly. | s1.4 u+4",
    "Call a great moot | Talk it out. | c.8 s.7 u-3",
  ]),
  sc("exiles_plot", "Party", "c", "Exiles Plot Abroad", "Government in Exile", "Purged party members have fled to {other} and are plotting a return.", "chain:1 needs:other sev:2 grow:.4 m:security-3", [
    "Demand their extradition | Send them back. | r-1",
    "Offer amnesty | Come home, all is forgiven. | integrity+2 patriots-1",
    "Send agents after them | Permanently. | integrity-6 r-2",
  ]),
  sc("draft_dodgers", "Military", "c", "Draft Dodgers", "Mass Desertion", "Thousands of young people from {city} are hiding from the draft.", "chain:1 sev:2 grow:.5 m:security-3", [
    "Amnesty and alternative service | Serve in hospitals instead. | youth+2 military-1",
    "Hunt them down | The law is the law. | youth-3 u+5",
    "Pay bonuses to volunteers | Make service attractive. | c1.4 military+1",
  ]),
  sc("luddites", "Labor", "c", "Machine Breakers", "Luddite Rising", "Out-of-work weavers in {city} are smashing factory machines at night.", "chain:1 sev:2 grow:.5 gdp:.02 m:jobs-2,security-2", [
    "Arrest the breakers | Protect property. | capitalists+2 workers-3 >martyr@30",
    "Unemployment pay | Feed them while they retrain. | c1.4 workers+2",
    "Slow the machines | A pause on automation. | workers+2 capitalists-2 tech-.2",
  ]),
  sc("press_boycott", "Media", "c", "Press Boycott", "Media War", "Journalists across {city} refuse to cover the {leader} after being blamed for the gaffe.", "chain:1 person:ruler sev:2 grow:.4 m:integrity-2", [
    "Apologise to the press | Make peace. | ^charisma+2 ^popularity-2",
    "Go around them | Speak to the people directly. | @propaganda+.05",
    "Pull their press passes | Punish them. | ^integrity-5 integrity-3",
  ]),
  sc("donor_favor", "Scandal", "c", "The Donor Wants a Favour", "Bought and Paid For", "The mystery donor wants a government contract in {city} - or they talk.", "chain:1 person:ruler sev:2 grow:.5 m:integrity-3", [
    "Give them the contract | Keep them quiet. | ^integrity-6 ^funds+5 >cover_up_exposed@40",
    "Refuse and come clean | Before they do. | ^integrity+4 ^popularity-5",
    "Find dirt on them first | Mutual destruction. | ^integrity-3 M",
  ]),
  sc("turncoat_betrays", "Campaign", "c", "The Turncoat Betrays", "", "{rival}, who switched sides, is leaking cabinet secrets from {city}.", "chain:1 person:rival sev:2 grow:.4 m:integrity-3", [
    "Fire them publicly | Cut them out. | ~popularity-12 ^popularity-3",
    "Feed them false secrets | Two can play. | ^competence+4",
    "Win them back | Everyone has a price. | $-.02 ~funds+10",
  ]),
  sc("arms_kickbacks", "Scandal", "c", "Arms Deal Kickbacks", "Weapons Scandal", "Investigators say generals took bribes on the arms deal.", "chain:1 sev:2 grow:.4 m:integrity-4", [
    "Court-martial the generals | Clean the army. | military-2 integrity+3",
    "Return the bribes quietly | Make it go away. | $.02 integrity-2",
    "Blame the dealer | Foreign crooks. | patriots+1 r-1",
  ]),
  sc("ruined_savers", "Economy", "c", "Savers Ruined", "Pitchforks at the Banks", "Families who lost everything when the banks failed are marching on {city}.", "chain:1 sev:3 grow:.6 m:economy-3,integrity-2", [
    "Compensate small savers | Protect ordinary people. | c1.6 middle+3 retirees+2",
    "Seize the bankers' assets | Make them pay. | $.04 wealthy-3 poor+2",
    "Nothing to be done | Markets are markets. | middle-3 u+6",
  ]),
  sc("orphaned_city", "Counties", "c", "{city} Feels Abandoned", "{city} Turns Its Back", "After the government did nothing, people in {city} say the capital has forgotten them.", "chain:1 sev:2 grow:.4 m:integrity-2", [
    "Visit {city} personally | Show you care. | ^popularity+5 u-6",
    "Big investment package | Money talks. | c1.6 g.01 u-6",
    "Ignore them again | They'll get over it. | u+8 >separatists@40",
  ]),
  sc("hero_rescue", "Society", "o", "Heroes of the Rescue", "", "The rescuers of {city} are national heroes after the disaster.", "chain:1", [
    "Medals for all | Honour courage. | patriots+2 ^popularity+4",
    "Fund their services | Better equipment for next time. | c1 services+3",
    "A national day of thanks | Everyone remembers. | u-4 religious+1",
  ]),
  sc("revenge_raid", "War", "c", "Revenge Raid", "Border War", "{other} answered our retaliation with a raid of their own on {city}.", "chain:1 needs:enemy sev:3 grow:.6 m:security-5", [
    "Strike back harder | No mercy. | c1.4 r-1 patriots+2",
    "Call for a ceasefire | Stop the cycle. | r1 patriots-2",
    "Dig in and defend | Hold the line. | c1.2 @military-.02",
  ]),
  sc("grateful_refugees", "Society", "o", "Grateful Newcomers", "", "Refugees who settled in {city} have opened shops and filled job vacancies.", "chain:1", [
    "Celebrate them | A story of welcome. | immigrants+3 g.02 patriots-1",
    "Fast-track citizenship | Make it official. | immigrants+2",
    "Quietly take the credit | Good for the economy. | g.01",
  ]),
];

// what leads to what: choice index -> ">id@chance"; fail / ignore -> id
export const LINKS = {
  rival_scandal: { 0: ">libel_suit@60" },
  strike: { 2: ">martyr@60" },
  riots: { 0: ">martyr@40" },
  bread_riots: { 1: ">martyr@50" },
  police_brutality: { 1: ">martyr@60" },
  hunger_strike: { 1: ">martyr@40", 2: ">martyr@60" },
  general_unrest: { 1: ">martyr@40" },
  volcano: { 0: ">rebuild_contracts@60", 2: ">rebuild_contracts@60" },
  tsunami: { 0: ">rebuild_contracts@60" },
  earthquake: { 0: ">rebuild_contracts@60", 1: ">rebuild_contracts@40" },
  flood: { 0: ">hero_rescue@50" },
  mine_collapse: { 0: ">hero_rescue@60" },
  cholera: { fail: "second_wave" },
  flu_season: { 2: ">second_wave@50", fail: "second_wave" },
  plague: { 2: ">second_wave@50", fail: "second_wave" },
  inflation: { 1: ">black_market@60" },
  union_drive: { 0: ">union_seats@60" },
  cartel: { 0: ">cartel_revenge@60", 2: ">cover_up_exposed@40" },
  reactor_leak: { 2: ">cover_up_exposed@60" },
  slush_fund: { 2: ">cover_up_exposed@60" },
  corruption: { 1: ">cover_up_exposed@40" },
  coup_plot: { 1: ">coup_attempt@25", fail: "coup_attempt", ignore: "coup_attempt" },
  heresy_trial: { 0: ">underground_church@60" },
  space_race: { 0: ">launch_disaster@30 >first_orbit@60" },
  dam: { 0: ">displaced_villagers@70" },
  gold_rush: { 1: ">lawless_camps@70" },
  succession: { 0: ">pretender@50", 1: ">pretender@50" },
  clan_feud: { 2: ">clan_war@70", fail: "clan_war" },
  party_purge: { 0: ">exiles_plot@60" },
  conscription: { 0: ">draft_dodgers@60" },
  automation: { 2: ">luddites@60" },
  debate_gaffe: { 1: ">press_boycott@60" },
  campaign_donor: { 0: ">donor_favor@70" },
  rival_defects: { 0: ">turncoat_betrays@40" },
  arms_deal: { 0: ">arms_kickbacks@40" },
  bank_run: { 2: ">ruined_savers@70" },
  border_raid: { 0: ">revenge_raid@50" },
  refugees: { 0: ">grateful_refugees@50" },
  refugee_camp: { 0: ">grateful_refugees@50" },
  ghost_town: { ignore: "orphaned_city" },
  county_secession_vote: { 1: ">separatists@50", ignore: "separatists" },
  separatist_flags: { fail: "separatists" },
  housing: { 2: ">martyr@30" },
};

// a ruler's traits draw (w > 1) or repel (w < 1) these situations
export const TRAIT_PULL = {
  corrupt: { w: 3, ids: ["corruption", "minister_affair", "slush_fund", "nepotism", "campaign_donor", "ghost_workers", "corrupt_judge", "vote_buying", "smuggling"] },
  clean: { w: 0.3, ids: ["corruption", "minister_affair", "slush_fund", "nepotism", "ghost_workers", "leaked_tapes"] },
  devout: { w: 2.5, ids: ["prophet", "preacher", "miracle", "church_demands", "pilgrimage", "heresy_trial", "religious_schism", "temple_fire"] },
  secular: { w: 2, ids: ["church_demands", "prophet", "religious_schism"] },
  warhero: { w: 2.5, ids: ["veterans_march", "veterans", "mutiny", "arms_deal", "veteran_hero", "border_incident", "conscription"] },
  gaffe: { w: 3, ids: ["debate_gaffe", "leaked_tapes", "film_scandal"] },
  silver: { w: 0.4, ids: ["debate_gaffe", "polling_slump"] },
  green: { w: 2.5, ids: ["green_blockade", "oil_spill", "dam", "spill", "poisoned_wells", "nuclear_plant"] },
  unionman: { w: 2.5, ids: ["union_drive", "strike", "minimum_wage", "automation", "child_labor"] },
  mogul: { w: 2.5, ids: ["monopoly", "tech_lobby", "merchant_guild", "market_crash", "investment", "wealthy_flight"] },
  populist: { w: 2, ids: ["general_unrest", "bread_riots", "protest_vote", "wealthy_flight"] },
  demagogue: { w: 2.5, ids: ["general_unrest", "police_brutality", "refugee_camp", "separatist_flags", "martyr"] },
  hardliner: { w: 2, ids: ["border_incident", "separatist_flags", "spy_ring", "riots"] },
  moderate: { w: 0.5, ids: ["general_unrest", "riots", "filibuster"] },
  intellectual: { w: 2.5, ids: ["breakthrough", "invention", "student_demands", "space_race", "cure"] },
  folk: { w: 2, ids: ["farm_lobby", "county_festival", "drought_well", "locusts"] },
  immigrant: { w: 2, ids: ["immigrant_rights", "refugees", "refugee_camp", "language_dispute"] },
  marksman: { w: 2, ids: ["gun_owners", "animal_attacks", "weapons_cache"] },
  elder: { w: 2, ids: ["pensioners", "aging", "rival_health"] },
  young: { w: 2, ids: ["youth_icon", "student_demands", "curfew_defiance"] },
  heir: { w: 2, ids: ["wealthy_flight", "court_intrigue", "nepotism"] },
  libertine: { w: 2.5, ids: ["minister_affair", "leaked_tapes", "film_scandal", "addiction"] },
  charismatic: { w: 1.5, ids: ["youth_icon", "endorsement", "summit"] },
  outsider: { w: 2, ids: ["filibuster", "mayor_rebels", "protest_vote"] },
  career: { w: 2, ids: ["filibuster", "nepotism", "polling_slump"] },
  elitist: { w: 2, ids: ["bread_riots", "general_unrest", "wealthy_flight"] },
};

// fourth choices only a ruler (or the person involved) with the trait can take
export const TRAIT_OPTIONS = {
  siege: "(War Hero) Lead the defence from the walls | The {leader} fights beside the soldiers. | T:warhero c.6 s1.6 ^popularity+10 military+3 patriots+2",
  invasion: "(War Hero) Take personal command | The old general returns. | T:warhero c.8 s1.5 ^popularity+8 military+4",
  mutiny: "(War Hero) Address them as a fellow soldier | They'll listen to one of their own. | T:warhero s1.6 military+4 security+3",
  debate_gaffe: "(Silver Tongue) Turn it into the joke of the year | Win the room back. | T:silver s1.6 ^charisma+8 ^popularity+5",
  polling_slump: "(Charismatic) A barnstorming speech tour | Win hearts face to face. | T:charismatic c.8 s1.4 ^popularity+10",
  prophet: "(Devout) Pray beside the prophet in public | A ruler of true faith. | T:devout s1.4 religious+4 ^popularity+5",
  preacher: "(Devout) Lead the congregation yourself | Take the movement over. | T:devout s1.4 religious+4 ^popularity+4",
  strike: "(Union Organizer) Join the picket line, then broker the deal | You were one of them. | T:unionman s1.6 unions+4 workers+3 capitalists-2",
  market_crash: "(Business Mogul) Buy shares yourself to steady the market | Put your fortune where your mouth is. | T:mogul s1.5 ^funds-20 economy+4 capitalists+3",
  general_unrest: "(Populist) Walk into the crowd and listen | One of the people. | T:populist s1.5 ^popularity+8 poor+2 u-8",
  bread_riots: "(Folk Hero) Hand out bread with your own hands | The people's champion. | T:folk s1.5 ^popularity+8 poor+3 u-8",
  minister_affair: "(Corrupt) Pay off the investigators | It never happened. | T:corrupt s1.8 $-.02 integrity-5 >cover_up_exposed@30",
  slush_fund: "(Corrupt) Move the money offshore before anyone looks | Gone without a trace. | T:corrupt s1.8 ^funds+10 integrity-4 >cover_up_exposed@40",
  campaign_donor: "(Wealthy Heir) Fund the campaign from your own fortune | No strings. | T:heir ^funds+20 ^integrity+4",
  green_blockade: "(Green Crusader) Chain yourself to the gate alongside them | Lead by example. | T:green s1.5 greens+5 youth+2 ^popularity+3 capitalists-3",
  border_incident: "(Hardliner) Mobilise the whole army at the border | Peace through terror. | T:hardliner @military+.05 r-2 patriots+4 progressives-2",
  summit: "(Bridge Builder) Broker a grand bargain | Everyone leaves with something. | T:moderate s1.3 r3 ^popularity+5",
  breakthrough: "(Intellectual) Personally join the research team | Brains at the top. | T:intellectual c.8 tech1.2 youth+2 ^competence+5",
  court_intrigue: "(Charismatic) Seduce the conspirators back to your side | Charm is a weapon. | T:charismatic s1.6 ^charisma+3 wealthy+2",
  gun_owners: "(Sharpshooter) Show up with your own rifle | One of them. | T:marksman s1.6 gunowners+5 progressives-2",
  pensioners: "(Elder Statesman) Speak to them as one of their own | Calm the generation. | T:elder s1.5 retirees+4",
  immigrant_rights: "(Immigrant Roots) Tell your own story | I came with nothing too. | T:immigrant s1.5 immigrants+4 patriots-1",
};

export function applyChains(list) {
  const byId = Object.fromEntries(list.map((s) => [s.id, s]));
  for (const [id, link] of Object.entries(LINKS)) {
    const t = byId[id];
    if (!t) throw new Error(`chain from unknown situation ${id}`);
    for (const [k, v] of Object.entries(link)) {
      if (k === "fail" || k === "ignore") t[k] = v;
      else t.options[+k].next = [...(t.options[+k].next || []), ...opt(`x | x | ${v}`).next];
    }
  }
  for (const [trait, pull] of Object.entries(TRAIT_PULL)) for (const id of pull.ids) if (byId[id]) (byId[id].traitPull = byId[id].traitPull || {})[trait] = pull.w;
  for (const [id, line] of Object.entries(TRAIT_OPTIONS)) {
    if (!byId[id]) throw new Error(`trait choice for unknown situation ${id}`);
    byId[id].bonus = opt(line);
  }
  // every follow-up must exist
  for (const t of list) {
    for (const o of [...t.options, ...(t.bonus ? [t.bonus] : [])]) for (const n of o.next || []) if (!byId[n.id]) throw new Error(`${t.id} leads to unknown ${n.id}`);
    for (const k of ["fail", "ignore"]) if (t[k] && !byId[t[k]]) throw new Error(`${t.id} ${k} leads to unknown ${t[k]}`);
  }
}
