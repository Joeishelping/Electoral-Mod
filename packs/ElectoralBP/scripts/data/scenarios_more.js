// More situations, written compactly. Each choice is one line:
//
//   "Label | What it does | effects"
//
// Effects (space separated):
//   c1.5 cost   s1.3 speed   M an admin rules the outcome   X (counters) opens a dispute   cede
//   unions+2      an interest group's mood, in tenths (+2 = +0.2)
//   jobs-5        a performance slider (economy jobs security services food integrity)
//   $.1 treasury  g.02 GDP  r-1 relations  ally1  tech1  u+6 unrest  tax+5  tariff+5
//   @military+.1  a budget stock (military infrastructure welfare research propaganda)
//   ~popularity+10  the person the situation is about   ^integrity-10  the ruler
//   (counters) op20 their progress  osev-1 their severity  o$.03 their treasury  og-.01 their GDP
//
// Scenario props: prefer:a,b  sev:2  grow:.6  spread:.3  gdp:.03  m:jobs-4,economy-2
//   needs:other|enemy|war|ally  person:ruler|rival|any  govs:monarchy,clan  cities:1-2  w:.6 (how common)
// Fillers in text: {country} {city} {other} {othercity} {lobby} {leader} (title) {ruler} {rival}

const METRICS = new Set(["economy", "jobs", "security", "services", "food", "integrity"]);
const ORIGIN = { p: "progress", sev: "severity", $: "treasury", g: "gdp" };

function opt(line) {
  const [label, desc, mods = ""] = line.split("|").map((x) => x.trim());
  const o = { label, desc, cost: 1, speed: 1, groups: {}, fx: {} };
  for (const t of mods.split(/\s+/).filter(Boolean)) {
    let m;
    if (t === "M") o.manual = true;
    else if (t === "X") o.contest = "city";
    else if (t === "cede") o.fx.special = "cede";
    else if ((m = /^c([\d.]+)$/.exec(t))) o.cost = +m[1];
    else if ((m = /^s([\d.]+)$/.exec(t))) o.speed = +m[1];
    else if ((m = /^\$([+-]?[\d.]+)$/.exec(t))) o.fx.treasury = +m[1];
    else if ((m = /^g([+-]?[\d.]+)$/.exec(t))) o.fx.gdp = +m[1];
    else if ((m = /^r([+-]?\d+)$/.exec(t))) o.fx.relation = +m[1];
    else if ((m = /^ally(\d)$/.exec(t))) o.fx.allyBoost = +m[1];
    else if ((m = /^tech([+-]?[\d.]+)$/.exec(t))) o.fx.tech = +m[1];
    else if ((m = /^tax([+-]\d+)$/.exec(t))) o.fx.incomeTax = +m[1];
    else if ((m = /^tariff([+-]\d+)$/.exec(t))) o.fx.tariff = +m[1];
    else if ((m = /^u([+-]?\d+)$/.exec(t))) o.fx.unrest = +m[1];
    else if ((m = /^@(\w+)([+-][\d.]+)$/.exec(t))) (o.fx.stock = o.fx.stock || {})[m[1]] = +m[2];
    else if ((m = /^~(\w+)([+-]\d+)$/.exec(t))) (o.fx.person = o.fx.person || {})[m[1]] = +m[2];
    else if ((m = /^\^(\w+)([+-]\d+)$/.exec(t))) (o.fx.ruler = o.fx.ruler || {})[m[1]] = +m[2];
    else if ((m = /^o(p|sev|\$|g)([+-]?[\d.]+)$/.exec(t))) (o.origin = o.origin || {})[ORIGIN[m[1]]] = +m[2];
    else if ((m = /^(\w+)([+-]\d+)$/.exec(t))) {
      if (METRICS.has(m[1])) (o.fx.metrics = o.fx.metrics || {})[m[1]] = +m[2];
      else o.groups[m[1]] = +m[2] / 10;
    } else throw new Error(`Bad effect "${t}" in "${label}"`);
  }
  return o;
}

function props(str) {
  const p = {};
  for (const t of str.split(/\s+/).filter(Boolean)) {
    const [k, v] = t.split(":");
    if (k === "prefer" || k === "govs") p[k] = v.split(",");
    else if (k === "m") p.metrics = Object.fromEntries(v.split(",").map((x) => /^(\w+)([+-]\d+)$/.exec(x)).map((x) => [x[1], +x[2]]));
    else if (k === "cities") p.cities = v.split("-").map(Number);
    else if (k === "needs" || k === "person") p[k] = v;
    else if (k === "sev") p.severity = +v;
    else if (k === "grow") p.growth = +v;
    else p[k] = +v; // spread, gdp, w
  }
  return p;
}

/** sc(id, category, "c"risis | "o"pportunity, title, escalated title, text, props, [3 choices], [who, title, text, [3 choices]]) */
function sc(id, cat, kind, title, escalated, text, p, options, counter) {
  const s = { id, cat, kind: kind === "o" ? "opportunity" : "crisis", title, text, severity: 2, ...props(p), options: options.map(opt) };
  if (escalated) s.escalated = escalated;
  if (counter) s.counter = { who: counter[0], title: counter[1], text: counter[2], options: counter[3].map(opt) };
  return s;
}

export const MORE_SCENARIOS = [
  // ================= candidates & the campaign =================
  sc("rival_scandal", "Campaign", "o", "Dirt on {rival}", "", "A dossier has landed on the {leader}'s desk: {rival} has been hiding unpaid debts and a shell company in {city}.", "person:rival w:.8", [
    "Leak it to the press | Let the papers do the work. | s1.4 ~popularity-15 ~integrity-15 integrity-2",
    "Use it as leverage in private | Quietly make {rival} back off. | ~funds-15 ^integrity-5",
    "Burn the file | Stay clean. Voters may hear you're decent. | ^integrity+8 religious+1 retirees+1",
  ]),
  sc("rival_surge", "Campaign", "c", "{rival} Surges", "{rival}'s Movement", "{rival} is packing halls across {city} and the polls are moving fast.", "person:rival sev:2 grow:.5", [
    "Match them rally for rally | Spend big to keep the crowds. | c1.4 ^popularity+6 youth+1",
    "Attack their record | Go negative. | ~popularity-10 ^integrity-4 progressives-1",
    "Steal their best ideas | Adopt their platform. | ~popularity-6 middle+1",
  ]),
  sc("rival_defects", "Campaign", "o", "{rival} Wants to Switch Sides", "", "{rival} has quietly asked to join the {leader}'s camp - for a price.", "person:rival w:.5", [
    "Welcome them with a cabinet post | A big name on our side. | ~popularity-10 ^popularity+8 patriots-1",
    "Take the endorsement, offer nothing | Cheap, if it holds. | s1.3 ^popularity+4 ~integrity-8",
    "Turn them away | We don't need turncoats. | ^integrity+5 religious+1",
  ]),
  sc("debate_gaffe", "Campaign", "c", "Debate Gaffe", "Viral Disaster", "The {ruler} froze on stage in {city} and the clip is everywhere.", "person:ruler sev:2 grow:.4 m:integrity-2", [
    "Laugh it off on a talk show | Show some humanity. | ^charisma+5 youth+1",
    "Blame the moderator | Rally the base against the press. | ^popularity-3 patriots+2 progressives-2",
    "Release a detailed policy plan | Change the subject to substance. | c.8 ^competence+6 middle+1",
  ]),
  sc("endorsement", "Campaign", "o", "Big Endorsement", "", "The {lobby} is ready to endorse a candidate - and both {ruler} and {rival} want it.", "person:rival", [
    "Promise them a seat at the table | Their votes, our debts. | ^popularity+8 ~popularity-4 integrity-2",
    "Win them on the merits | Slow but honest. | c1.2 s.7 ^integrity+4",
    "Let {rival} have them | Pick other battles. | ~popularity+8",
  ]),
  sc("campaign_donor", "Campaign", "o", "Mystery Donor", "", "An anonymous donor from {city} offers the {ruler}'s campaign a fortune, no questions asked.", "person:ruler w:.7", [
    "Take the money | A war chest beats scruples. | ^funds+25 ^integrity-10 integrity-3",
    "Take it, but disclose it | Transparent - and still useful. | ^funds+12 progressives+1",
    "Refuse | Clean hands. | ^integrity+6 religious+1",
  ]),
  sc("running_mate_feud", "Campaign", "c", "Feud in the Ticket", "Ticket Meltdown", "{rival} and the {ruler} are openly sniping at each other in {city}.", "person:rival sev:2 grow:.5", [
    "Make peace over dinner | Bury the hatchet. | ^charisma+3 ~popularity+3",
    "Cut {rival} loose | Clean break. | s1.4 ~popularity-12 ~funds-10",
    "Leak their private messages | Win the feud, lose some respect. | ~popularity-10 ^integrity-6",
  ]),
  sc("rival_health", "Campaign", "c", "{rival} Collapses on Stage", "", "{rival} collapsed mid-speech in {city}. Rumours swirl about their health.", "person:rival w:.4", [
    "Wish them well publicly | Class wins votes. | ^integrity+5 ^popularity+3 retirees+1",
    "Question their fitness to serve | Ruthless but effective. | ~popularity-12 ^integrity-5 retirees-1",
    "Say nothing | Stay out of it. | s1.3",
  ]),
  sc("polling_slump", "Campaign", "c", "Polling Slump", "Freefall in the Polls", "Polls show the {ruler} sinking in {city} and beyond.", "person:ruler sev:2 grow:.5 m:integrity-1", [
    "Shake up the campaign team | New faces, new energy. | c.8 ^competence+4",
    "Go on a national tour | Shake every hand. | c1.4 ^charisma+5 ^popularity+5",
    "Announce a popular giveaway | Tax rebates for everyone. | c1.6 tax-2 ^popularity+8 libertarians-1",
  ]),
  sc("youth_icon", "Campaign", "o", "Viral Moment", "", "A clip of {rival} in {city} has gone viral with young voters.", "person:any", [
    "Ride the wave | Lean into it. | ~charisma+8 youth+2",
    "Book them on every show | Strike while it's hot. | c.6 ~popularity+10 retirees-1",
    "Stay serious | We don't do memes. | ~competence+3",
  ]),
  sc("old_letters", "Campaign", "c", "Old Letters Surface", "The Letters Affair", "Decades-old letters written by {rival} have surfaced in {city}, full of embarrassing opinions.", "person:any sev:2 grow:.4", [
    "Apologise sincerely | Own it. | ~integrity+5 ~popularity-4 progressives+1",
    "Call them forgeries | Deny everything. | ~integrity-8 patriots+1",
    "Say people change | Move on quickly. | s1.2 ~popularity-2",
  ]),
  sc("vote_buying", "Campaign", "c", "Vote Buying in {city}", "Rigged Precincts", "Agents linked to {rival} are paying voters in {city}.", "person:rival sev:2 grow:.5 m:integrity-4", [
    "Prosecute | Let the courts decide. | c1.2 M ~integrity-15 integrity+3",
    "Out-spend them | Two can play. | c1.5 ^integrity-8 poor+1",
    "Send observers | Watch every booth. | c.8 integrity+2 progressives+1",
  ]),
  sc("memoir", "Campaign", "o", "The {ruler}'s Memoir", "", "Publishers in {city} want the {ruler}'s life story.", "person:ruler w:.5", [
    "Write an honest memoir | Warts and all. | ^integrity+6 ^popularity+3",
    "Ghost-write a hero's tale | Pure legend. | ^popularity+6 ^integrity-4",
    "Donate the advance to charity | Generous and quiet. | ^popularity+4 poor+1",
  ]),
  sc("protest_vote", "Campaign", "c", "Protest Candidate", "Protest Wave", "A joke candidate in {city} is polling double digits - people are fed up.", "sev:2 grow:.4 m:integrity-2", [
    "Address their grievances | Listen to the anger. | c1.2 poor+1 youth+1",
    "Mock them | They can't be serious. | s1.3 youth-2",
    "Invite them into the party | Absorb the movement. | youth+2 wealthy-1",
  ]),
  sc("assassination_plot", "Campaign", "c", "Plot Against {rival}", "Assassination Attempt", "Police in {city} uncovered a plot to kill {rival}.", "person:any sev:3 grow:.5 m:security-4 w:.4", [
    "Full protection for every candidate | Democracy must be safe. | c1.4 security+3 ~popularity+5",
    "Hunt the plotters | Arrest everyone involved. | c1.2 patriots+1 libertarians-1",
    "Suspend public rallies | Safety first. | s1.4 youth-1 integrity-2",
  ]),

  // ================= interest groups & lobbies =================
  sc("lobby_ultimatum", "Lobbies", "c", "{lobby} Ultimatum", "{lobby} Revolt", "The {lobby} has threatened to turn on the {leader} unless their demands are met by the end of the season.", "sev:2 grow:.5", [
    "Give them what they want | Buy peace. | c1.4 $-.02 integrity-1",
    "Call their bluff | Let them walk. | s1.2 u+4",
    "Split their leadership | Divide and rule. | c.8 ^integrity-4",
  ]),
  sc("union_drive", "Lobbies", "c", "Union Drive", "Mass Unionisation", "Workers across {city} are signing union cards by the thousand.", "prefer:mining,port,slums sev:2 grow:.4", [
    "Recognise the unions | Seat them at the table. | unions+3 workers+2 capitalists-2",
    "Pass right-to-work laws | Keep the shops open. | capitalists+3 libertarians+1 unions-3",
    "Broker a compromise | Works councils, not strikes. | c1.2 middle+1",
  ]),
  sc("church_demands", "Lobbies", "c", "Clergy Demands", "Holy Defiance", "The clergy of {city} demand prayer in schools and a say in the law.", "prefer:temple sev:2 grow:.4", [
    "Grant their demands | Faith first. | religious+3 progressives-3 youth-1",
    "Firm separation of church and state | Keep it secular. | progressives+2 religious-3",
    "Fund religious schools | Money instead of laws. | c1.2 religious+2 libertarians-1",
  ]),
  sc("green_blockade", "Lobbies", "c", "Green Blockade", "Eco-Occupation", "Environmentalists have chained themselves to the gates of the {city} works.", "prefer:mining,forest,port sev:2 grow:.4 gdp:.02", [
    "Shut the works down | They're right. | greens+3 workers-2 capitalists-2 g-.01",
    "Remove them by force | Business must go on. | s1.4 greens-3 capitalists+2 u+4",
    "Commission a green upgrade | Cleaner, slower, costly. | c1.6 greens+2 tech.3",
  ]),
  sc("farm_lobby", "Lobbies", "c", "Farmers March on {city}", "Tractor Siege", "Farmers have driven their tractors into {city}, blocking every road.", "prefer:capital,market sev:2 grow:.5 m:food-3", [
    "Raise farm subsidies | Feed those who feed us. | c1.4 farmers+3 libertarians-1",
    "Cut import tariffs on food | Cheaper bread, angrier farmers. | tariff-5 poor+2 farmers-3",
    "Negotiate on the roadside | Meet them halfway. | farmers+1",
  ]),
  sc("veterans_march", "Lobbies", "c", "Veterans' March", "Veterans' Occupation", "Thousands of veterans camp outside government buildings in {city} demanding pensions.", "prefer:capital,garrison sev:2 grow:.4 m:security-2", [
    "Pay the pensions | They earned it. | c1.6 military+3 patriots+2",
    "Offer jobs instead | Work, not handouts. | c.9 military+1 jobs+2",
    "Disperse the camp | Order must be kept. | military-4 patriots-2 u+6",
  ]),
  sc("tech_lobby", "Lobbies", "o", "Industry Wants Deregulation", "", "Big employers in {city} promise thousands of jobs if regulations are scrapped.", "prefer:market,capital", [
    "Scrap the rules | Business unleashed. | capitalists+3 greens-2 unions-2 g.03",
    "Trade rules for wage guarantees | A deal. | capitalists+1 unions+1 g.015",
    "Refuse | Rules protect people. | progressives+1 capitalists-2",
  ]),
  sc("gun_owners", "Lobbies", "c", "Gun Rights Rally", "Armed Standoff", "Armed demonstrators in {city} protest a rumoured weapons ban.", "prefer:frontier,forest sev:2 grow:.5 m:security-2", [
    "Promise no new gun laws | Calm them down. | gunowners+3 progressives-2",
    "Push the ban anyway | Safety above all. | gunowners-4 progressives+2 u+5",
    "License, don't ban | A middle way. | c.8 middle+1",
  ]),
  sc("pensioners", "Lobbies", "c", "Pension Panic", "Pension Fund Collapse", "Rumours say {city}'s pension fund is empty. Retirees are furious.", "prefer:retirement sev:2 grow:.5 m:services-3", [
    "Guarantee every pension | The treasury pays. | c1.8 retirees+3 youth-1",
    "Raise the retirement age | Painful but sustainable. | retirees-3 capitalists+1 g.01",
    "Investigate the fund managers | Find out who took it. | c.8 M integrity+2",
  ]),
  sc("student_demands", "Lobbies", "c", "Student Occupation", "Campus Uprising", "Students at {city}'s university occupy the halls demanding free tuition.", "prefer:academy sev:2 grow:.4", [
    "Free tuition | The future is worth it. | c1.6 youth+3 wealthy-1",
    "Expel the ringleaders | Discipline. | youth-3 patriots+1 u+4",
    "Cheap student loans | Help, not handouts. | c.8 youth+1 middle+1",
  ]),
  sc("merchant_guild", "Lobbies", "o", "Merchants' Proposal", "", "The traders of {city} propose a tax-free trading zone.", "prefer:port,market", [
    "Create the free zone | Trade will boom. | merchants+3 g.03 $-.03",
    "A smaller pilot zone | Test it first. | c.6 merchants+1 g.01",
    "No special treatment | Everyone pays. | merchants-2 poor+1",
  ]),
  sc("immigrant_rights", "Lobbies", "c", "Migrant Workers Strike", "Migrant General Strike", "Migrant workers in {city} stopped work, demanding citizenship.", "prefer:migrant,farmland,slums sev:2 grow:.4 gdp:.02", [
    "Path to citizenship | Earned belonging. | immigrants+3 patriots-3",
    "Better visas, no citizenship | Half a loaf. | immigrants+1 capitalists+1",
    "Deport the strikers | Make an example. | immigrants-4 patriots+2 u+5 jobs-2",
  ]),
  sc("wealthy_flight", "Lobbies", "c", "The Rich Are Leaving", "Capital Flight", "Wealthy families in {city} are moving their money abroad.", "prefer:estates,capital sev:2 grow:.5 gdp:.03", [
    "Cut top tax rates | Bring them back. | tax-5 wealthy+3 poor-2",
    "Exit tax on fleeing capital | Make them pay to leave. | wealthy-3 poor+1 $.03",
    "Let them go | Good riddance. | s1.2 progressives+1 g-.01",
  ]),
  sc("libertarian_revolt", "Lobbies", "c", "Tax Strike", "Nationwide Tax Strike", "Small business owners in {city} refuse to pay taxes until spending is cut.", "prefer:market,frontier sev:2 grow:.5 gdp:.02", [
    "Cut spending | Show restraint. | libertarians+3 poor-2 services-2",
    "Audit every striker | The law is the law. | c1.2 libertarians-3 $.02",
    "Small business tax holiday | A gesture. | c.8 libertarians+1 merchants+1",
  ]),

  // ================= counties & local life =================
  sc("county_feud", "Counties", "c", "Feud Between Towns", "Town War", "Two towns in {city} are at each other's throats over water rights.", "prefer:farmland,frontier sev:2 grow:.4 m:food-2", [
    "Split the water fairly | Engineers decide. | c1.2 farmers+1",
    "Side with the bigger town | More voters there. | s1.3 u+4",
    "Build a new reservoir | Enough for everyone. | c1.6 @infrastructure+.04 farmers+2",
  ]),
  sc("county_secession_vote", "Counties", "c", "{city} Wants Autonomy", "{city} Self-Rule Movement", "Local leaders in {city} demand their own parliament.", "sev:2 grow:.4 m:security-2", [
    "Grant limited autonomy | Let them govern themselves. | patriots-2 progressives+1 u-6",
    "Refuse outright | One nation. | patriots+2 u+6",
    "Hold a local vote | Let the people decide. | c.8 M progressives+1",
  ]),
  sc("county_festival", "Counties", "o", "{city} Harvest Festival", "", "{city} is planning its biggest festival in a generation.", "prefer:farmland,temple", [
    "Fund it lavishly | Make it legendary. | c1.2 farmers+1 religious+1 u-4",
    "Have the {leader} attend | A personal touch. | ^popularity+5 ^charisma+2",
    "Let the locals handle it | Keep it humble. | s1.3",
  ]),
  sc("ghost_town", "Counties", "c", "{city} Is Emptying", "{city} Abandoned", "Young people are leaving {city} for good. Shops are closing.", "prefer:farmland,mining,frontier sev:2 grow:.3 gdp:.02 m:jobs-2", [
    "Relocate a government office there | Jobs by decree. | c1.2 jobs+3",
    "Tax breaks for new businesses | Bring in investors. | c.8 capitalists+1 g.01",
    "Let it shrink gracefully | Not every town survives. | s1.2 farmers-2 retirees-1",
  ]),
  sc("mayor_rebels", "Counties", "c", "Mayor of {city} Defies the {leader}", "{city} in Open Defiance", "{city}'s mayor refuses to apply national law.", "sev:2 grow:.5 m:integrity-2", [
    "Remove the mayor | The law applies everywhere. | patriots+1 u+5",
    "Negotiate | Find out what they want. | c.8 u-2",
    "Cut {city}'s funding | Squeeze them. | $.02 u+3 poor-1",
  ]),
  sc("boomtown", "Counties", "o", "{city} Boomtown", "", "Newcomers are flooding into {city} and land prices are skyrocketing.", "prefer:frontier,mining,port", [
    "Plan the growth carefully | Roads first, houses second. | c1.4 @infrastructure+.05 g.03",
    "Let it grow wild | Freedom and fortune. | g.04 services-3 libertarians+1",
    "Tax the land rush | Share the windfall. | $.06 capitalists-1",
  ]),
  sc("local_hero", "Counties", "o", "Local Hero of {city}", "", "A firefighter from {city} saved dozens in a blaze and the nation adores them.", "w:.6", [
    "Award a national medal | Honour courage. | ^popularity+4 patriots+1",
    "Recruit them to the party | A rising star. | ^popularity+6 ^integrity-2",
    "Fund {city}'s fire service in their name | Lasting tribute. | c1.2 services+3",
  ]),
  sc("prison_riot", "Counties", "c", "Prison Riot in {city}", "Prison Uprising", "Inmates have taken over {city}'s prison and hold guards hostage.", "prefer:slums,garrison sev:3 grow:.6 m:security-4", [
    "Storm it | End it now. | s1.5 security+2 progressives-2",
    "Negotiate their demands | Save the hostages. | c.8 progressives+1 patriots-2",
    "Starve them out | Wait them out. | s.6 security-1",
  ]),
  sc("county_census", "Counties", "c", "Census Dispute", "Census Scandal", "{city} claims the census undercounted it - and with it, its votes.", "sev:2 grow:.3 m:integrity-2", [
    "Recount {city} | Get it right. | c1.2 integrity+3",
    "Stand by the census | It was done fairly. | s1.2 u+3",
    "Grant {city} an extra seat | Peace at the price of fairness. | integrity-3 u-4",
  ]),
  sc("rivalry_cities", "Counties", "o", "{city} Bids to Be Capital", "", "{city} argues it should become the new capital.", "w:.5", [
    "Move the capital | A bold new start. | c2 @infrastructure+.05 u-6 wealthy-1",
    "Give {city} a second palace | Symbolic recognition. | c.8 u-3",
    "Refuse | The capital stays. | s1.3 u+2",
  ]),

  // ================= disasters & nature =================
  sc("volcano", "Disaster", "c", "Volcanic Eruption", "Ash Winter", "The mountain above {city} has erupted, burying farms in ash.", "prefer:mining,frontier sev:4 grow:.5 gdp:.06 m:food-5,services-3 w:.4", [
    "Mass evacuation | Save every life. | c1.6 services+3 poor+1",
    "Divert the lava | Engineers versus the mountain. | c1.8 @infrastructure-.03 tech.2",
    "Rebuild immediately | Life must go on. | c1.2 g-.01 u+3",
  ]),
  sc("blizzard", "Disaster", "c", "Great Blizzard", "Deep Freeze", "A blizzard has cut {city} off from the world.", "prefer:frontier,forest,mining sev:3 grow:.5 gdp:.03 m:services-3 spread:.4", [
    "Airlift supplies | Whatever it costs. | c1.6 services+2",
    "Open public shelters | Warmth for everyone. | c1 poor+2",
    "Wait for the thaw | It'll pass. | s.6 u+4",
  ]),
  sc("forest_blaze", "Disaster", "c", "Forest Blaze", "Firestorm", "Lightning set the old forests around {city} ablaze and the wind is rising.", "prefer:forest,frontier,farmland sev:3 grow:.7 spread:.4 gdp:.04 m:food-3", [
    "Call in every firefighter | Throw everything at it. | c1.6 services+2",
    "Cut firebreaks | Sacrifice the edges. | c1 farmers-1 greens-1",
    "Seed the clouds | An experimental fix. | c1.2 tech.3 M",
  ]),
  sc("landslide", "Disaster", "c", "Landslide", "Mountain Collapse", "A hillside gave way above {city}, burying the main road.", "prefer:mining,forest sev:2 grow:.4 gdp:.03 m:services-2", [
    "Dig out the road | Reconnect the town. | c1.2 @infrastructure+.02",
    "Reroute through the valley | A new road. | c1.6 @infrastructure+.04 g.01",
    "Relocate the village | Move them somewhere safe. | c1.4 farmers-1 u+2",
  ]),
  sc("tsunami", "Disaster", "c", "Tsunami", "Coastal Devastation", "A wave crashed into {city}'s harbour, wrecking the docks.", "prefer:port sev:4 grow:.5 gdp:.07 m:services-4,economy-3 w:.4", [
    "National rebuilding fund | The country pulls together. | c1.8 tax+2 services+2",
    "Ask allies for aid | Swallow our pride. | ally1 patriots-1",
    "Build a sea wall | Never again. | c2 @infrastructure+.06",
  ]),
  sc("tornado", "Disaster", "c", "Tornado Outbreak", "Tornado Alley", "A string of tornadoes tore through {city}.", "prefer:farmland,frontier sev:3 grow:.4 gdp:.03 m:food-2", [
    "Emergency grants for families | Rebuild homes. | c1.4 poor+2 middle+1",
    "Build storm shelters | Prepare for the next one. | c1.2 @infrastructure+.03",
    "Let insurers pay | Not the state's job. | s1.2 libertarians+1 poor-2",
  ]),
  sc("heatwave", "Nature", "c", "Heatwave", "Killer Heat", "Temperatures in {city} have hit record highs. The old and sick are dying.", "prefer:retirement,slums,capital sev:2 grow:.6 spread:.4 m:services-3", [
    "Open cooling centres | Keep people alive. | c1 retirees+2 poor+1",
    "Ration power to homes | Industry pays the price. | jobs-2 retirees+1",
    "Tell people to stay inside | Free advice. | s1.2 retirees-2",
  ]),
  sc("hard_winter", "Nature", "c", "Hard Winter", "Winter of Death", "The coldest winter in memory grips {city}. Fuel is running out.", "sev:2 grow:.5 spread:.3 m:services-3,food-2", [
    "Subsidise heating fuel | Nobody freezes. | c1.4 poor+2 retirees+2",
    "Open the national fuel reserve | Use what we saved. | $-.03 security-2",
    "Ration fuel strictly | Fair, but grim. | u+3",
  ]),
  sc("locusts", "Nature", "c", "Locust Swarm", "Plague of Locusts", "Clouds of locusts are stripping the fields of {city}.", "prefer:farmland sev:3 grow:.7 spread:.5 gdp:.03 m:food-6", [
    "Spray the fields | Poison works. | c1.2 farmers+1 greens-2",
    "Bring in natural predators | Slow and green. | c.9 s.7 greens+2",
    "Import grain | Feed people, lose the harvest. | c1.4 tariff-3 farmers-2",
  ]),
  sc("river_shift", "Nature", "c", "The River Has Moved", "Lost Valley", "The great river near {city} burst its banks and carved a new course.", "prefer:farmland,port sev:2 grow:.3 gdp:.02 m:food-2", [
    "Dredge it back | Restore the old course. | c1.6 @infrastructure+.02",
    "Build a new port on the new course | Adapt. | c1.4 merchants+2 g.01",
    "Compensate the farmers | Pay them for lost land. | c1.2 farmers+2",
  ]),
  sc("eclipse", "Nature", "o", "Total Eclipse", "", "A total eclipse will pass over {city}. Pilgrims and tourists are coming.", "w:.4", [
    "Promote it to the world | Tourism boom. | c.6 merchants+2 g.01",
    "Declare a holy day | Faith and wonder. | religious+2",
    "Fund an observatory | Science first. | c1 tech.4 youth+1",
  ]),
  sc("meteor", "Nature", "c", "Meteor Strike", "", "A meteor struck the outskirts of {city}. Strange metal lies in the crater.", "w:.3 sev:2 grow:.2", [
    "Study the metal | Science! | c1 tech.6",
    "Sell it to collectors | Cash in. | $.05 merchants+1",
    "Declare it a holy relic | A sign from above. | religious+3 progressives-1",
  ]),
  sc("drought_well", "Nature", "c", "Wells Running Dry", "Water War", "The wells of {city} are failing and neighbours fight over water.", "prefer:farmland,frontier sev:2 grow:.6 m:food-4 spread:.3", [
    "Build a pipeline | Bring water from afar. | c1.8 @infrastructure+.04",
    "Water rationing | Everyone shares the pain. | u+3 farmers-1",
    "Drill deeper | Fast, risky. | c1 greens-2 food+2",
  ]),
  sc("animal_attacks", "Nature", "c", "Wolves at the Door", "The Pack", "Wolf packs are killing livestock and attacking travellers near {city}.", "prefer:forest,frontier,farmland sev:2 grow:.4 m:food-2,security-2", [
    "Organise a great hunt | Every rifle out. | gunowners+2 greens-2",
    "Build fences and shelters | Protect without killing. | c1.2 greens+1 farmers+1",
    "Relocate the packs | Humane and slow. | c1 s.7 greens+2",
  ]),

  // ================= disease & health =================
  sc("cholera", "Health", "c", "Cholera Outbreak", "Cholera Epidemic", "Cholera has appeared in {city}'s water supply.", "prefer:slums,migrant,port sev:3 grow:.7 spread:.5 m:services-5,jobs-2", [
    "Rebuild the water system | Clean water for all. | c1.8 @infrastructure+.04 poor+2",
    "Boil-water orders and clinics | Quick and cheap. | c.9 services+1",
    "Quarantine the district | Seal it off. | s1.3 poor-3 immigrants-2 u+5",
  ]),
  sc("flu_season", "Health", "c", "Bad Flu Season", "Flu Pandemic", "A nasty flu strain is filling {city}'s hospitals.", "sev:2 grow:.6 spread:.5 m:services-3,jobs-2", [
    "Free vaccines for all | Whatever it costs. | c1.4 services+2 retirees+2",
    "Close schools for a month | Slow the spread. | youth-1 middle-1",
    "Keep everything open | The economy can't stop. | s.8 capitalists+1 retirees-2",
  ]),
  sc("mystery_illness", "Health", "c", "Mystery Illness", "The Sleeping Sickness", "People in {city} are falling into a deep sleep and doctors can't explain it.", "sev:3 grow:.6 spread:.4 m:services-4 w:.5", [
    "Fund an emergency research team | Find the cause. | c1.6 tech.3",
    "Seal {city} off | Contain it at all costs. | s1.2 u+6 jobs-2",
    "Call in the healers and priests | Trust faith. | religious+2 progressives-2",
  ]),
  sc("hospital_collapse", "Health", "c", "Hospitals Overwhelmed", "Healthcare Collapse", "{city}'s hospitals are turning patients away.", "prefer:capital,slums,retirement sev:2 grow:.5 m:services-5", [
    "Emergency hospital funding | Beds and doctors. | c1.6 services+3 retirees+1",
    "Hire foreign doctors | Fill the gaps fast. | c1 immigrants+1 patriots-1",
    "Private clinics take over | Faster, pricier. | capitalists+2 poor-2",
  ]),
  sc("doctors_strike", "Health", "c", "Doctors' Strike", "Medical Walkout", "{city}'s doctors are on strike over pay.", "sev:2 grow:.5 m:services-4", [
    "Raise their pay | Keep them working. | c1.4 middle+1",
    "Order them back to work | Emergency decree. | s1.3 integrity-2 middle-2",
    "Army medics fill in | The military steps up. | c1 military+1",
  ]),
  sc("addiction", "Health", "c", "Painkiller Epidemic", "Addiction Crisis", "Addiction is ravaging {city}, fuelled by cheap pills.", "prefer:slums,mining sev:2 grow:.4 m:services-3,jobs-2", [
    "Treatment, not jail | Help people. | c1.4 progressives+2 patriots-1",
    "Crack down on dealers | Lock them up. | c1 patriots+2 progressives-1",
    "Sue the pill makers | Make them pay. | $.04 capitalists-2 poor+1",
  ]),
  sc("cure", "Health", "o", "A Cure Found", "", "Researchers in {city} believe they have found a cure for a deadly disease.", "prefer:academy w:.6", [
    "Make it free for all | A gift to the world. | c1.6 services+3 ally1",
    "Sell it at a profit | Fund future research. | $.08 capitalists+1 poor-1",
    "Share it with allies only | Diplomatic leverage. | ally1 patriots+1",
  ], ["rivals", "Their Cure", "{origin} has found a cure in {city} that could save lives here too.", [
    "Buy licences | Pay fairly. | c.03 r1 services+2 o$.02",
    "Copy it without paying | Lives come first. | services+2 r-2",
    "Develop our own | Pride and patience. | c.05 tech.3",
  ]]),
  sc("poisoned_wells", "Health", "c", "Poisoned Water", "Mass Poisoning", "Factory waste has poisoned the water of {city}.", "prefer:mining,port,slums sev:3 grow:.6 m:services-4,food-2", [
    "Shut the factory and clean up | Health first. | c1.6 greens+3 jobs-2",
    "Fine the owners | They pay for it. | $.03 capitalists-2 greens+1",
    "Hand out bottled water | A stopgap. | c.8 s1.3 poor-1",
  ]),

  // ================= unrest =================
  sc("bread_riots", "Unrest", "c", "Bread Riots", "Hunger Uprising", "Hungry crowds in {city} are looting bakeries.", "prefer:slums,capital sev:3 grow:.7 spread:.4 m:security-4,food-2", [
    "Free bread for all | Feed them. | c1.4 poor+3 u-8",
    "Martial law | Restore order now. | s1.5 patriots+1 progressives-3 u+5",
    "Price controls on grain | Shops lose, people eat. | merchants-2 poor+2",
  ]),
  sc("general_unrest", "Unrest", "c", "Mass Demonstrations", "Revolutionary Mood", "Hundreds of thousands march in {city} against the {leader}.", "prefer:capital,academy,slums sev:3 grow:.6 spread:.3 m:integrity-3", [
    "Address the nation | Listen and promise reforms. | ^charisma+3 progressives+1 u-4",
    "Ban the marches | Order first. | patriots+2 youth-3 u+6",
    "Call early elections | Let the voters decide. | M integrity+4",
  ]),
  sc("sabotage", "Unrest", "c", "Sabotage", "Sabotage Campaign", "Saboteurs keep blowing up rail lines near {city}.", "prefer:mining,frontier sev:3 grow:.5 gdp:.03 m:security-4", [
    "Hunt the cells | Root them out. | c1.2 security+3 libertarians-1",
    "Guard every line | Expensive but safe. | c1.6 @military-.03",
    "Talk to their leaders | Find out why. | progressives+1 patriots-2",
  ]),
  sc("curfew_defiance", "Unrest", "c", "Curfew Defiance", "Night of Fire", "Young people in {city} defy the night curfew every evening.", "prefer:slums,academy sev:2 grow:.5 m:security-3", [
    "Lift the curfew | It's doing more harm than good. | youth+2 patriots-1",
    "Enforce it harder | Arrests every night. | youth-3 u+4",
    "Open youth centres | Give them somewhere to go. | c1.2 youth+2 u-4",
  ]),
  sc("separatist_flags", "Unrest", "c", "Separatist Flags", "Rebel Province", "Separatist flags fly over {city}'s town hall.", "prefer:frontier,migrant sev:2 grow:.5 m:security-3", [
    "Tear them down | One country. | patriots+2 u+6",
    "Allow local flags, not independence | A gesture. | patriots-1 u-4",
    "Invest in {city} | Win hearts with money. | c1.6 u-6 g.01",
  ]),
  sc("hunger_strike", "Unrest", "c", "Hunger Strike", "Martyr in the Making", "A famous activist in {city} has stopped eating until the {leader} resigns.", "sev:2 grow:.5 m:integrity-2", [
    "Meet them | Show respect. | ^integrity+3 progressives+2",
    "Ignore them | No blackmail. | s1.2 u+4",
    "Force-feed them | Keep them alive. | progressives-3 integrity-3",
  ]),
  sc("police_brutality", "Unrest", "c", "Police Brutality Video", "City in Flames", "Video of police beating a man in {city} has sparked outrage.", "prefer:slums,capital,migrant sev:3 grow:.6 spread:.3 m:security-2,integrity-3", [
    "Charge the officers | Justice. | progressives+3 patriots-2",
    "Defend the police | They have a hard job. | patriots+2 poor-3 u+6",
    "Reform the police | Training and oversight. | c1.4 middle+1 u-4",
  ]),

  // ================= crime =================
  sc("bank_heist", "Crime", "c", "Bank Heist", "Heist Gang", "A gang robbed the national bank branch in {city} in broad daylight.", "prefer:market,capital sev:2 grow:.4 m:security-3,economy-2", [
    "Manhunt | Catch them all. | c1.2 security+2",
    "Offer a reward | Somebody will talk. | $-.01 s1.3",
    "Cover it up | Don't panic the markets. | integrity-3 ^integrity-4",
  ]),
  sc("serial_killer", "Crime", "c", "A Killer in {city}", "Reign of Terror", "A serial killer is stalking {city}. People are afraid to go out.", "sev:2 grow:.5 m:security-4 w:.5", [
    "Flood the streets with police | Visible safety. | c1.4 security+2",
    "Bring in the best detectives | Smart, not loud. | c1 tech.1",
    "Public curfew | Everyone home by dark. | jobs-1 u+3",
  ]),
  sc("cartel", "Crime", "c", "Cartel Moves In", "Narco State", "A drug cartel has taken over the docks of {city}.", "prefer:port,slums,frontier sev:3 grow:.6 spread:.3 gdp:.02 m:security-5,integrity-3", [
    "Send in the army | War on the cartel. | c1.6 military+1 progressives-1 u+3",
    "Legalise and regulate | Take their market. | progressives+2 religious-3 $.03",
    "Quiet deal with the bosses | Peace for a price. | integrity-5 ^integrity-8",
  ]),
  sc("protection_racket", "Crime", "c", "Protection Racket", "Mob Rule", "Shopkeepers in {city} pay gangsters to stay open.", "prefer:market,slums sev:2 grow:.5 m:security-3", [
    "Undercover sting | Catch them in the act. | c1.2 merchants+2",
    "Arm the shopkeepers | Let them defend themselves. | gunowners+2 progressives-2",
    "Ignore it | Not worth the trouble. | s.8 merchants-2",
  ]),
  sc("art_theft", "Crime", "c", "National Treasure Stolen", "", "The crown jewels of {country} were stolen from {city}'s museum.", "sev:2 grow:.2 m:integrity-2 w:.4", [
    "Hunt them across borders | Bring them home. | c1.2 patriots+2",
    "Pay the ransom | Get them back quietly. | $-.02 s1.4",
    "Commission replicas | No one will know. | integrity-3",
  ]),
  sc("prison_overcrowding", "Crime", "c", "Prisons Overflowing", "Prison Crisis", "{city}'s prisons hold three times their capacity.", "prefer:slums,garrison sev:2 grow:.4 m:security-2,services-2", [
    "Build new prisons | More cells. | c1.6 patriots+1",
    "Release minor offenders | Room for the dangerous. | progressives+2 patriots-2",
    "Labour camps | Put them to work. | jobs+1 progressives-3 integrity-2",
  ]),
  sc("corrupt_judge", "Crime", "c", "Corrupt Judge", "Courts for Sale", "A {city} judge has been selling verdicts.", "sev:2 grow:.4 m:integrity-4", [
    "Impeach the judge | Clean the bench. | integrity+3 progressives+1",
    "Overhaul the courts | Top-to-bottom reform. | c1.4 integrity+4",
    "Quietly reassign them | Avoid a scandal. | integrity-2 ^integrity-4",
  ]),

  // ================= corruption & scandal =================
  sc("minister_affair", "Scandal", "c", "Minister's Affair", "Scandal Rocks Cabinet", "A senior minister from {city} was caught in an affair with a foreign agent.", "sev:2 grow:.5 m:integrity-3,security-2", [
    "Fire the minister | Zero tolerance. | s1.4 ^integrity+3 religious+1",
    "Stand by them | Private life is private. | ^integrity-4 progressives+1",
    "Investigate for espionage | Find out what leaked. | c1 M security+2",
  ]),
  sc("leaked_tapes", "Scandal", "c", "Leaked Tapes", "Tapegate", "Recordings of the {ruler} insulting {city}'s voters have leaked.", "person:ruler sev:2 grow:.5 m:integrity-3", [
    "Apologise in {city} | Face them. | ^integrity+3 ^popularity-3",
    "Claim the tapes are fake | Deny, deny. | ^integrity-6 patriots+1",
    "Change the subject with a big announcement | Distract. | c1.2 ^popularity+2",
  ]),
  sc("nepotism", "Scandal", "c", "Nepotism Charges", "Family Business", "The {ruler}'s relatives hold a dozen top jobs in {city}.", "person:ruler sev:2 grow:.4 m:integrity-3", [
    "Fire them all | No favourites. | ^integrity+6 ^funds-5",
    "Defend their qualifications | They earned it. | ^integrity-5",
    "Create an ethics office | Rules for the future. | c.8 integrity+3",
  ]),
  sc("slush_fund", "Scandal", "c", "Slush Fund Uncovered", "The Black Ledger", "Auditors found a secret fund in the ministry of {city}.", "sev:3 grow:.5 m:integrity-5", [
    "Return the money and resign the treasurer | Damage control. | $.03 integrity+2",
    "Use it for public works | Make it look good. | @infrastructure+.03 integrity-2",
    "Shred everything | It never existed. | integrity-5 ^integrity-8 M",
  ]),
  sc("ghost_workers", "Scandal", "c", "Ghost Employees", "Payroll Fraud", "Thousands of names on {city}'s payroll belong to dead people.", "prefer:capital sev:2 grow:.4 m:integrity-3,economy-2", [
    "Audit every payroll | Find every ghost. | c1.2 $.04 integrity+2",
    "Prosecute the officials | Make examples. | integrity+3 middle+1",
    "Quietly fix it | No headlines. | $.02 integrity-1",
  ]),
  sc("rival_corruption", "Scandal", "o", "{rival}'s Secret Accounts", "", "Investigators traced money from {city}'s contracts to accounts linked to {rival}.", "person:rival w:.6", [
    "Demand prosecution | The law is for everyone. | M ~integrity-15 ~popularity-10 integrity+2",
    "Make a deal for their silence | Useful leverage. | ^integrity-5 ~funds-10",
    "Expose it on live TV | Maximum damage. | ~popularity-15 ^charisma+3",
  ]),

  // ================= media & culture =================
  sc("press_expose", "Media", "c", "Newspaper Exposé", "Media Firestorm", "{city}'s biggest paper accuses the government of lying about the budget.", "sev:2 grow:.5 m:integrity-3", [
    "Open the books | Transparency. | integrity+3 progressives+1",
    "Sue the paper | Defamation! | integrity-2 libertarians-1",
    "Buy the paper | Problem solved. | $-.03 integrity-4 @propaganda+.05",
  ]),
  sc("film_scandal", "Culture", "c", "Banned Film", "Culture War", "A film mocking the {leader} is playing to packed cinemas in {city}.", "prefer:capital,academy sev:2 grow:.4", [
    "Ban it | Respect the office. | religious+1 youth-2 integrity-3",
    "Laugh along | Show you can take a joke. | ^charisma+4 youth+1",
    "Make a rival film | Propaganda wars. | c1 @propaganda+.05",
  ]),
  sc("national_epic", "Culture", "o", "National Epic", "", "A poet from {city} has written an epic that the whole nation is reciting.", "w:.6", [
    "Make it required reading | Unite the nation. | patriots+2 youth-1",
    "Fund the arts | More where that came from. | c1 progressives+2 youth+1",
    "Have them write about the {leader} | Flattering verses. | ^popularity+4 integrity-1",
  ]),
  sc("sports_riot", "Culture", "c", "Sports Riot", "Stadium Disaster", "Fans rioted after the {city} derby. The stadium is wrecked.", "sev:2 grow:.4 m:security-2", [
    "Ban the clubs for a season | Make them learn. | youth-2 middle+1",
    "Rebuild the stadium | Sport unites us. | c1.4 youth+1 merchants+1",
    "Arrest the ringleaders | Punish the guilty. | security+2",
  ]),
  sc("state_tv", "Media", "o", "State Broadcaster Offer", "", "The national broadcaster offers to air a weekly show about the {leader}'s achievements.", "w:.7", [
    "Accept | Free airtime. | @propaganda+.08 ^popularity+4 integrity-2",
    "Ask for balanced coverage | Fair is fair. | integrity+2",
    "Privatise the broadcaster | Get the state out of media. | $.05 libertarians+2 @propaganda-.05",
  ]),
  sc("language_dispute", "Culture", "c", "Language Dispute", "Language War", "{city} demands its own language be taught in schools.", "prefer:frontier,migrant sev:2 grow:.4 m:services-1", [
    "Allow bilingual schools | Respect their heritage. | immigrants+2 patriots-2 u-4",
    "One national language | Unity. | patriots+2 immigrants-2 u+4",
    "Let each town decide | Local choice. | libertarians+1",
  ]),
  sc("monument", "Culture", "o", "Great Monument", "", "Architects propose a monument in {city} to {country}'s founding.", "w:.6", [
    "Build it grand | A wonder for the ages. | c2 patriots+2 u-4",
    "A modest memorial | Respectful, affordable. | c.8 patriots+1",
    "Spend it on schools instead | People over stone. | services+2 progressives+1",
  ]),
  sc("hacker_leak", "Media", "c", "Government Hacked", "Total Data Breach", "Hackers dumped secret government files online.", "sev:3 grow:.5 m:security-4,integrity-2", [
    "Hire the best defenders | Lock it down. | c1.4 @research+.04 security+2",
    "Blame {other} | Point at foreigners. | r-1 patriots+2",
    "Admit everything | Honesty heals. | integrity+3 ^popularity-3",
  ]),

  // ================= religion =================
  sc("prophet", "Religion", "c", "A New Prophet", "Prophet's Army", "A wandering preacher in {city} claims divine visions and draws huge crowds.", "prefer:temple,farmland,slums sev:2 grow:.5", [
    "Embrace the movement | Ride the wave of faith. | religious+3 progressives-2",
    "Have them arrested | Heresy and disorder. | religious-3 u+5",
    "Invite them to the palace | Keep your enemies close. | ^integrity-2 religious+1",
  ]),
  sc("temple_fire", "Religion", "c", "The Great Temple Burns", "", "The great temple of {city} burned down. Arson is suspected.", "prefer:temple sev:3 grow:.3 m:security-2", [
    "Rebuild it, bigger | Faith endures. | c1.8 religious+3",
    "Hunt the arsonists | Justice first. | c1 religious+1 security+2",
    "Build a public hall instead | Something for everyone. | c1.2 progressives+2 religious-3",
  ]),
  sc("religious_schism", "Religion", "c", "Schism", "Holy War", "The faithful of {city} have split into two rival churches.", "prefer:temple sev:2 grow:.5 spread:.3 m:security-2", [
    "Back the traditionalists | Old ways. | religious+2 youth-2",
    "Back the reformers | New ways. | progressives+2 religious-2",
    "Stay neutral | Not the state's business. | s.8 u+3",
  ]),
  sc("miracle", "Religion", "o", "Miracle in {city}", "", "Pilgrims swear a statue in {city} weeps real tears.", "w:.5", [
    "Build a shrine | Welcome the pilgrims. | c1 religious+3 merchants+1",
    "Scientific investigation | Find the truth. | c.6 tech.2 religious-2",
    "Say nothing official | Let people believe. | religious+1",
  ]),
  sc("heresy_trial", "Religion", "c", "Heresy Trial", "Inquisition", "The conclave wants a scholar in {city} tried for heresy.", "govs:theocracy sev:2 grow:.4", [
    "Hold the trial | The faith must be defended. | religious+3 progressives-3 youth-1",
    "Pardon the scholar | Mercy is holy too. | progressives+2 religious-2",
    "Exile them quietly | Out of sight. | religious+1",
  ]),
  sc("pilgrimage", "Religion", "o", "Great Pilgrimage", "", "Hundreds of thousands plan to walk to {city} for the holy year.", "govs:theocracy,monarchy prefer:temple", [
    "Build roads and inns | Welcome every pilgrim. | c1.4 @infrastructure+.03 religious+2 merchants+2",
    "Tax the pilgrims | Faith funds the state. | $.05 religious-1",
    "Lead the pilgrimage yourself | The {leader} walks with the people. | ^popularity+6 religious+2",
  ]),

  // ================= science, energy & infrastructure =================
  sc("power_grid", "Infrastructure", "c", "Blackouts", "Grid Collapse", "{city} has had no electricity for days.", "prefer:capital,market,slums sev:3 grow:.6 spread:.4 gdp:.04 m:services-4,jobs-2", [
    "Emergency generators | Lights on today. | c1.4 s1.3",
    "Rebuild the grid properly | Never again. | c2 @infrastructure+.06",
    "Ration power by district | Share the dark. | u+4",
  ]),
  sc("bridge_collapse", "Infrastructure", "c", "Bridge Collapse", "Transport Paralysis", "The great bridge into {city} collapsed at rush hour.", "sev:3 grow:.4 gdp:.03 m:services-3", [
    "Rebuild immediately | The best engineers. | c1.8 @infrastructure+.04",
    "Ferry service for now | Cheap and slow. | c.8 s.7",
    "Inspect every bridge | Prevent the next one. | c1.4 services+2",
  ]),
  sc("canal", "Infrastructure", "o", "Great Canal", "", "Engineers propose cutting a canal from {city} to the sea.", "prefer:farmland,market,port", [
    "Dig it with public money | A national project. | c2 @infrastructure+.08 g.03 workers+2",
    "Let a private company dig and charge tolls | Faster, they keep the tolls. | capitalists+2 merchants-1 g.02",
    "Too expensive | Maybe later. | s1.3 $.01",
  ]),
  sc("dam", "Infrastructure", "o", "Great Dam Proposal", "", "A dam above {city} would power half the country - and flood three villages.", "prefer:forest,farmland,frontier", [
    "Build it | Progress has a price. | c1.8 @infrastructure+.06 g.03 greens-3 farmers-2",
    "Smaller dam, no flooding | Less power, less pain. | c1.2 @infrastructure+.03 greens-1",
    "Protect the valley | Leave it be. | greens+3 farmers+1",
  ]),
  sc("oil_spill", "Environment", "c", "Oil Spill", "Coast of Death", "A tanker ran aground off {city}, spilling oil across the beaches.", "prefer:port sev:3 grow:.5 gdp:.03 m:food-3", [
    "Full cleanup | Every beach, every bird. | c1.8 greens+3",
    "Make the shippers pay | Lawsuits. | $.03 merchants-2",
    "Contain it and move on | Good enough. | c.8 greens-2",
  ]),
  sc("fuel_shortage", "Energy", "c", "Fuel Shortage", "Energy Crisis", "Pumps in {city} are dry and queues stretch for miles.", "sev:2 grow:.6 spread:.4 gdp:.03 m:economy-3,jobs-2", [
    "Release strategic reserves | Fill the tanks. | $-.02 s1.3",
    "Ration fuel | Odd and even days. | u+3",
    "Invest in alternatives | Long-term fix. | c1.6 tech.4 greens+2",
  ]),
  sc("nuclear_plant", "Energy", "o", "Atomic Power Plant", "", "Scientists offer to build an atomic power plant near {city}.", "prefer:academy,mining w:.6", [
    "Build it | Cheap power for a century. | c1.8 tech.5 g.03 greens-3",
    "Build it far from towns | Safer, costlier. | c2.2 tech.4 g.02",
    "Ban atomic power | Not worth the risk. | greens+3 tech-.2",
  ]),
  sc("reactor_leak", "Energy", "c", "Reactor Leak", "Meltdown", "Alarms are sounding at the power station near {city}.", "prefer:academy,mining sev:4 grow:.6 m:services-4,security-3 w:.3", [
    "Evacuate the region | Lives first. | c1.6 u+3 services+2",
    "Send in volunteer engineers | Heroes to the core. | c1.2 tech.2",
    "Keep it secret | Avoid panic. | integrity-6 ^integrity-8 M",
  ]),
  sc("invention", "Science", "o", "Brilliant Inventor", "", "An inventor in {city} has built a machine that does the work of ten men.", "", [
    "Fund a factory | Mass production! | c1.2 g.03 workers-1 capitalists+2",
    "Buy the patent for the nation | Public ownership. | c1.4 tech.5",
    "Ban it to protect jobs | People before machines. | workers+2 unions+2 tech-.2",
  ]),
  sc("internet_outage", "Infrastructure", "c", "Communications Down", "Total Blackout", "Phone and radio lines across {city} have gone silent.", "sev:2 grow:.5 gdp:.02 m:services-2,security-2", [
    "Military signal corps | Restore lines fast. | c1 military+1",
    "New national network | Modernise. | c1.8 @infrastructure+.05 tech.3",
    "Wait for repairs | It's just cables. | s.7",
  ]),
  sc("space_race", "Science", "o", "Rocket Programme", "", "Scientists at {city} say {country} could reach the sky.", "prefer:academy w:.5", [
    "Fund the rockets | National glory. | c2 tech.8 patriots+3 youth+2",
    "Military missiles instead | Defence first. | c1.6 @military+.08 progressives-1",
    "Too expensive | Feet on the ground. | $.01 libertarians+1",
  ], ["rivals", "Space Race", "{origin} is building rockets in {city}. Will {country} keep up?", [
    "Launch our own programme | We won't be left behind. | c.05 tech.4 patriots+2",
    "Spy on their programme | Steal their designs. | c.02 tech.3 r-1",
    "Propose a joint mission | Science unites. | c.03 r1 tech.2 op10",
  ]]),

  // ================= economy & trade =================
  sc("bank_run", "Economy", "c", "Bank Run", "Banking Panic", "Crowds are pulling their savings from banks in {city}.", "prefer:market,capital sev:3 grow:.7 spread:.4 gdp:.04 m:economy-5", [
    "Guarantee all deposits | Calm everyone. | c1.6 middle+2 retirees+2",
    "Close the banks for a week | Stop the bleeding. | s1.3 u+4 merchants-2",
    "Let weak banks fail | Survival of the fittest. | libertarians+2 middle-3",
  ]),
  sc("currency_crisis", "Economy", "c", "Currency Collapse", "Worthless Money", "{country}'s currency lost a third of its value this week.", "sev:3 grow:.6 gdp:.04 m:economy-5", [
    "Defend the currency | Burn reserves. | $-.05 capitalists+1",
    "Let it fall | Exports get cheaper. | merchants+2 poor-2 g.01",
    "New currency | Start fresh. | c1.4 M",
  ]),
  sc("monopoly", "Economy", "c", "Monopoly", "Corporate Empire", "One company now owns every shop in {city}.", "prefer:market,capital sev:2 grow:.3 m:economy-2", [
    "Break it up | Competition matters. | c1 capitalists-3 merchants+2 middle+1",
    "Regulate their prices | Keep them honest. | capitalists-1 poor+1",
    "Leave them alone | Success isn't a crime. | capitalists+2 libertarians+1 merchants-2",
  ]),
  sc("factory_closure", "Economy", "c", "Factory Closing", "Rust Belt", "The biggest factory in {city} is closing, taking thousands of jobs.", "prefer:mining,port,slums sev:2 grow:.4 gdp:.02 m:jobs-5", [
    "Nationalise it | Save the jobs. | c1.8 unions+3 workers+2 capitalists-3",
    "Retrain the workers | New skills, new jobs. | c1.2 workers+1 g.01",
    "Let it close | The market has spoken. | capitalists+1 workers-3 u+4",
  ]),
  sc("gold_rush", "Economy", "o", "Gold Rush", "", "Gold has been found in the streams near {city}.", "prefer:frontier,mining,forest", [
    "State claims the gold | Fill the treasury. | $.15 libertarians-2",
    "First come, first served | Let the people dig. | g.04 libertarians+2 security-2",
    "Licence the miners | Order and profit. | $.07 g.02",
  ], ["neighbours", "Gold Fever Next Door", "{origin} struck gold near {city}. Prospectors are crossing the border.", [
    "Let our people go dig | Bring the gold home. | g.02 r-1 og-.01",
    "Close the border | Keep our workers home. | jobs+1 r-1",
    "Sell them supplies | Profit from their rush. | g.015 merchants+2",
  ]]),
  sc("tourism_boom", "Economy", "o", "Tourism Boom", "", "Travel writers have discovered {city}. Visitors are pouring in.", "prefer:port,temple,forest", [
    "Build hotels | Cash in. | c1 g.03 merchants+2 greens-1",
    "Tourist tax | Visitors pay their way. | $.04 merchants-1",
    "Protect the town's character | Limit the crowds. | greens+1 retirees+1",
  ]),
  sc("debt_crisis", "Economy", "c", "Creditors at the Door", "Default", "Foreign lenders demand repayment and threaten to cut {country} off.", "sev:3 grow:.5 gdp:.03 m:economy-4", [
    "Austerity budget | Pay every penny. | services-3 poor-2 capitalists+2 $.06",
    "Renegotiate | Ask for time. | M r-1",
    "Default | Refuse to pay. | $.1 r-2 capitalists-3 economy-5",
  ]),
  sc("smuggled_goods", "Trade", "c", "Cheap Foreign Goods", "Market Flood", "Cheap goods from {other} are flooding {city} and local workshops are failing.", "needs:other prefer:market,port sev:2 grow:.4 m:jobs-3", [
    "Raise tariffs | Protect our makers. | tariff+5 workers+2 merchants-2 r-1",
    "Subsidise local workshops | Help them compete. | c1.2 workers+1",
    "Let cheap goods in | Consumers win. | poor+2 workers-2",
  ], ["other", "Our Exports", "{origin} is debating tariffs on our goods sold in {city}.", [
    "Lobby them hard | Keep the market open. | c.02 op-20",
    "Threaten retaliation | Tit for tat. | r-1 patriots+1",
    "Accept limits gracefully | Keep the peace. | r1",
  ]]),
  sc("trade_fair", "Trade", "o", "Grand Trade Fair", "", "{city} could host the continent's biggest trade fair.", "prefer:market,port,capital", [
    "Host it lavishly | Show the world. | c1.4 g.03 merchants+3 ally1",
    "Host it modestly | Good business. | c.8 g.015 merchants+1",
    "Decline | Not this year. | s1.3",
  ]),

  // ================= labor & society =================
  sc("child_labor", "Labor", "c", "Child Labour Scandal", "Factories of Shame", "Reporters found children working in {city}'s mills.", "prefer:slums,mining sev:2 grow:.4 m:integrity-3", [
    "Ban child labour outright | Never again. | progressives+3 capitalists-2",
    "Fines for the owners | Make it costly. | $.02 progressives+1",
    "Schools with free meals | Give families a reason. | c1.4 poor+2 youth+1",
  ]),
  sc("automation", "Labor", "c", "Machines Take the Jobs", "Machine Breakers", "Automated looms threw thousands out of work in {city}. Workers are smashing machines.", "prefer:mining,market sev:2 grow:.5 m:jobs-4", [
    "Tax the machines | Fund the workers. | $.03 unions+2 capitalists-2",
    "Retraining for everyone | The future needs skills. | c1.4 workers+1 tech.2",
    "Protect the factories | Progress can't stop. | capitalists+2 workers-3 u+4",
  ]),
  sc("minimum_wage", "Labor", "c", "Wage Demands", "Wage War", "Workers in {city} demand a minimum wage.", "sev:2 grow:.4 m:jobs-2", [
    "Set a generous minimum | Dignity in work. | unions+3 poor+2 capitalists-3",
    "A modest minimum | Something for now. | unions+1 capitalists-1",
    "No minimum | Wages are for the market. | capitalists+2 poor-3",
  ]),
  sc("slum_fire", "Society", "c", "Slum Fire", "Shanty Inferno", "Fire swept through {city}'s shanty town. Thousands are homeless.", "prefer:slums,migrant sev:3 grow:.5 m:services-4", [
    "Rehouse everyone | Proper homes. | c1.8 poor+3 immigrants+2",
    "Tents and soup kitchens | Survive the season. | c.8 poor+1",
    "Clear the land for development | Build something better. | capitalists+2 poor-3 u+6",
  ]),
  sc("baby_boom", "Society", "o", "Baby Boom", "", "Birth rates in {city} have soared. Schools will need to grow.", "", [
    "Build schools and nurseries | Invest in the young. | c1.4 services+2 middle+2",
    "Child benefit for families | Money in hands. | c1.2 poor+2 religious+1",
    "Let families manage | Not the state's job. | libertarians+1",
  ]),
  sc("aging", "Society", "c", "Ageing Population", "Grey Crisis", "{city} has more pensioners than workers.", "prefer:retirement,farmland sev:2 grow:.3 m:services-3,jobs-2", [
    "Welcome young migrants | New blood. | immigrants+2 patriots-2 g.01",
    "Raise the pension age | Work longer. | retirees-3 $.03",
    "Pay families to have children | Long game. | c1.2 religious+1",
  ]),
  sc("brain_drain", "Society", "c", "Brain Drain", "Exodus of Talent", "{city}'s brightest graduates are moving to {other}.", "needs:other prefer:academy,capital sev:2 grow:.4 m:economy-2", [
    "Pay them to stay | Scholarships with strings. | c1.2 youth+2",
    "Build world-class labs | Give them a reason. | c1.6 tech.4 @research+.04",
    "Let them go | They'll come back richer. | youth-1 r1",
  ]),
  sc("refugee_camp", "Society", "c", "Refugee Camp Overflowing", "Camp Riots", "The refugee camp near {city} holds three times its capacity.", "prefer:migrant,frontier sev:2 grow:.5 m:services-3,security-2", [
    "Settle them in towns | Integration. | c1.4 immigrants+3 patriots-2",
    "Expand the camp | More tents, more food. | c1 immigrants+1",
    "Send them back | Close the camp. | patriots+3 immigrants-4 progressives-2 u+4",
  ]),
  sc("school_crisis", "Society", "c", "Schools Failing", "Lost Generation", "Half of {city}'s schools have no teachers.", "sev:2 grow:.4 m:services-3", [
    "Double teacher pay | Fill every classroom. | c1.6 middle+2 youth+1",
    "Volunteer teaching corps | Patriotic service. | c.6 patriots+1",
    "Close the worst schools | Concentrate resources. | youth-2 farmers-1",
  ]),

  // ================= military & security =================
  sc("mutiny", "Military", "c", "Mutiny", "Army Revolt", "Soldiers at the {city} barracks refuse orders over unpaid wages.", "prefer:garrison sev:3 grow:.6 m:security-5", [
    "Pay them now | Loyalty is bought. | c1.4 military+3",
    "Arrest the ringleaders | Discipline. | military-3 patriots+1",
    "Disband the regiment | Start over. | @military-.08 military-2",
  ]),
  sc("arms_deal", "Military", "o", "Arms Dealer's Offer", "", "A foreign arms dealer offers modern weapons at a bargain price.", "w:.7", [
    "Buy everything | Modern army. | c1.6 @military+.1 patriots+2",
    "Buy a little | Test the goods. | c.8 @military+.04",
    "Refuse | Peace through diplomacy. | progressives+2 military-1",
  ]),
  sc("border_incident", "Military", "c", "Border Incident", "Border Skirmishes", "Shots were fired between our patrols and {other}'s near {city}.", "needs:enemy prefer:frontier,garrison sev:2 grow:.5 m:security-3", [
    "Demand an apology | Firm but peaceful. | r-1 patriots+1",
    "Fortify the border | Show strength. | c1.4 @military+.05 patriots+2",
    "Joint investigation | Calm things down. | r1 progressives+1",
  ], ["other", "Shots at the Border", "Our patrol exchanged fire with {origin}'s near {city}.", [
    "Apologise | De-escalate. | r1 patriots-1 op30",
    "Blame them | We did nothing wrong. | patriots+1 osev+1",
    "Reinforce our side | Send troops. | c.02 r-1 @military+.03",
  ]]),
  sc("deserters", "Military", "c", "Deserters in the Hills", "Deserter Bands", "Armed deserters from {city}'s garrison are robbing travellers.", "prefer:garrison,forest,frontier sev:2 grow:.5 m:security-3", [
    "Hunt them down | No mercy. | c1.2 security+2 military+1",
    "Offer amnesty | Come home, no questions. | progressives+1 military-1 u-4",
    "Hire them as guards | Turn bandits into watchmen. | security+1 integrity-1",
  ]),
  sc("conscription", "Military", "c", "Conscription Debate", "Draft Riots", "Generals want a draft. Young people in {city} are furious.", "prefer:academy,capital sev:2 grow:.4", [
    "Introduce the draft | Every young person serves. | @military+.1 patriots+2 youth-3 u+4",
    "Volunteer army with better pay | Professional soldiers. | c1.4 @military+.05 military+1",
    "No draft | Freedom first. | youth+2 military-2",
  ]),
  sc("spy_ring", "Espionage", "c", "Spy Ring", "Network of Traitors", "A spy ring working for {other} has been operating in {city} for years.", "needs:other sev:2 grow:.5 m:security-4", [
    "Arrest them all | Public trial. | security+3 r-2 patriots+2",
    "Turn them into double agents | Feed them lies. | c1 tech.2 security+1",
    "Expel quietly | Avoid a scandal. | r-1",
  ], ["other", "Our Agents Exposed", "Our spy ring in {origin}'s {city} has been discovered.", [
    "Deny everything | They have no proof. | r-1",
    "Trade prisoners | Get our people home. | r1 op30",
    "Retaliate - arrest their diplomats | Tit for tat. | r-2 patriots+1",
  ]]),
  sc("weapons_cache", "Military", "c", "Weapons Cache Found", "Armed Underground", "Police found a huge weapons cache under a farmhouse near {city}.", "sev:2 grow:.4 m:security-3", [
    "Hunt the owners | Who planned this? | c1.2 security+3",
    "Gun amnesty | Hand them in, no questions. | gunowners+1 security+1",
    "Stricter gun laws | Never again. | progressives+2 gunowners-3",
  ]),
  sc("veteran_hero", "Military", "o", "War Hero Returns", "", "A decorated general from {city} has retired and is very popular.", "", [
    "Make them a minister | Their glory, our team. | military+2 ^popularity+4",
    "Parade in their honour | Celebrate service. | c.6 patriots+2",
    "Keep them out of politics | Generals belong in barracks. | progressives+1 military-1",
  ]),

  // ================= diplomacy =================
  sc("royal_wedding", "Diplomacy", "o", "Marriage Proposal", "", "{other}'s ruling family proposes a marriage alliance with {country}'s.", "needs:other w:.6", [
    "Accept the match | Bind our nations. | r2 religious+1",
    "Demand a dowry | Make it worth our while. | r1 $.04",
    "Decline politely | We marry for love. | r-1 progressives+1",
  ]),
  sc("embassy_attack", "Diplomacy", "c", "Embassy Attacked", "Embassy Siege", "A mob attacked {other}'s embassy in {city}.", "needs:other sev:2 grow:.5 m:security-2", [
    "Apologise and pay damages | Make it right. | $-.02 r1",
    "Blame provocateurs | Not our fault. | r-1 patriots+1",
    "Arrest the mob | Rule of law. | security+2",
  ], ["other", "Our Embassy Attacked", "A mob stormed our embassy in {origin}'s {city}.", [
    "Demand compensation | They must pay. | o$-.02 r-1",
    "Recall our ambassador | Show displeasure. | r-1 patriots+1",
    "Accept their apology | Move on. | r1 op30",
  ]]),
  sc("summit", "Diplomacy", "o", "Peace Summit", "", "{other} invites {country} to a summit in {othercity}.", "needs:other", [
    "Attend with big proposals | Make history. | c.8 r2 ^charisma+3",
    "Send a deputy | Polite but cautious. | r1",
    "Boycott | We don't negotiate. | r-1 patriots+1",
  ]),
  sc("hostage_diplomat", "Diplomacy", "c", "Diplomat Arrested", "Hostage Diplomacy", "{other} arrested our diplomat in {othercity} on spy charges.", "needs:enemy sev:2 grow:.4 m:integrity-2", [
    "Prisoner swap | Get them home. | r1",
    "Sanctions until released | Pressure. | tariff+5 r-1 patriots+1",
    "Secret rescue | Bold. | c1.2 M @military-.02",
  ]),
  sc("refugee_ruler", "Diplomacy", "c", "Exiled Ruler Seeks Refuge", "", "The deposed ruler of {other} begs for asylum in {city}.", "needs:other w:.5", [
    "Grant asylum | Honour demands it. | r-2 progressives+1",
    "Hand them over | Good relations first. | r2 integrity-2",
    "Send them elsewhere | Not our problem. | s1.3",
  ]),
  sc("aid_offer", "Diplomacy", "o", "Foreign Aid Offer", "", "{other} offers {country} a generous development package.", "needs:ally", [
    "Accept gratefully | Build with their money. | $.06 @infrastructure+.03 r1 patriots-1",
    "Accept with conditions | No strings on our policy. | $.03 r1",
    "Refuse | We stand on our own. | patriots+2 r-1",
  ]),
  sc("sanctions", "Diplomacy", "c", "Sanctions", "Economic Siege", "{other} has slapped sanctions on {country}'s exports from {city}.", "needs:enemy prefer:port,market sev:2 grow:.5 gdp:.03 m:economy-3", [
    "Counter-sanctions | Hit them back. | tariff+5 r-1 patriots+2",
    "Find new markets | Trade elsewhere. | c1.2 merchants+1 ally1",
    "Negotiate | Give a little. | r1 patriots-1",
  ], ["other", "Our Sanctions", "Our sanctions are squeezing {origin}.", [
    "Tighten them | Squeeze harder. | osev+1 og-.01 r-1",
    "Offer a deal | Lift for concessions. | r1 op20",
    "Lift them | They've learned. | r1 merchants+1 op50",
  ]]),

  // ================= war =================
  sc("siege", "War", "c", "Siege of {city}", "City Under Siege", "{other}'s forces have surrounded {city}.", "needs:war prefer:frontier,garrison sev:4 grow:.6 gdp:.05 m:security-6,food-3", [
    "Break the siege | All forces to {city}. | c1.8 M @military-.05",
    "Supply by night | Hold out. | c1.2 s.8 food+1",
    "Negotiate surrender terms | Save lives. | patriots-4 cede",
  ], ["other", "Our Siege", "Our army has {origin}'s {city} surrounded.", [
    "Storm the walls | Take it now. | c.04 X",
    "Starve them out | Patience. | c.02 osev+1",
    "Offer terms | Let them surrender. | r1 op20",
  ]]),
  sc("war_profiteers", "War", "c", "War Profiteers", "Profiteering Scandal", "Suppliers in {city} are selling the army rotten boots at triple the price.", "needs:war sev:2 grow:.4 m:integrity-4,security-2", [
    "Seize their factories | The war effort comes first. | capitalists-3 patriots+2",
    "Prosecute | Courts decide. | M integrity+2",
    "Pay up - we need the boots | War is war. | $-.03 integrity-2",
  ]),
  sc("war_weariness", "War", "c", "War Weariness", "Anti-War Uprising", "Mothers in {city} march against the war with {other}.", "needs:war sev:2 grow:.5 m:integrity-2,security-2", [
    "Seek peace | Enough blood. | r2 patriots-3 progressives+3",
    "Rally the nation | Victory is near. | c1 @propaganda+.05 patriots+2",
    "Ban the marches | No defeatism. | progressives-3 u+5",
  ]),
  sc("pow_exchange", "War", "o", "Prisoner Exchange", "", "{other} offers to trade prisoners of war.", "needs:war", [
    "Exchange all prisoners | Bring them home. | r1 military+2",
    "Exchange officers only | Keep leverage. | military+1",
    "Refuse | Not while they fight. | patriots+1 military-2",
  ]),
  sc("partisans", "War", "c", "Partisans Behind the Lines", "Guerrilla War", "Partisans loyal to {other} are ambushing supply lines near {city}.", "needs:war sev:3 grow:.5 spread:.3 m:security-4", [
    "Sweep the countryside | Root them out. | c1.4 u+5 security+2",
    "Win the villages | Food and medicine. | c1.2 u-4",
    "Fortify the roads | Defend, don't chase. | c1.2 @military-.02",
  ]),

  // ================= government flavours =================
  sc("court_intrigue", "Court", "c", "Court Intrigue", "Palace Conspiracy", "Nobles from {city} are whispering against the {leader} at court.", "govs:monarchy sev:2 grow:.5 m:integrity-2", [
    "Grant them titles | Buy their loyalty. | c1.2 wealthy+2",
    "Banish the plotters | Make an example. | wealthy-2 security+2",
    "Throw a grand feast | Charm them back. | c1 ^charisma+4",
  ]),
  sc("succession", "Court", "c", "Succession Dispute", "War of Succession", "Two heirs claim the right to succeed the {leader}. {city} backs the younger.", "govs:monarchy,clan sev:3 grow:.5 m:security-3", [
    "Name the elder heir | Tradition. | religious+2 youth-1",
    "Name the younger heir | Fresh blood. | youth+2 religious-1",
    "Let the council vote | Shared choice. | M progressives+1",
  ]),
  sc("royal_birth", "Court", "o", "Royal Birth", "", "An heir has been born! {city} wants to host the celebrations.", "govs:monarchy", [
    "Nationwide celebration | Bells in every town. | c1 patriots+2 religious+1 u-4",
    "Pardon prisoners in honour | Mercy for the heir. | progressives+1 security-1",
    "A quiet blessing | Humble beginnings. | religious+1",
  ]),
  sc("clan_feud", "Court", "c", "Blood Feud", "Clan War", "Two great clans from {city} have begun a blood feud.", "govs:clan sev:3 grow:.6 spread:.3 m:security-4", [
    "Judge the feud yourself | The {leader}'s word is law. | ^competence+3",
    "Arrange a marriage between them | Peace through family. | c.8 u-4",
    "Let them fight it out | Strength decides. | u+6 gunowners+1",
  ]),
  sc("clan_moot", "Court", "o", "Great Moot", "", "All clans gather at {city} for the great moot.", "govs:clan", [
    "Host it lavishly | Honour every clan. | c1.2 ^popularity+5",
    "Use it to pass new laws | Get things done. | ^competence+4",
    "Hold contests of strength | Glory and games. | youth+2 military+1",
  ]),
  sc("party_purge", "Party", "c", "Party Purge", "Great Purge", "Hardliners in {city} demand a purge of 'disloyal' party members.", "govs:singleparty sev:2 grow:.5 m:integrity-3", [
    "Purge the disloyal | Unity above all. | patriots+2 integrity-4 u+3",
    "Refuse - unity through debate | Let the party breathe. | progressives+2 patriots-2",
    "Purge the hardliners instead | Turn the tables. | M ^competence+3",
  ]),
  sc("five_year_plan", "Party", "o", "Five-Year Plan", "", "Planners present an ambitious five-year plan for {city}.", "govs:singleparty", [
    "Adopt the bold plan | Steel and grain! | c1.4 g.04 workers+2 farmers-1",
    "A cautious plan | Steady growth. | c.8 g.02",
    "Let the regions plan | Local knowledge. | libertarians+1 g.01",
  ]),
  sc("coup_plot", "Barracks", "c", "Coup Plot", "Officers' Revolt", "Colonels in {city} plot to replace the {leader}.", "govs:junta sev:3 grow:.6 m:security-4", [
    "Arrest the colonels | Strike first. | military-2 security+3",
    "Promote them | Make them loyal. | c1 military+2",
    "Purge the officer corps | Clean house. | @military-.06 security+2 military-3",
  ]),
  sc("junta_parade", "Barracks", "o", "Victory Parade", "", "The army wants to march through {city} to show its strength.", "govs:junta", [
    "Grand parade | Tanks on every street. | c1 patriots+3 military+2",
    "Small honour guard | Dignified. | military+1",
    "Cancel it | Spend it on soldiers' pay. | military+1 patriots-1",
  ]),
  sc("guild_merger", "Guilds", "o", "Guild Merger", "", "The two richest guilds of {city} want to merge into one giant house.", "govs:guild", [
    "Approve it | Bigger is better. | capitalists+3 merchants-2 g.02",
    "Approve with limits | Keep some competition. | capitalists+1 merchants+1",
    "Block it | No monopolies. | merchants+3 capitalists-2",
  ]),
  sc("guild_strike", "Guilds", "c", "Guild Boycott", "Guild Embargo", "The {city} guilds refuse to trade until their charters are renewed.", "govs:guild sev:2 grow:.5 gdp:.03 m:economy-3", [
    "Renew their charters | Business as usual. | merchants+2 capitalists+2",
    "Open trade to outsiders | Break their grip. | merchants-3 immigrants+1 g.01",
    "Tax their reserves | Make them pay to sulk. | $.04 merchants-2",
  ]),
  sc("filibuster", "Parliament", "c", "Filibuster", "Legislative Gridlock", "Opposition members from {city} have blocked every bill for weeks.", "govs:parliament,democracy sev:2 grow:.4 m:integrity-1,services-2", [
    "Change the rules | End the filibuster. | integrity-2 progressives+1",
    "Compromise with them | Give them something. | ^popularity-2 middle+2",
    "Call a snap election | Let the voters break the deadlock. | M",
  ]),
  sc("referendum_call", "Parliament", "c", "Referendum Petition", "Referendum Fever", "A petition from {city} demands a national referendum.", "govs:democracy,parliament sev:2 grow:.4", [
    "Hold the referendum | The people decide. | M integrity+3",
    "Reject the petition | Representatives decide. | integrity-2 libertarians-2",
    "Hold a consultative poll | Listen, don't bind. | c.6 integrity+1",
  ]),
  sc("oracle", "Conclave", "o", "The Oracle Speaks", "", "The oracle of {city} has made a prophecy about the {leader}.", "govs:theocracy w:.8", [
    "Proclaim it far and wide | Heaven favours us. | ^popularity+6 religious+2",
    "Interpret it carefully | Avoid unwelcome readings. | ^competence+3",
    "Seal it in the archives | Not everything should be known. | integrity-1",
  ]),
];
