// Situations. Each has its own three responses plus "Do nothing" (always available).
// Many also give OTHER countries a counter-situation with their own choices: help,
// exploit, or escalate into a dispute that an admin rules on.
//
// Fillers: {country} owner, {city} affected city/cities, {other} the other country
// involved, {othercity} one of the other country's cities, {lobby} an interest
// group, {leader} the leader's title. All of them are the names players entered.
// In counters: {country} is the reacting nation, {origin} the nation in trouble.
//
// Template fields
//   kind      crisis (escalates if neglected) | opportunity (expires if ignored)
//   needs     other | enemy (war/rival/tense) | war | ally   (who {other} can be)
//   prefer    county types it tends to hit
//   cities    [min, max] cities affected at once
//   severity  starting severity 1-5;  growth  added per turn while neglected
//   spread    chance to spread to a neighbouring city when it escalates
//   gdp       share of an affected city's output lost per severity point
//   metrics   performance damage per severity point while active
//   manual    the outcome must be ruled on by an admin (e.g. battles)
// Option fields
//   cost      funding cost multiplier;  speed  how fast it resolves
//   groups    how interest groups react (remembered until the next election)
//   fx        on success: treasury/gdp (share of GDP), relation (steps with
//             {other}), metrics, stock, tech, tariff, incomeTax, unrest, special
//   contest   (counters) opens a dispute the admin must rule on
//   origin    (counters) effect on the origin's situation: progress, severity,
//             treasury, gdp

import { MORE_SCENARIOS } from "./scenarios_more.js";
import { applyChains, FOLLOW_UPS } from "./chains.js";

const o = (label, desc, p = {}) => ({ label, desc, cost: 1, speed: 1, groups: {}, fx: {}, ...p });

export const SCENARIOS = [
  // ---------------- economy & opportunity ----------------
  {
    id: "deposit", cat: "Economy", kind: "opportunity", title: "Resource Strike",
    text: "{country} has uncovered a massive deposit of natural resources beneath {city}.",
    prefer: ["mining", "frontier", "forest"], severity: 2,
    options: [
      o("Nationalize the mine", "State-run, profits go to the treasury.", { cost: 1.2, groups: { unions: 0.25, workers: 0.2, capitalists: -0.25 }, fx: { treasury: 0.12, gdp: 0.03 } }),
      o("Sell mining rights to private firms", "Quick cash and private investment.", { cost: 0.4, speed: 1.3, groups: { capitalists: 0.3, merchants: 0.15, unions: -0.2 }, fx: { treasury: 0.2, gdp: 0.02 } }),
      o("Protect the land - leave it buried", "Keep the wilderness untouched.", { cost: 0.2, groups: { greens: 0.35, farmers: 0.1, workers: -0.2 }, fx: { metrics: { food: 5 } } }),
    ],
    counter: {
      who: "neighbours", title: "Rival's Resource Strike",
      text: "{origin} struck it rich: a huge resource deposit under {city}. What will {country} do?",
      options: [
        o("Invest in a joint venture", "Share the costs and the profits.", { cost: 0.03, groups: { capitalists: 0.15 }, fx: { gdp: 0.02, relation: 1 }, origin: { progress: 20, gdp: 0.01 } }),
        o("Seize the deposit", "Send troops to claim it. Opens a dispute.", { contest: "city", groups: { patriots: 0.2, progressives: -0.15 }, fx: { relation: -2 } }),
        o("Undercut their exports", "Flood the market to cut their profits.", { cost: 0.02, groups: { merchants: 0.1 }, fx: { gdp: 0.01, relation: -1 }, origin: { gdp: -0.01 } }),
      ],
    },
  },
  {
    id: "trade_offer", cat: "Diplomacy", kind: "opportunity", title: "Trade Agreement", needs: "other",
    text: "Envoys from {other}'s {othercity} arrive in {city} offering {country} a sweeping trade agreement.",
    prefer: ["port", "market", "capital"], severity: 1,
    options: [
      o("Sign it as written", "Open markets on both sides.", { cost: 0.2, speed: 1.3, groups: { merchants: 0.3, capitalists: 0.2, workers: -0.15, farmers: -0.15 }, fx: { relation: 1, gdp: 0.03 } }),
      o("Demand protections for our workers", "Slower, but keeps the unions happy.", { cost: 0.4, speed: 0.7, groups: { unions: 0.15, workers: 0.1 }, fx: { gdp: 0.015 } }),
      o("Reject the deal", "Protect home industry.", { cost: 0.1, speed: 1.5, groups: { workers: 0.15, farmers: 0.15, merchants: -0.25 }, fx: { relation: -1 } }),
    ],
  },
  {
    id: "market_crash", cat: "Economy", kind: "crisis", title: "Market Crash", escalated: "Financial Collapse",
    text: "Panic on the {city} exchange - share prices are collapsing across {country}.",
    prefer: ["market", "capital"], severity: 2, growth: 0.7, gdp: 0.04, metrics: { economy: -5, jobs: -3 },
    options: [
      o("Bail out the banks", "Expensive, but stops the bleeding fast.", { cost: 2, speed: 1.3, groups: { wealthy: 0.25, capitalists: 0.2, poor: -0.2, unions: -0.1 } }),
      o("Let them fail", "Cheap. The market will sort itself out... eventually.", { cost: 0.3, speed: 0.8, groups: { libertarians: 0.25, capitalists: -0.3, poor: -0.1 }, fx: { gdp: -0.03 } }),
      o("Stimulus checks for families", "Put money in people's pockets.", { cost: 1.6, groups: { poor: 0.25, unions: 0.15, middle: 0.1, wealthy: -0.15 } }),
    ],
    counter: {
      who: "trade", title: "Foreign Market Crash",
      text: "{origin}'s markets are crashing. The panic could spread to {country}.",
      options: [
        o("Offer an emergency loan", "Steady their markets - and earn interest.", { cost: 0.04, groups: { capitalists: 0.1 }, fx: { relation: 1, treasury: 0.05 }, origin: { severity: -1, progress: 15 } }),
        o("Buy up their companies cheap", "Profit from their pain.", { cost: 0.02, groups: { capitalists: 0.2, unions: -0.05 }, fx: { gdp: 0.02, relation: -1 }, origin: { gdp: -0.02 } }),
        o("Shield our own markets", "Close ranks and ride it out.", { cost: 0.01, groups: { workers: 0.05 }, fx: { metrics: { economy: 3 } } }),
      ],
    },
  },
  {
    id: "inflation", cat: "Economy", kind: "crisis", title: "Price Spiral", escalated: "Hyperinflation",
    text: "Prices in {city} are soaring - bread costs twice what it did last season.",
    prefer: ["capital", "slums", "market"], severity: 2, growth: 0.6, gdp: 0.03, metrics: { economy: -4, jobs: -2 },
    options: [
      o("Raise interest rates", "Painful, but it works.", { cost: 0.3, groups: { capitalists: 0.15, wealthy: 0.1, poor: -0.15, middle: -0.05 }, fx: { gdp: -0.015 } }),
      o("Freeze prices", "Shops hate it. Families love it.", { cost: 0.6, speed: 0.9, groups: { poor: 0.2, merchants: -0.3, capitalists: -0.1 } }),
      o("Print more money", "Fast relief now, bigger problems later.", { cost: 0.1, speed: 1.4, groups: { libertarians: -0.2, wealthy: -0.1, poor: 0.05 }, fx: { metrics: { economy: -6 } } }),
    ],
  },
  {
    id: "strike", cat: "Labor", kind: "crisis", title: "Strike", escalated: "General Strike",
    text: "Dockworkers and miners in {city} have walked off the job.",
    prefer: ["mining", "port", "slums"], severity: 2, growth: 0.6, spread: 0.3, gdp: 0.05, metrics: { jobs: -5 },
    options: [
      o("Meet their demands", "Higher wages, back to work.", { cost: 1.4, groups: { unions: 0.3, workers: 0.2, capitalists: -0.2 } }),
      o("Bring in replacement workers", "Break the strike.", { cost: 0.8, speed: 1.2, groups: { capitalists: 0.2, unions: -0.35, workers: -0.2 } }),
      o("Send in the police", "Fast and brutal.", { cost: 0.6, speed: 1.5, groups: { patriots: 0.1, unions: -0.4, progressives: -0.2, libertarians: -0.1 }, fx: { unrest: 8 } }),
    ],
    counter: {
      who: "neighbours", title: "Strike Across the Border",
      text: "Workers are on strike in {origin}'s {city}. {country} could get involved.",
      options: [
        o("Fund the strikers", "Keep their factories idle.", { cost: 0.02, groups: { unions: 0.1 }, fx: { relation: -1 }, origin: { severity: 1 } }),
        o("Poach their skilled workers", "Offer jobs on our side of the border.", { cost: 0.01, groups: { capitalists: 0.1, workers: -0.05 }, fx: { gdp: 0.01 }, origin: { gdp: -0.01 } }),
        o("Offer to mediate", "Earn goodwill as a peacemaker.", { cost: 0.005, groups: { progressives: 0.05 }, fx: { relation: 1 }, origin: { progress: 25 } }),
      ],
    },
  },
  {
    id: "breakthrough", cat: "Science", kind: "opportunity", title: "Scientific Breakthrough",
    text: "Scientists in {city} have made a breakthrough that could launch a whole new industry.",
    prefer: ["academy", "capital"], severity: 2,
    options: [
      o("Fund it with public money", "The people own the future.", { cost: 1.4, groups: { progressives: 0.2, youth: 0.15, wealthy: -0.05 }, fx: { tech: 1, gdp: 0.03 } }),
      o("Let private investors run it", "Profits for the bold.", { cost: 0.3, speed: 1.2, groups: { capitalists: 0.25 }, fx: { treasury: 0.05, gdp: 0.02 } }),
      o("Hand it to the military", "Make it a weapon first.", { cost: 0.8, groups: { military: 0.25, patriots: 0.1, progressives: -0.15 }, fx: { stock: { military: 0.1 } } }),
    ],
    counter: {
      who: "rivals", title: "Technology Race",
      text: "{origin} is on the verge of a technological leap in {city}.",
      options: [
        o("License the technology", "Pay for it fair and square.", { cost: 0.03, fx: { tech: 0.6, relation: 1 }, origin: { treasury: 0.03 } }),
        o("Steal it with spies", "Cheaper - if nobody notices.", { cost: 0.01, groups: { patriots: 0.05 }, fx: { tech: 0.8, relation: -2 } }),
        o("Race to build our own", "National pride is on the line.", { cost: 0.05, groups: { patriots: 0.1, progressives: 0.05 }, fx: { tech: 0.4 } }),
      ],
    },
  },
  {
    id: "housing", cat: "Society", kind: "crisis", title: "Housing Crisis", escalated: "Homelessness Epidemic",
    text: "Rents in {city} have doubled and tent camps are spreading.",
    prefer: ["capital", "slums", "migrant"], severity: 2, growth: 0.4, gdp: 0.02, metrics: { services: -4 },
    options: [
      o("Build public housing", "Expensive but lasting.", { cost: 1.8, groups: { poor: 0.25, unions: 0.1, wealthy: -0.1 }, fx: { stock: { infrastructure: 0.05 } } }),
      o("Deregulate construction", "Let builders build.", { cost: 0.4, groups: { capitalists: 0.2, greens: -0.15, middle: 0.05 } }),
      o("Clear the camps", "Out of sight, out of mind.", { cost: 0.5, speed: 1.6, groups: { wealthy: 0.15, patriots: 0.05, poor: -0.3, progressives: -0.25 }, fx: { unrest: 6 } }),
    ],
  },
  {
    id: "smuggling", cat: "Crime", kind: "crisis", title: "Smuggling Ring", escalated: "Black Market Empire",
    text: "Smugglers are moving untaxed goods through {city}.",
    prefer: ["port", "frontier", "migrant"], severity: 1, growth: 0.4, gdp: 0.02, metrics: { integrity: -3 },
    options: [
      o("Crack down on the border", "Guards, checkpoints, seizures.", { cost: 1, groups: { patriots: 0.15, merchants: -0.1 } }),
      o("Cut tariffs to kill the black market", "Make smuggling pointless.", { cost: 0.3, groups: { merchants: 0.2, workers: -0.1 }, fx: { tariff: -10 } }),
      o("Take a quiet cut", "Everyone's happy. Until they're not.", { cost: 0, speed: 1.2, groups: { libertarians: -0.05 }, fx: { treasury: 0.03, metrics: { integrity: -12 } } }),
    ],
  },
  {
    id: "investment", cat: "Economy", kind: "opportunity", title: "Foreign Buyout", needs: "other",
    text: "Investors from {other}'s {othercity} want to buy the great factories of {city}.",
    prefer: ["mining", "port", "market"], severity: 1,
    options: [
      o("Welcome the money", "Cash now, foreign owners later.", { cost: 0.2, speed: 1.3, groups: { capitalists: 0.2, patriots: -0.15 }, fx: { treasury: 0.1, relation: 1 } }),
      o("Insist on a joint venture", "Keep a stake for the nation.", { cost: 0.5, speed: 0.8, groups: { unions: 0.1 }, fx: { treasury: 0.05, gdp: 0.02 } }),
      o("Block the sale", "Our factories stay ours.", { cost: 0.1, groups: { patriots: 0.2, workers: 0.1, capitalists: -0.15 }, fx: { relation: -1 } }),
    ],
  },
  {
    id: "railway", cat: "Economy", kind: "opportunity", title: "Grand Railway",
    text: "Engineers propose a grand railway linking {city} to the rest of {country}.",
    prefer: ["frontier", "farmland", "mining"], severity: 2,
    options: [
      o("Build it with public funds", "Jobs now, growth later.", { cost: 2, groups: { workers: 0.2, unions: 0.1 }, fx: { stock: { infrastructure: 0.1 }, gdp: 0.03 } }),
      o("Public-private partnership", "Share the cost with investors.", { cost: 1, groups: { capitalists: 0.15 }, fx: { gdp: 0.02 } }),
      o("A cheaper road instead", "Something is better than nothing.", { cost: 0.5, speed: 1.3, groups: { middle: 0.05 }, fx: { stock: { infrastructure: 0.03 } } }),
    ],
  },
  {
    id: "festival", cat: "Society", kind: "opportunity", title: "National Festival",
    text: "{city} wants to host a grand national festival.",
    prefer: ["capital", "temple", "retirement"], severity: 1,
    options: [
      o("Spare no expense", "Fireworks, parades, free food.", { cost: 1.2, groups: { middle: 0.1, youth: 0.1, retirees: 0.05, poor: 0.05 } }),
      o("A modest celebration", "Tasteful and cheap.", { cost: 0.4, groups: { middle: 0.05 } }),
      o("Make it a religious feast", "Faith at the center.", { cost: 0.6, groups: { religious: 0.2, progressives: -0.1 } }),
    ],
  },
  {
    id: "ruins", cat: "Culture", kind: "opportunity", title: "Ancient Ruins",
    text: "Ancient ruins have been discovered beneath {city}.",
    prefer: ["temple", "forest", "capital"], severity: 1,
    options: [
      o("Fund a grand excavation", "History and prestige.", { cost: 1, groups: { progressives: 0.1, religious: 0.05 }, fx: { gdp: 0.01 } }),
      o("Turn it into a tourist attraction", "Ticket sales!", { cost: 0.5, groups: { capitalists: 0.1, merchants: 0.1 }, fx: { treasury: 0.04 } }),
      o("Build over it", "We need the land.", { cost: 0.1, speed: 1.5, groups: { workers: 0.05, religious: -0.1, progressives: -0.15 }, fx: { gdp: 0.01 } }),
    ],
    counter: {
      who: "neighbours", title: "Contested Heritage",
      text: "{origin} found ancient ruins under {city} - some in {country} say they belong to our ancestors.",
      options: [
        o("Demand the artifacts", "They're ours by right.", { cost: 0, groups: { patriots: 0.15 }, fx: { relation: -1 } }),
        o("Offer a joint excavation", "Shared history, shared glory.", { cost: 0.01, groups: { progressives: 0.1 }, fx: { relation: 1 }, origin: { progress: 20 } }),
        o("Claim the land itself", "The ruins prove {city} was ours. Opens a dispute.", { contest: "city", groups: { patriots: 0.25, progressives: -0.2 }, fx: { relation: -2 } }),
      ],
    },
  },

  // ---------------- disasters ----------------
  {
    id: "flood", cat: "Disaster", kind: "crisis", title: "Flood", escalated: "Catastrophic Flooding",
    text: "Floodwaters have swamped {city}.",
    prefer: ["port", "farmland", "slums"], cities: [1, 2], severity: 2, growth: 0.5, spread: 0.4, gdp: 0.06, metrics: { services: -4, food: -3 },
    options: [
      o("Full emergency response", "Everything we have.", { cost: 2, speed: 1.4, groups: { retirees: 0.1, poor: 0.1, middle: 0.05 } }),
      o("Evacuate and wait it out", "Save lives, let the water recede.", { cost: 0.6, speed: 0.8, groups: { farmers: -0.15 } }),
      o("Call in the army", "Soldiers with sandbags.", { cost: 1.2, speed: 1.2, groups: { military: 0.1, libertarians: -0.05 } }),
    ],
    counter: {
      who: "neighbours", title: "Flood Next Door",
      text: "{origin}'s {city} is underwater.",
      options: [
        o("Send relief supplies", "Food, blankets, clean water.", { cost: 0.02, groups: { progressives: 0.05 }, fx: { relation: 1 }, origin: { progress: 30 } }),
        o("Send engineers and troops", "Help them hold the levees.", { cost: 0.04, groups: { patriots: -0.05 }, fx: { relation: 1 }, origin: { severity: -1, progress: 20 } }),
        o("Snap up their trade routes", "Their ports are closed - ours aren't.", { cost: 0.01, groups: { merchants: 0.15 }, fx: { gdp: 0.01, relation: -1 }, origin: { gdp: -0.01 } }),
      ],
    },
  },
  {
    id: "wildfire", cat: "Disaster", kind: "crisis", title: "Wildfire", escalated: "Firestorm",
    text: "Wildfires are tearing through the land around {city}.",
    prefer: ["forest", "frontier", "farmland"], cities: [1, 2], severity: 2, growth: 0.6, spread: 0.5, gdp: 0.05, metrics: { food: -4 },
    options: [
      o("Mobilize every firefighter", "All hands on deck.", { cost: 1.6, speed: 1.3, groups: { retirees: 0.05 } }),
      o("Controlled burns and firebreaks", "Slow, but smart.", { cost: 0.8, speed: 0.9, groups: { greens: 0.15 } }),
      o("Protect the wealthy districts first", "Save the tax base.", { cost: 0.9, speed: 1.2, groups: { wealthy: 0.2, poor: -0.25, progressives: -0.15 } }),
    ],
    counter: {
      who: "neighbours", title: "Fire on the Border",
      text: "Wildfires rage in {origin}'s {city}, and smoke is drifting into {country}.",
      options: [
        o("Send water bombers", "Help put it out.", { cost: 0.03, fx: { relation: 1 }, origin: { progress: 30 } }),
        o("Shelter their refugees", "Open our towns to the displaced.", { cost: 0.02, groups: { progressives: 0.1, patriots: -0.1 }, fx: { relation: 1 } }),
        o("Close the border", "Not our fire, not our problem.", { cost: 0, groups: { patriots: 0.1, progressives: -0.1 }, fx: { relation: -1 } }),
      ],
    },
  },
  {
    id: "earthquake", cat: "Disaster", kind: "crisis", title: "Earthquake", escalated: "Devastation",
    text: "A powerful earthquake has struck {city}.",
    prefer: [], severity: 3, growth: 0.3, gdp: 0.08, metrics: { services: -6 },
    options: [
      o("Rebuild stronger", "Costly, but built to last.", { cost: 2.4, groups: { workers: 0.15 }, fx: { stock: { infrastructure: 0.08 } } }),
      o("Patch it up cheaply", "Get people back home fast.", { cost: 0.7, speed: 1.2, groups: { middle: 0.05 } }),
      o("Appeal for foreign aid", "Let the world help.", { cost: 0.3, speed: 0.8, groups: { patriots: -0.1 } }),
    ],
    counter: {
      who: "all", title: "Earthquake Abroad",
      text: "An earthquake has devastated {origin}'s {city}.",
      options: [
        o("Send rescue teams", "Dig out the survivors.", { cost: 0.02, groups: { progressives: 0.05 }, fx: { relation: 1 }, origin: { progress: 30 } }),
        o("Offer reconstruction loans", "Help them rebuild - at interest.", { cost: 0.04, groups: { capitalists: 0.1 }, fx: { relation: 1, treasury: 0.05 }, origin: { progress: 20 } }),
        o("Press our border claims while they're weak", "Opens a dispute over {city}.", { contest: "city", groups: { patriots: 0.15, progressives: -0.25 }, fx: { relation: -2 } }),
      ],
    },
  },
  {
    id: "famine", cat: "Disaster", kind: "crisis", title: "Crop Failure", escalated: "Famine",
    text: "Crops are failing around {city} and granaries are running low.",
    prefer: ["farmland", "frontier"], cities: [1, 2], severity: 2, growth: 0.5, spread: 0.5, gdp: 0.03, metrics: { food: -10 },
    options: [
      o("Import grain", "Expensive, but nobody starves.", { cost: 1.5, groups: { merchants: 0.15, farmers: -0.2 } }),
      o("Ration and requisition", "Take from those who have.", { cost: 0.4, groups: { poor: 0.1, farmers: -0.3, libertarians: -0.15 } }),
      o("Subsidize the farmers", "Save next year's harvest.", { cost: 1.2, speed: 0.9, groups: { farmers: 0.3 } }),
    ],
    counter: {
      who: "neighbours", title: "Hunger Next Door",
      text: "{origin} is running out of food in {city}.",
      options: [
        o("Sell them grain at a fair price", "Good business, good neighbours.", { cost: 0, groups: { farmers: 0.1 }, fx: { treasury: 0.02, relation: 1 }, origin: { progress: 25 } }),
        o("Gouge them on grain prices", "They'll pay anything.", { cost: 0, groups: { farmers: 0.15, progressives: -0.1 }, fx: { treasury: 0.05, relation: -1 }, origin: { treasury: -0.03 } }),
        o("Ban grain exports", "Feed our own first.", { cost: 0, groups: { patriots: 0.1 }, fx: { relation: -1 }, origin: { severity: 1 } }),
      ],
    },
  },
  {
    id: "mine_collapse", cat: "Disaster", kind: "crisis", title: "Mine Collapse", escalated: "Mining Disaster",
    text: "A mine has collapsed in {city}, trapping dozens of workers.",
    prefer: ["mining"], severity: 3, growth: 0.5, gdp: 0.03, metrics: { jobs: -4 },
    options: [
      o("All-out rescue", "Every drill, every volunteer.", { cost: 1.4, speed: 1.2, groups: { workers: 0.3, unions: 0.15 } }),
      o("Blame the mining company", "Make them pay for it.", { cost: 0.5, speed: 0.9, groups: { unions: 0.2, capitalists: -0.25 } }),
      o("Seal the mine and move on", "Cold, but cheap.", { cost: 0.1, speed: 2, groups: { capitalists: 0.1, workers: -0.4, unions: -0.3 } }),
    ],
  },
  {
    id: "plague", cat: "Health", kind: "crisis", title: "Outbreak", escalated: "Plague",
    text: "A mysterious sickness is spreading in {city}.",
    prefer: ["slums", "port", "capital", "migrant"], severity: 2, growth: 0.7, spread: 0.6, gdp: 0.04, metrics: { services: -8, jobs: -2 },
    options: [
      o("Quarantine the city", "Lock it down.", { cost: 1, speed: 1.2, groups: { retirees: 0.15, merchants: -0.2, libertarians: -0.2 } }),
      o("Free treatment for everyone", "Doctors and medicine for all.", { cost: 2, groups: { poor: 0.25, progressives: 0.1, wealthy: -0.1 } }),
      o("Keep it quiet", "Avoid a panic. Hope it passes.", { cost: 0.1, speed: 0.5, groups: { capitalists: 0.05 }, fx: { metrics: { integrity: -15 } } }),
    ],
    counter: {
      who: "neighbours", title: "Outbreak Next Door",
      text: "A sickness is spreading in {origin}'s {city}.",
      options: [
        o("Send doctors", "Stop it at the source.", { cost: 0.03, groups: { progressives: 0.1 }, fx: { relation: 1 }, origin: { progress: 30 } }),
        o("Close the border to {origin}", "Keep it out at all costs.", { cost: 0.01, groups: { patriots: 0.1, merchants: -0.1 }, fx: { relation: -1 } }),
        o("Hoard medicine", "Buy up every dose on the market.", { cost: 0.03, groups: { retirees: 0.1 }, fx: { relation: -1 }, origin: { severity: 1 } }),
      ],
    },
  },
  {
    id: "spill", cat: "Environment", kind: "crisis", title: "Toxic Spill", escalated: "Ecological Disaster",
    text: "A chemical spill has poisoned the river at {city}.",
    prefer: ["mining", "port", "forest"], severity: 2, growth: 0.4, spread: 0.3, gdp: 0.02, metrics: { food: -4, services: -3 },
    options: [
      o("Make the polluter pay", "Fines and lawsuits.", { cost: 0.5, speed: 0.9, groups: { greens: 0.25, capitalists: -0.2 } }),
      o("Government-funded cleanup", "Fix it now, argue later.", { cost: 1.5, groups: { greens: 0.15, farmers: 0.05 } }),
      o("Downplay the danger", "It's probably fine.", { cost: 0.1, speed: 1.3, groups: { capitalists: 0.15, greens: -0.35 }, fx: { metrics: { integrity: -10 } } }),
    ],
    counter: {
      who: "neighbours", title: "Poison Downstream",
      text: "Poison from {origin}'s spill at {city} is drifting downriver into {country}.",
      options: [
        o("Demand compensation", "They pay for what they ruined.", { cost: 0, groups: { greens: 0.1 }, fx: { treasury: 0.02, relation: -1 }, origin: { treasury: -0.02 } }),
        o("Help clean it up", "Fix it together.", { cost: 0.02, groups: { greens: 0.15 }, fx: { relation: 1 }, origin: { progress: 25 } }),
        o("Take them to court", "Slow, public, humiliating.", { cost: 0.01, groups: { greens: 0.05, patriots: 0.05 }, fx: { treasury: 0.03, relation: -1 } }),
      ],
    },
  },

  // ---------------- society & politics ----------------
  {
    id: "riots", cat: "Unrest", kind: "crisis", title: "Riots", escalated: "Insurrection",
    text: "Riots have erupted in {city} after a controversial arrest.",
    prefer: ["slums", "capital", "migrant"], severity: 2, growth: 0.6, spread: 0.5, gdp: 0.03, metrics: { security: -6 },
    options: [
      o("Police crackdown", "Restore order by force.", { cost: 0.8, speed: 1.4, groups: { patriots: 0.15, religious: 0.05, progressives: -0.3, youth: -0.2 }, fx: { unrest: 5 } }),
      o("Listen and reform the police", "Address the anger.", { cost: 1, groups: { progressives: 0.25, youth: 0.15, patriots: -0.2 }, fx: { unrest: -10 } }),
      o("Impose a curfew", "Everyone stays home.", { cost: 0.5, groups: { retirees: 0.1, youth: -0.15 } }),
    ],
    counter: {
      who: "rivals", title: "Unrest Abroad",
      text: "Riots are shaking {origin}'s {city}.",
      options: [
        o("Fund the rioters", "Keep them busy at home.", { cost: 0.02, fx: { relation: -2 }, origin: { severity: 1 } }),
        o("Offer to help restore order", "A friend in need.", { cost: 0.01, groups: { patriots: 0.05 }, fx: { relation: 1 }, origin: { progress: 20 } }),
        o("Broadcast propaganda", "Show the world their weakness.", { cost: 0.01, groups: { patriots: 0.1 }, fx: { relation: -1 } }),
      ],
    },
  },
  {
    id: "tax_revolt", cat: "Unrest", kind: "crisis", title: "Tax Revolt", escalated: "Taxpayers' Uprising",
    text: "Tens of thousands march in {city} against crushing taxes.",
    prefer: ["estates", "market", "farmland"], severity: 2, growth: 0.5, gdp: 0.02, metrics: { economy: -3 },
    options: [
      o("Cut income taxes", "Give them what they want.", { cost: 0.2, speed: 1.3, groups: { middle: 0.25, wealthy: 0.15, poor: -0.1 }, fx: { incomeTax: -5 } }),
      o("Explain the budget", "Patience and pamphlets.", { cost: 0.3, speed: 0.6, groups: { progressives: 0.05 } }),
      o("Ban the marches", "Enough is enough.", { cost: 0.4, speed: 1.5, groups: { patriots: 0.05, libertarians: -0.35, progressives: -0.2 }, fx: { metrics: { integrity: -6 } } }),
    ],
  },
  {
    id: "separatists", cat: "Unrest", kind: "crisis", title: "Separatist Movement", escalated: "Secession Crisis",
    text: "Separatists in {city} demand independence from {country}.",
    prefer: ["frontier", "forest", "migrant"], severity: 2, growth: 0.5, gdp: 0.03, metrics: { security: -4 },
    options: [
      o("Grant more autonomy", "Let them run their own affairs.", { cost: 0.5, groups: { libertarians: 0.2, patriots: -0.25 } }),
      o("Hold a referendum", "Let the people decide. An admin rules the result.", { cost: 0.6, manual: true, groups: { progressives: 0.15, patriots: -0.1 } }),
      o("Arrest the leaders", "No one breaks up {country}.", { cost: 0.7, speed: 1.4, groups: { patriots: 0.25, progressives: -0.2, libertarians: -0.2 }, fx: { unrest: 10 } }),
    ],
    counter: {
      who: "rivals", title: "Separatists Abroad",
      text: "Separatists in {origin}'s {city} are asking {country} for support.",
      options: [
        o("Back the separatists", "Arm them and recognise them. Opens a dispute over {city}.", { contest: "city", groups: { patriots: 0.1, progressives: -0.1 }, fx: { relation: -2 }, origin: { severity: 1 } }),
        o("Recognise {origin}'s unity", "Borders are borders.", { cost: 0, fx: { relation: 1 }, origin: { progress: 20 } }),
        o("Quietly send them money", "Deniable trouble-making.", { cost: 0.01, fx: { relation: -1 }, origin: { severity: 1 } }),
      ],
    },
  },
  {
    id: "corruption", cat: "Politics", kind: "crisis", title: "Bribery Scandal", escalated: "Corruption Crisis",
    text: "Officials in {city} were caught taking bribes from the {lobby}.",
    prefer: ["capital", "market"], severity: 2, growth: 0.4, gdp: 0.01, metrics: { integrity: -8 },
    options: [
      o("Independent investigation", "Let the chips fall where they may.", { cost: 0.8, groups: { religious: 0.15, retirees: 0.1 }, fx: { metrics: { integrity: 10 } } }),
      o("Quietly reassign them", "Make it go away.", { cost: 0.1, speed: 1.5, groups: { capitalists: 0.05 }, fx: { metrics: { integrity: -8 } } }),
      o("Purge the whole department", "Clean house. Loudly.", { cost: 0.5, speed: 1.2, groups: { patriots: 0.1, libertarians: -0.15 } }),
    ],
  },
  {
    id: "refugees", cat: "Society", kind: "crisis", title: "Refugee Wave", escalated: "Border Crisis", needs: "other",
    text: "Thousands of refugees fleeing {other}'s {othercity} are arriving in {city}.",
    prefer: ["migrant", "port", "frontier"], severity: 2, growth: 0.4, gdp: 0.01, metrics: { services: -4 },
    options: [
      o("Welcome them", "Homes, jobs, a future.", { cost: 1, groups: { immigrants: 0.3, progressives: 0.2, patriots: -0.3 } }),
      o("Build temporary camps", "Safe, but separate.", { cost: 0.8, groups: { immigrants: 0.05 } }),
      o("Close the border", "Turn them back.", { cost: 0.3, speed: 1.4, groups: { patriots: 0.3, gunowners: 0.1, immigrants: -0.3, progressives: -0.2 }, fx: { relation: -1 } }),
    ],
  },
  {
    id: "preacher", cat: "Religion", kind: "crisis", title: "Firebrand Preacher", escalated: "Holy Uprising",
    text: "A fiery preacher in {city} is drawing huge crowds - and denouncing the government.",
    prefer: ["temple", "farmland"], severity: 1, growth: 0.5, gdp: 0.01, metrics: { security: -2 },
    options: [
      o("Embrace the movement", "Bring the faithful onside.", { cost: 0.3, groups: { religious: 0.3, progressives: -0.2, libertarians: -0.05 } }),
      o("Debate them publicly", "Win the argument.", { cost: 0.3, speed: 0.8, groups: { middle: 0.05 } }),
      o("Ban the gatherings", "Shut it down.", { cost: 0.4, speed: 1.4, groups: { religious: -0.4, libertarians: -0.2, progressives: 0.05 } }),
    ],
  },
  {
    id: "gang", cat: "Crime", kind: "crisis", title: "Gang War", escalated: "Cartel Rule",
    text: "A powerful gang has taken over the streets of {city}.",
    prefer: ["slums", "port", "capital"], severity: 2, growth: 0.5, spread: 0.3, gdp: 0.03, metrics: { security: -7 },
    options: [
      o("Special police task force", "Hunt them down.", { cost: 1.4, groups: { patriots: 0.15, gunowners: 0.1, progressives: -0.1 } }),
      o("Jobs and youth programs", "Starve them of recruits.", { cost: 1.2, speed: 0.7, groups: { poor: 0.2, progressives: 0.15 } }),
      o("Arm the neighbourhood watch", "Let citizens defend themselves.", { cost: 0.4, speed: 1.1, groups: { gunowners: 0.3, progressives: -0.25, retirees: -0.05 } }),
    ],
  },
  {
    id: "drugs", cat: "Crime", kind: "crisis", title: "Drug Wave", escalated: "Overdose Epidemic",
    text: "A cheap new drug is flooding the streets of {city}.",
    prefer: ["slums", "academy", "port"], severity: 2, growth: 0.5, spread: 0.4, gdp: 0.02, metrics: { services: -4, security: -3 },
    options: [
      o("War on drugs", "Arrest the dealers and the users.", { cost: 1.2, groups: { religious: 0.2, retirees: 0.15, youth: -0.2, libertarians: -0.25 } }),
      o("Treatment clinics", "Treat it as a health problem.", { cost: 1.4, speed: 0.9, groups: { progressives: 0.2, poor: 0.1 } }),
      o("Legalize and tax it", "Take the market from the gangs.", { cost: 0.3, groups: { libertarians: 0.3, youth: 0.25, religious: -0.35, retirees: -0.15 }, fx: { treasury: 0.02 } }),
    ],
  },
  {
    id: "leak", cat: "Politics", kind: "crisis", title: "Government Leak", escalated: "Leak Scandal",
    text: "A newspaper in {city} has published secret government documents.",
    prefer: ["capital", "academy"], severity: 1, growth: 0.4, gdp: 0, metrics: { integrity: -6 },
    options: [
      o("Prosecute the journalists", "Leaks are treason.", { cost: 0.4, speed: 1.3, groups: { patriots: 0.15, libertarians: -0.3, progressives: -0.2 } }),
      o("Defend the free press", "Take the hit, keep your principles.", { cost: 0.2, groups: { libertarians: 0.2, progressives: 0.15, patriots: -0.15 } }),
      o("Discredit the paper", "Fake news.", { cost: 0.4, groups: { patriots: 0.05 }, fx: { metrics: { integrity: -10 } } }),
    ],
    counter: {
      who: "rivals", title: "Secrets Spilled",
      text: "Leaked documents have exposed {origin}'s secrets.",
      options: [
        o("Publish the juiciest parts", "Let the world laugh.", { cost: 0, groups: { patriots: 0.05 }, fx: { relation: -1 }, origin: { severity: 1 } }),
        o("Grant the leaker asylum", "A hero to us, a traitor to them.", { cost: 0.01, groups: { libertarians: 0.15 }, fx: { relation: -2 } }),
        o("Stay diplomatically silent", "Not our business.", { cost: 0, fx: { relation: 1 } }),
      ],
    },
  },
  {
    id: "assassination", cat: "Politics", kind: "crisis", title: "Assassination Attempt", escalated: "Conspiracy Crisis",
    text: "An assassin fired on the {leader} during a rally in {city}!",
    prefer: ["capital"], severity: 3, growth: 0.4, gdp: 0.01, metrics: { security: -6 },
    options: [
      o("Hunt down the conspirators", "No stone unturned.", { cost: 1, speed: 1.3, groups: { patriots: 0.2, libertarians: -0.15 } }),
      o("Call for national unity", "Rise above it.", { cost: 0.3, speed: 0.9, groups: { middle: 0.1, retirees: 0.05 } }),
      o("Blame foreign agents", "Point at the usual suspects.", { cost: 0.2, groups: { patriots: 0.25, progressives: -0.1 } }),
    ],
  },
  {
    id: "students", cat: "Unrest", kind: "crisis", title: "Campus Occupation", escalated: "Student Uprising",
    text: "Students have occupied the university in {city}.",
    prefer: ["academy"], severity: 1, growth: 0.5, gdp: 0.01, metrics: { security: -2 },
    options: [
      o("Negotiate with them", "Hear them out.", { cost: 0.3, speed: 0.8, groups: { youth: 0.2, progressives: 0.1 } }),
      o("Clear the campus", "Send in the riot police.", { cost: 0.4, speed: 1.5, groups: { patriots: 0.1, youth: -0.3 }, fx: { unrest: 5 } }),
      o("Close the university for the term", "Wait them out.", { cost: 0.3, groups: { youth: -0.1, progressives: -0.1 } }),
    ],
  },
  {
    id: "veterans", cat: "Military", kind: "crisis", title: "Veterans' March", escalated: "Veterans' Revolt",
    text: "Veterans in {city} say the pensions they were promised never came.",
    prefer: ["garrison"], severity: 2, growth: 0.4, gdp: 0.01, metrics: { security: -4 },
    options: [
      o("Pay the pensions in full", "A debt of honour.", { cost: 1.5, groups: { military: 0.3, patriots: 0.1 } }),
      o("Offer land grants instead", "Farms for heroes.", { cost: 0.5, groups: { military: 0.15, farmers: -0.1 } }),
      o("Tell them to be patient", "There's no money.", { cost: 0.1, speed: 0.7, groups: { military: -0.35, patriots: -0.1 } }),
    ],
  },

  // ---------------- military & war ----------------
  {
    id: "border_raid", cat: "Military", kind: "crisis", title: "Border Raid", escalated: "Border War", needs: "enemy",
    text: "Raiders from {other}'s {othercity} struck villages outside {city}.",
    prefer: ["frontier", "garrison", "farmland"], severity: 2, growth: 0.5, spread: 0.3, gdp: 0.03, metrics: { security: -6 },
    options: [
      o("Retaliate in force", "Hit them back harder.", { cost: 1.5, groups: { military: 0.2, patriots: 0.2, progressives: -0.15 }, fx: { relation: -1 } }),
      o("Fortify the border", "Walls and watchtowers.", { cost: 1.2, groups: { gunowners: 0.1 }, fx: { stock: { military: 0.05 } } }),
      o("Lodge a diplomatic protest", "Words, not war.", { cost: 0.2, speed: 0.6, groups: { progressives: 0.1, patriots: -0.2 } }),
    ],
    counter: {
      who: "other", title: "Accused of Raiding",
      text: "{origin} accuses raiders from our {othercity} of attacking villages near {city}.",
      options: [
        o("Deny it and apologise", "Smooth it over.", { cost: 0, groups: { patriots: -0.1 }, fx: { relation: 1 }, origin: { progress: 30 } }),
        o("Claim the raids were justified", "They had it coming.", { cost: 0, groups: { patriots: 0.1 }, fx: { relation: -1 } }),
        o("Send more raiders", "Escalate. Opens a dispute over {city}.", { contest: "city", groups: { patriots: 0.15, progressives: -0.15 }, fx: { relation: -2 }, origin: { severity: 1 } }),
      ],
    },
  },
  {
    id: "invasion", cat: "War", kind: "crisis", title: "Invasion", escalated: "Siege", needs: "war", manual: true,
    text: "{other}'s forces are marching out of {othercity} toward {city}!",
    prefer: ["frontier", "garrison"], severity: 3, growth: 0.5, gdp: 0.08, metrics: { security: -10, economy: -3 },
    options: [
      o("Throw everything into the defense", "Every soldier, every rifle.", { cost: 3, groups: { military: 0.2, patriots: 0.2 }, fx: { stock: { military: 0.05 } } }),
      o("Fall back and regroup", "Trade land for time.", { cost: 0.5, speed: 1.5, groups: { patriots: -0.3 } }),
      o("Sue for peace", "End the bloodshed.", { cost: 0.3, groups: { progressives: 0.2, patriots: -0.3 }, fx: { relation: 1 } }),
    ],
    counter: {
      who: "other", title: "Offensive",
      text: "Our forces from {othercity} are closing in on {origin}'s {city}.",
      options: [
        o("Press the attack", "Take the city. The admin rules on the battle.", { contest: "city", groups: { patriots: 0.2, progressives: -0.2 } }),
        o("Demand {city} in exchange for peace", "Take it at the negotiating table.", { contest: "city", groups: { patriots: 0.1 } }),
        o("Pull back", "We've made our point.", { cost: 0, groups: { progressives: 0.15, patriots: -0.15 }, fx: { relation: 1 }, origin: { progress: 60 } }),
      ],
    },
  },
  {
    id: "spies", cat: "Military", kind: "crisis", title: "Spy Ring", escalated: "Espionage Scandal", needs: "other",
    text: "A spy ring run from {other}'s {othercity} was uncovered in {city}.",
    prefer: ["capital", "garrison", "academy"], severity: 1, growth: 0.4, gdp: 0.01, metrics: { security: -4 },
    options: [
      o("Public show trial", "Make an example of them.", { cost: 0.4, groups: { patriots: 0.2, libertarians: -0.1 }, fx: { relation: -1 } }),
      o("Turn them into double agents", "Feed lies back home.", { cost: 1, groups: { military: 0.05 }, fx: { stock: { military: 0.05 } } }),
      o("Quietly expel them", "No fuss.", { cost: 0.2, speed: 1.3, groups: { progressives: 0.05 } }),
    ],
    counter: {
      who: "other", title: "Spies Exposed",
      text: "Our spies in {origin} were exposed in {city}.",
      options: [
        o("Deny everything", "They're tourists.", { cost: 0, fx: { relation: -1 } }),
        o("Offer a prisoner swap", "Get our people home.", { cost: 0, fx: { relation: 1 }, origin: { progress: 40 } }),
        o("Expel their diplomats too", "Tit for tat.", { cost: 0, groups: { patriots: 0.1 }, fx: { relation: -2 } }),
      ],
    },
  },
  {
    id: "buildup", cat: "Military", kind: "crisis", title: "Troops on the Border", escalated: "War Scare", needs: "enemy",
    text: "{other} is massing troops in {othercity}, just across from {city}.",
    prefer: ["frontier", "garrison"], severity: 2, growth: 0.5, gdp: 0.02, metrics: { security: -5 },
    options: [
      o("Match their buildup", "Show strength.", { cost: 2, groups: { military: 0.2, patriots: 0.15, progressives: -0.15 }, fx: { stock: { military: 0.1 } } }),
      o("Seek a defensive alliance", "Find friends fast.", { cost: 0.5, speed: 0.8, groups: { progressives: 0.05 }, fx: { allyBoost: 1 } }),
      o("Propose a demilitarised zone", "Talk them down.", { cost: 0.3, speed: 0.7, groups: { progressives: 0.15, patriots: -0.15 }, fx: { relation: 1 } }),
    ],
    counter: {
      who: "other", title: "Accused of Aggression",
      text: "{origin} says our troops in {othercity} are massing near {city}.",
      options: [
        o("Pull the troops back", "De-escalate.", { cost: 0, groups: { patriots: -0.1, progressives: 0.1 }, fx: { relation: 1 }, origin: { progress: 40 } }),
        o("Hold the line", "Our soldiers stay where they are.", { cost: 0.01, groups: { patriots: 0.1 } }),
        o("Cross the border", "Go to war over {city}. Opens a dispute.", { contest: "city", war: true, groups: { patriots: 0.2, progressives: -0.3 }, fx: { relation: -3 } }),
      ],
    },
  },
  {
    id: "war_chest", cat: "War", kind: "crisis", title: "Empty War Chest", escalated: "War Bankruptcy", needs: "war",
    text: "The war against {other} is draining {country}'s treasury, and {city} is feeling it most.",
    prefer: ["capital"], severity: 2, growth: 0.4, gdp: 0.02, metrics: { economy: -4 },
    options: [
      o("Sell war bonds", "Borrow from patriots.", { cost: 0.2, groups: { wealthy: 0.1, patriots: 0.1 }, fx: { treasury: 0.08 } }),
      o("Raise war taxes", "Everyone pays their share.", { cost: 0.1, groups: { middle: -0.15, wealthy: -0.1 }, fx: { treasury: 0.12, incomeTax: 3 } }),
      o("Cut the army budget", "We can't afford this war.", { cost: 0, groups: { military: -0.3, progressives: 0.15 }, fx: { treasury: 0.05, stock: { military: -0.1 } } }),
    ],
  },
  {
    id: "draft_riots", cat: "War", kind: "crisis", title: "Draft Riots", escalated: "Mutiny", needs: "war",
    text: "Young people in {city} are rioting against the draft.",
    prefer: ["academy", "slums", "capital"], severity: 2, growth: 0.5, spread: 0.3, gdp: 0.02, metrics: { security: -5 },
    options: [
      o("Enforce the draft", "Duty is not optional.", { cost: 0.5, speed: 1.3, groups: { patriots: 0.15, youth: -0.35 } }),
      o("Exempt students", "Spare the scholars.", { cost: 0.3, groups: { youth: 0.2, patriots: -0.15, military: -0.1 } }),
      o("Pay volunteer bonuses", "Make soldiering pay.", { cost: 1.5, groups: { military: 0.1, poor: 0.05 } }),
    ],
  },

  // ---------------- diplomacy ----------------
  {
    id: "insult", cat: "Diplomacy", kind: "crisis", title: "Diplomatic Insult", escalated: "Diplomatic Rupture", needs: "other",
    text: "The ambassador from {other}'s {othercity} insulted {country} at a banquet in {city}.",
    prefer: ["capital"], severity: 1, growth: 0.3, gdp: 0, metrics: {},
    options: [
      o("Demand an apology", "Firm but fair.", { cost: 0.1, groups: { patriots: 0.15 } }),
      o("Laugh it off", "Rise above it.", { cost: 0, speed: 1.3, groups: { progressives: 0.05, patriots: -0.05 } }),
      o("Expel the ambassador", "Out. Today.", { cost: 0, speed: 1.5, groups: { patriots: 0.25 }, fx: { relation: -2 } }),
    ],
    counter: {
      who: "other", title: "Embarrassing Ambassador",
      text: "Our ambassador caused a scandal at a banquet in {origin}'s {city}.",
      options: [
        o("Apologise", "Smooth things over.", { cost: 0, groups: { patriots: -0.1 }, fx: { relation: 1 }, origin: { progress: 50 } }),
        o("Stand by the ambassador", "They said nothing wrong.", { cost: 0, groups: { patriots: 0.1 }, fx: { relation: -1 } }),
        o("Recall the ambassador", "Quietly bring them home.", { cost: 0, fx: {}, origin: { progress: 25 } }),
      ],
    },
  },
  {
    id: "pact", cat: "Diplomacy", kind: "opportunity", title: "Alliance Offer", needs: "other",
    text: "{other} proposes a defensive alliance with {country}. Envoys from {othercity} wait in {city} for an answer.",
    prefer: ["capital"], severity: 1,
    options: [
      o("Sign the alliance", "Stand together.", { cost: 0.2, groups: { military: 0.1, progressives: 0.05 }, fx: { relation: 2 } }),
      o("Offer a trade pact instead", "Friends, not allies.", { cost: 0.1, groups: { merchants: 0.1 }, fx: { relation: 1 } }),
      o("Decline politely", "We go our own way.", { cost: 0, groups: { patriots: 0.05 } }),
    ],
  },
  {
    id: "hostages", cat: "Diplomacy", kind: "crisis", title: "Citizens Detained", escalated: "Hostage Crisis", needs: "other",
    text: "Citizens of {country} from {city} have been detained in {other}'s {othercity}.",
    prefer: [], severity: 2, growth: 0.4, gdp: 0, metrics: { security: -3 },
    options: [
      o("Pay the ransom", "Bring them home, whatever it costs.", { cost: 1, speed: 1.3, groups: { patriots: -0.15, retirees: 0.05 } }),
      o("Launch a rescue mission", "Special forces, tonight.", { cost: 1.2, speed: 1.2, groups: { military: 0.2, patriots: 0.2 }, fx: { relation: -2 } }),
      o("Negotiate quietly", "Patience pays.", { cost: 0.3, speed: 0.6, groups: { progressives: 0.05 } }),
    ],
    counter: {
      who: "other", title: "Foreign Detainees",
      text: "{origin} demands we release citizens detained here.",
      options: [
        o("Release them", "A gesture of goodwill.", { cost: 0, fx: { relation: 1 }, origin: { progress: 60 } }),
        o("Demand a ransom", "Nothing is free.", { cost: 0, groups: { patriots: 0.05 }, fx: { treasury: 0.03, relation: -1 } }),
        o("Put them on trial", "They broke our laws.", { cost: 0, groups: { patriots: 0.15 }, fx: { relation: -2 }, origin: { severity: 1 } }),
      ],
    },
  },
  {
    id: "aid_request", cat: "Diplomacy", kind: "opportunity", title: "Plea for Aid", needs: "other",
    text: "Disaster has struck {other}'s {othercity}. Their envoys arrive in {city} begging {country} for emergency aid.",
    prefer: ["capital", "port"], severity: 1,
    options: [
      o("Send generous aid", "Be the friend they need.", { cost: 0.5, groups: { progressives: 0.15, patriots: -0.1 }, fx: { treasury: -0.04, relation: 1 } }),
      o("Send token aid", "A gesture.", { cost: 0.2, fx: { treasury: -0.01 } }),
      o("Refuse", "Charity begins at home.", { cost: 0, speed: 1.5, groups: { patriots: 0.1, progressives: -0.1 }, fx: { relation: -1 } }),
    ],
  },
  {
    id: "border_claim", cat: "Diplomacy", kind: "crisis", title: "Border Claim", escalated: "Territorial Standoff", needs: "other",
    text: "{other} claims that {city} rightfully belongs to them, and has stationed officials in nearby {othercity}.",
    prefer: ["frontier", "forest", "farmland"], severity: 2, growth: 0.4, gdp: 0.01, metrics: { security: -3 },
    options: [
      o("Reject the claim", "Not one inch.", { cost: 0.3, groups: { patriots: 0.2 }, fx: { relation: -1 } }),
      o("International arbitration", "Let a neutral court decide. An admin rules the result.", { cost: 0.5, speed: 0.7, manual: true, groups: { progressives: 0.1 } }),
      o("Cede {city} for lasting peace", "Give it up.", { cost: 0, speed: 1.5, groups: { patriots: -0.4, progressives: 0.1 }, fx: { relation: 2, special: "cede" } }),
    ],
    counter: {
      who: "other", title: "Our Claim",
      text: "Our claim on {origin}'s {city} is being debated.",
      options: [
        o("Press the claim by force", "Opens a dispute over {city}.", { contest: "city", groups: { patriots: 0.2, progressives: -0.2 }, fx: { relation: -2 } }),
        o("Accept arbitration", "Let the court decide.", { cost: 0, groups: { progressives: 0.05 } }),
        o("Drop the claim", "It's not worth it.", { cost: 0, groups: { patriots: -0.15 }, fx: { relation: 1 }, origin: { progress: 100 } }),
      ],
    },
  },
  {
    id: "championship", cat: "Society", kind: "opportunity", title: "Championship Win",
    text: "{city}'s team won the continental championship!",
    prefer: [], severity: 1,
    options: [
      o("Throw a victory parade", "The whole nation celebrates.", { cost: 0.4, groups: { middle: 0.1, youth: 0.1 } }),
      o("Declare a national holiday", "A day off for everyone.", { cost: 0.2, groups: { unions: 0.1, capitalists: -0.05 } }),
      o("Take a photo with the team", "Cheap and cheerful.", { cost: 0, speed: 1.5, groups: { middle: 0.03 } }),
    ],
  },
];

SCENARIOS.push(...MORE_SCENARIOS, ...FOLLOW_UPS);
applyChains(SCENARIOS);

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
export const DO_NOTHING = { label: "Do nothing", desc: "Let it play out." };

export function fill(text, f) {
  return String(text || "").replace(/\{(\w+)\}/g, (m, k) => (f[k] !== undefined ? f[k] : m));
}
