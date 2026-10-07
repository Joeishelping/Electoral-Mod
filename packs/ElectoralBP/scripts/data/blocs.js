// Voter groups ("blocs"). Each region is a mix of these groups. A bloc has:
//  ideal       - where the group sits on each issue (-100..100)
//  salience    - how much the group cares about each issue (0..1, default 0.2)
//  turnout     - base share of eligible members who vote
//  loyalty     - how strongly habit/party memory pulls the group (0..1)
//  volatility  - how much the group swings election to election
//  traits      - what the group values in a person: charisma, competence, integrity, wealth
//  metrics     - extra weight on particular performance sliders
//  rivals      - groups this one resents; courting a rival costs a little support

export const BLOCS = [
  {
    id: "farmers",
    name: "Farmers",
    ideal: { economy: 10, welfare: 10, order: 30, tradition: 50, environment: 40, trade: -40, infrastructure: 30, authority: -40, settlers: -30 },
    salience: { environment: 0.8, trade: 0.9, tradition: 0.6, infrastructure: 0.6, authority: 0.5 },
    turnout: 0.68, loyalty: 0.6, volatility: 0.8,
    traits: { charisma: 0.8, competence: 0.8, integrity: 1.2, wealth: 0.6 },
    metrics: { food: 1.2 },
    rivals: ["merchants"],
  },
  {
    id: "miners",
    name: "Miners",
    ideal: { welfare: 30, labor: 60, environment: -60, infrastructure: 50, trade: -10, military: 10 },
    salience: { labor: 0.9, environment: 0.7, welfare: 0.5, infrastructure: 0.6 },
    turnout: 0.6, loyalty: 0.7, volatility: 0.7,
    traits: { charisma: 1.0, competence: 0.8, integrity: 1.0, wealth: 0.5 },
    metrics: { jobs: 1.0 },
    rivals: ["nobility"],
  },
  {
    id: "merchants",
    name: "Merchants",
    ideal: { economy: 70, trade: 80, welfare: -30, labor: -50, order: 20, infrastructure: 40, settlers: 30, military: -10 },
    salience: { trade: 1.0, economy: 0.9, labor: 0.5, infrastructure: 0.4 },
    turnout: 0.74, loyalty: 0.4, volatility: 1.0,
    traits: { charisma: 0.8, competence: 1.2, integrity: 0.8, wealth: 1.4 },
    metrics: { economy: 1.2 },
    rivals: ["laborers", "farmers"],
  },
  {
    id: "laborers",
    name: "Laborers & Builders",
    ideal: { economy: -40, welfare: 70, labor: 80, infrastructure: 60, settlers: -10 },
    salience: { labor: 1.0, welfare: 0.8, economy: 0.6, infrastructure: 0.5 },
    turnout: 0.55, loyalty: 0.65, volatility: 0.8,
    traits: { charisma: 1.1, competence: 0.7, integrity: 1.0, wealth: 0.3 },
    metrics: { jobs: 1.2, services: 0.5 },
    rivals: ["nobility", "merchants"],
  },
  {
    id: "soldiers",
    name: "Soldiers & Guards",
    ideal: { military: 80, order: 70, expansion: 50, authority: 40, tradition: 30, welfare: 20 },
    salience: { military: 1.0, order: 0.7, expansion: 0.6, authority: 0.4 },
    turnout: 0.72, loyalty: 0.75, volatility: 0.6,
    traits: { charisma: 1.0, competence: 1.1, integrity: 1.0, wealth: 0.3 },
    metrics: { security: 1.2 },
    rivals: ["scholars"],
  },
  {
    id: "clergy",
    name: "Clergy & Faithful",
    ideal: { tradition: 85, order: 50, welfare: 40, settlers: -20, environment: 20 },
    salience: { tradition: 1.0, order: 0.5, welfare: 0.4 },
    turnout: 0.8, loyalty: 0.85, volatility: 0.4,
    traits: { charisma: 0.8, competence: 0.6, integrity: 1.6, wealth: 0.2 },
    metrics: { integrity: 1.0, security: 0.3 },
    rivals: ["scholars"],
  },
  {
    id: "scholars",
    name: "Scholars & Enchanters",
    ideal: { tradition: -60, order: -40, environment: 40, trade: 40, settlers: 40, infrastructure: 40, military: -30 },
    salience: { tradition: 0.7, environment: 0.5, infrastructure: 0.5, order: 0.6 },
    turnout: 0.78, loyalty: 0.45, volatility: 0.7,
    traits: { charisma: 0.6, competence: 1.8, integrity: 1.1, wealth: 0.3 },
    metrics: { services: 0.6 },
    rivals: ["clergy", "soldiers"],
  },
  {
    id: "nobility",
    name: "Nobles & Landholders",
    ideal: { economy: 50, welfare: -50, labor: -70, tradition: 60, authority: 50, order: 50, settlers: -40 },
    salience: { labor: 0.6, tradition: 0.7, authority: 0.8, economy: 0.7 },
    turnout: 0.88, loyalty: 0.8, volatility: 0.4,
    traits: { charisma: 0.7, competence: 0.8, integrity: 0.6, wealth: 1.6 },
    metrics: { security: 0.5, economy: 0.8 },
    rivals: ["laborers", "miners"],
  },
  {
    id: "youth",
    name: "Youth",
    ideal: { tradition: -50, order: -50, settlers: 50, environment: 50, labor: 30, welfare: 30 },
    salience: { environment: 0.7, order: 0.6, tradition: 0.5, settlers: 0.5 },
    turnout: 0.42, loyalty: 0.2, volatility: 1.4,
    traits: { charisma: 1.7, competence: 0.6, integrity: 0.9, wealth: 0.3 },
    metrics: { jobs: 0.6 },
    rivals: ["elders"],
  },
  {
    id: "elders",
    name: "Elders",
    ideal: { tradition: 60, welfare: 50, order: 40, settlers: -30, expansion: -20 },
    salience: { welfare: 0.9, tradition: 0.6, order: 0.5 },
    turnout: 0.86, loyalty: 0.85, volatility: 0.4,
    traits: { charisma: 0.6, competence: 1.0, integrity: 1.3, wealth: 0.4 },
    metrics: { services: 1.0, security: 0.3 },
    rivals: ["youth"],
  },
  {
    id: "sailors",
    name: "Fishers & Sailors",
    ideal: { trade: 60, environment: 30, expansion: 30, settlers: 20, military: 20 },
    salience: { trade: 0.9, environment: 0.6, expansion: 0.4 },
    turnout: 0.6, loyalty: 0.5, volatility: 0.9,
    traits: { charisma: 1.1, competence: 0.8, integrity: 0.9, wealth: 0.5 },
    metrics: { food: 0.6, economy: 0.5 },
    rivals: [],
  },
  {
    id: "artisans",
    name: "Artisans & Smiths",
    ideal: { economy: 30, trade: -20, labor: 20, infrastructure: 30, tradition: 20 },
    salience: { trade: 0.7, economy: 0.7, infrastructure: 0.4 },
    turnout: 0.66, loyalty: 0.55, volatility: 0.8,
    traits: { charisma: 0.8, competence: 1.3, integrity: 1.0, wealth: 0.8 },
    metrics: { economy: 0.6 },
    rivals: [],
  },
  {
    id: "frontier",
    name: "Settlers & Frontierfolk",
    ideal: { settlers: 90, expansion: 60, authority: -50, infrastructure: 60, welfare: 30, order: -10 },
    salience: { settlers: 1.0, expansion: 0.8, infrastructure: 0.6, authority: 0.5 },
    turnout: 0.5, loyalty: 0.3, volatility: 1.2,
    traits: { charisma: 1.2, competence: 0.8, integrity: 0.9, wealth: 0.4 },
    metrics: { services: 0.6, security: 0.4 },
    rivals: ["nobility"],
  },
];

export const BLOC_IDS = BLOCS.map((b) => b.id);
export const BLOC_BY_ID = Object.fromEntries(BLOCS.map((b) => [b.id, b]));

// Region archetypes for quick generation: population range, wealth, urbanisation,
// bloc mix, and which issues get a local salience bump.
export const REGION_TEMPLATES = [
  { id: "capital", name: "Capital City", pop: [9000, 16000], wealth: 70, urban: 0.95, mix: { merchants: 18, laborers: 18, scholars: 12, nobility: 8, youth: 14, elders: 10, artisans: 12, soldiers: 8 }, focus: { authority: 0.3, infrastructure: 0.3 } },
  { id: "farmland", name: "Farmland", pop: [2500, 6000], wealth: 40, urban: 0.15, mix: { farmers: 50, elders: 15, clergy: 10, youth: 10, laborers: 10, nobility: 5 }, focus: { trade: 0.3, environment: 0.3 } },
  { id: "mining", name: "Mining Hills", pop: [2500, 7000], wealth: 45, urban: 0.4, mix: { miners: 48, laborers: 20, artisans: 10, youth: 10, elders: 8, merchants: 4 }, focus: { labor: 0.4, environment: 0.3 } },
  { id: "port", name: "Port Town", pop: [3500, 9000], wealth: 60, urban: 0.7, mix: { sailors: 34, merchants: 22, laborers: 16, youth: 12, artisans: 8, soldiers: 8 }, focus: { trade: 0.4 } },
  { id: "frontier", name: "Frontier", pop: [1200, 4000], wealth: 30, urban: 0.1, mix: { frontier: 45, soldiers: 15, farmers: 15, miners: 10, youth: 15 }, focus: { expansion: 0.4, settlers: 0.4, military: 0.2 } },
  { id: "temple", name: "Temple Town", pop: [2000, 5000], wealth: 50, urban: 0.5, mix: { clergy: 40, elders: 20, farmers: 15, artisans: 10, nobility: 5, youth: 10 }, focus: { tradition: 0.5 } },
  { id: "garrison", name: "Garrison March", pop: [1500, 4500], wealth: 45, urban: 0.35, mix: { soldiers: 45, laborers: 15, farmers: 15, frontier: 10, elders: 5, youth: 10 }, focus: { military: 0.5, order: 0.3 } },
  { id: "market", name: "Market Town", pop: [3000, 8000], wealth: 65, urban: 0.65, mix: { merchants: 30, artisans: 25, laborers: 15, youth: 10, elders: 10, nobility: 10 }, focus: { economy: 0.3, trade: 0.3 } },
  { id: "academy", name: "Scholar's Quarter", pop: [1500, 4000], wealth: 60, urban: 0.8, mix: { scholars: 45, youth: 25, artisans: 10, merchants: 10, clergy: 5, elders: 5 }, focus: { tradition: 0.3, environment: 0.2 } },
  { id: "estates", name: "Noble Estates", pop: [1200, 3500], wealth: 85, urban: 0.25, mix: { nobility: 30, farmers: 30, clergy: 10, elders: 15, soldiers: 10, laborers: 5 }, focus: { authority: 0.3, labor: 0.2 } },
  { id: "forest", name: "Forest Hamlets", pop: [1000, 3000], wealth: 35, urban: 0.05, mix: { farmers: 30, frontier: 20, elders: 20, clergy: 10, youth: 10, artisans: 10 }, focus: { environment: 0.6 } },
];
