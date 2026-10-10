// Interest groups. Every county is a mix of these. A group has:
//  ideal       where it stands on each policy (-100..100)
//  salience    how much it cares about each policy (0..1, default 0.2)
//  turnout     base share of members who vote
//  loyalty     how strongly habit and party memory pull it
//  volatility  how much it swings election to election
//  traits      what it values in a candidate: charisma, competence, integrity, wealth
//  metrics     extra weight on particular performance sliders
//  rivals      groups it resents; courting a rival costs a little support

export const BLOCS = [
  {
    id: "capitalists", name: "Business Lobby", short: "Business",
    ideal: { economy: 80, trade: 70, labor: -70, welfare: -40, environment: -40, infrastructure: 20, authority: -10, settlers: 20 },
    salience: { economy: 1, labor: 0.8, trade: 0.7, environment: 0.4 },
    turnout: 0.85, loyalty: 0.6, volatility: 0.6,
    traits: { charisma: 0.6, competence: 1.3, integrity: 0.5, wealth: 1.6 },
    metrics: { economy: 1.3 },
    rivals: ["unions", "greens", "poor"],
  },
  {
    id: "unions", name: "Trade Unions", short: "Unions",
    ideal: { labor: 90, welfare: 60, economy: -50, trade: -40, infrastructure: 50, environment: -10 },
    salience: { labor: 1, welfare: 0.7, trade: 0.5, economy: 0.6 },
    turnout: 0.7, loyalty: 0.8, volatility: 0.5,
    traits: { charisma: 1.2, competence: 0.8, integrity: 1.0, wealth: 0.2 },
    metrics: { jobs: 1.4 },
    rivals: ["capitalists", "wealthy"],
  },
  {
    id: "religious", name: "Religious Conservatives", short: "Religious",
    ideal: { tradition: 90, drugs: -80, order: 50, speech: -30, guns: 30, settlers: -30, welfare: 20 },
    salience: { tradition: 1, drugs: 0.8, order: 0.5, speech: 0.4 },
    turnout: 0.82, loyalty: 0.85, volatility: 0.35,
    traits: { charisma: 0.7, competence: 0.6, integrity: 1.8, wealth: 0.3 },
    metrics: { integrity: 1.0 },
    rivals: ["progressives", "libertarians"],
  },
  {
    id: "progressives", name: "Progressives", short: "Progressives",
    ideal: { tradition: -80, welfare: 60, environment: 60, settlers: 60, guns: -70, order: -50, drugs: 50, economy: -40, speech: -20 },
    salience: { tradition: 0.7, environment: 0.7, settlers: 0.6, guns: 0.6, order: 0.6, welfare: 0.5 },
    turnout: 0.72, loyalty: 0.6, volatility: 0.6,
    traits: { charisma: 1.0, competence: 1.3, integrity: 1.1, wealth: 0.2 },
    metrics: { services: 0.8 },
    rivals: ["religious", "patriots", "gunowners"],
  },
  {
    id: "greens", name: "Environmentalists", short: "Greens",
    ideal: { environment: 95, trade: -20, infrastructure: 30, expansion: -40, military: -40 },
    salience: { environment: 1, expansion: 0.3, infrastructure: 0.3 },
    turnout: 0.7, loyalty: 0.5, volatility: 0.7,
    traits: { charisma: 0.9, competence: 1.1, integrity: 1.3, wealth: 0.2 },
    metrics: { food: 1.0 },
    rivals: ["capitalists", "workers"],
  },
  {
    id: "patriots", name: "Patriots & Nationalists", short: "Patriots",
    ideal: { military: 80, settlers: -85, expansion: 60, authority: 50, tradition: 50, guns: 50, trade: -40, speech: 30 },
    salience: { settlers: 1, military: 0.8, expansion: 0.6, authority: 0.4 },
    turnout: 0.78, loyalty: 0.7, volatility: 0.5,
    traits: { charisma: 1.4, competence: 0.8, integrity: 0.8, wealth: 0.5 },
    metrics: { security: 1.2 },
    rivals: ["immigrants", "progressives"],
  },
  {
    id: "farmers", name: "Farmers", short: "Farmers",
    ideal: { trade: -50, environment: 10, tradition: 50, authority: -40, guns: 40, welfare: 10, settlers: -20 },
    salience: { trade: 0.9, environment: 0.7, authority: 0.5, tradition: 0.4 },
    turnout: 0.72, loyalty: 0.7, volatility: 0.6,
    traits: { charisma: 0.8, competence: 0.9, integrity: 1.3, wealth: 0.5 },
    metrics: { food: 1.4 },
    rivals: ["merchants"],
  },
  {
    id: "workers", name: "Miners & Factory Workers", short: "Workers",
    ideal: { labor: 60, environment: -70, trade: -60, welfare: 30, infrastructure: 50, guns: 30, settlers: -30 },
    salience: { labor: 0.8, environment: 0.7, trade: 0.8, infrastructure: 0.5 },
    turnout: 0.6, loyalty: 0.65, volatility: 0.8,
    traits: { charisma: 1.2, competence: 0.8, integrity: 1.0, wealth: 0.3 },
    metrics: { jobs: 1.2 },
    rivals: ["greens", "capitalists"],
  },
  {
    id: "poor", name: "The Poor", short: "Poor",
    ideal: { welfare: 90, economy: -60, labor: 60, infrastructure: 40, order: -20, drugs: 10 },
    salience: { welfare: 1, economy: 0.6, labor: 0.5 },
    turnout: 0.45, loyalty: 0.5, volatility: 1.0,
    traits: { charisma: 1.3, competence: 0.6, integrity: 1.0, wealth: 0.1 },
    metrics: { services: 1.2, jobs: 0.8 },
    rivals: ["wealthy"],
  },
  {
    id: "wealthy", name: "The Wealthy Elite", short: "Wealthy",
    ideal: { economy: 90, welfare: -70, labor: -60, authority: 20, order: 40, trade: 50, tradition: 20 },
    salience: { economy: 1, welfare: 0.6, labor: 0.4 },
    turnout: 0.92, loyalty: 0.75, volatility: 0.4,
    traits: { charisma: 0.6, competence: 1.0, integrity: 0.5, wealth: 1.8 },
    metrics: { economy: 1.0 },
    rivals: ["poor", "unions"],
  },
  {
    id: "middle", name: "Middle Class", short: "Middle Class",
    ideal: { economy: 20, order: 30, infrastructure: 30, welfare: 0, settlers: 0, guns: 0, drugs: -10 },
    salience: { economy: 0.7, order: 0.5, infrastructure: 0.5, welfare: 0.3 },
    turnout: 0.7, loyalty: 0.45, volatility: 1.0,
    traits: { charisma: 1.0, competence: 1.1, integrity: 1.1, wealth: 0.6 },
    metrics: { economy: 0.8, services: 0.5 },
    rivals: [],
  },
  {
    id: "youth", name: "Youth & Students", short: "Youth",
    ideal: { drugs: 70, environment: 60, tradition: -60, settlers: 40, speech: 40, order: -40, welfare: 40, military: -30 },
    salience: { drugs: 0.7, environment: 0.7, speech: 0.5, tradition: 0.4 },
    turnout: 0.4, loyalty: 0.2, volatility: 1.4,
    traits: { charisma: 1.8, competence: 0.6, integrity: 0.9, wealth: 0.2 },
    metrics: { jobs: 0.6 },
    rivals: ["retirees"],
  },
  {
    id: "retirees", name: "Retirees", short: "Retirees",
    ideal: { welfare: 60, tradition: 50, order: 50, drugs: -60, settlers: -30, infrastructure: 20 },
    salience: { welfare: 1, order: 0.6, drugs: 0.4 },
    turnout: 0.9, loyalty: 0.85, volatility: 0.35,
    traits: { charisma: 0.6, competence: 1.0, integrity: 1.4, wealth: 0.4 },
    metrics: { services: 1.2 },
    rivals: ["youth"],
  },
  {
    id: "immigrants", name: "Immigrants", short: "Immigrants",
    ideal: { settlers: 95, welfare: 50, labor: 40, tradition: -10, order: -30 },
    salience: { settlers: 1, welfare: 0.5, labor: 0.4 },
    turnout: 0.45, loyalty: 0.6, volatility: 0.8,
    traits: { charisma: 1.1, competence: 0.9, integrity: 1.0, wealth: 0.3 },
    metrics: { jobs: 0.8 },
    rivals: ["patriots"],
  },
  {
    id: "gunowners", name: "Gun Owners", short: "Gun Owners",
    ideal: { guns: 95, authority: -60, order: 30, speech: 50, tradition: 30, economy: 30 },
    salience: { guns: 1, authority: 0.5, speech: 0.3 },
    turnout: 0.8, loyalty: 0.75, volatility: 0.45,
    traits: { charisma: 1.1, competence: 0.8, integrity: 1.0, wealth: 0.5 },
    metrics: { security: 0.8 },
    rivals: ["progressives"],
  },
  {
    id: "military", name: "Soldiers & Veterans", short: "Veterans",
    ideal: { military: 90, order: 60, expansion: 40, welfare: 30, authority: 40, guns: 40 },
    salience: { military: 1, order: 0.5, welfare: 0.4 },
    turnout: 0.78, loyalty: 0.7, volatility: 0.5,
    traits: { charisma: 1.0, competence: 1.2, integrity: 1.1, wealth: 0.3 },
    metrics: { security: 1.4 },
    rivals: [],
  },
  {
    id: "libertarians", name: "Libertarians", short: "Libertarians",
    ideal: { authority: -90, speech: 90, drugs: 70, guns: 80, economy: 60, welfare: -60, order: -30, military: -20 },
    salience: { authority: 1, speech: 0.8, drugs: 0.6, guns: 0.6, economy: 0.5 },
    turnout: 0.7, loyalty: 0.4, volatility: 0.7,
    traits: { charisma: 1.0, competence: 1.2, integrity: 1.0, wealth: 0.8 },
    metrics: { economy: 0.6 },
    rivals: ["religious"],
  },
  {
    id: "merchants", name: "Merchants & Traders", short: "Merchants",
    ideal: { trade: 85, economy: 60, settlers: 30, infrastructure: 40, labor: -30, expansion: 20 },
    salience: { trade: 1, economy: 0.7, infrastructure: 0.4 },
    turnout: 0.75, loyalty: 0.45, volatility: 0.8,
    traits: { charisma: 0.8, competence: 1.2, integrity: 0.8, wealth: 1.3 },
    metrics: { economy: 1.0 },
    rivals: ["farmers", "unions"],
  },
];

export const BLOC_IDS = BLOCS.map((b) => b.id);
export const BLOC_BY_ID = Object.fromEntries(BLOCS.map((b) => [b.id, b]));

// Older saves used Minecraft professions; map them onto today's groups.
export const LEGACY_BLOCS = {
  miners: "workers", laborers: "unions", soldiers: "military", clergy: "religious", scholars: "progressives",
  nobility: "wealthy", elders: "retirees", sailors: "workers", artisans: "middle", frontier: "gunowners",
};

// County types: population range, wealth, urbanisation, group mix, and which
// policies the county cares about more than usual.
export const REGION_TEMPLATES = [
  { id: "capital", name: "Capital City", pop: [9000, 16000], wealth: 70, urban: 0.95, mix: { progressives: 16, middle: 14, capitalists: 10, unions: 10, youth: 12, immigrants: 10, poor: 10, wealthy: 6, retirees: 6, libertarians: 6 }, focus: { authority: 0.3, infrastructure: 0.3 } },
  { id: "farmland", name: "Farm Country", pop: [2500, 6000], wealth: 40, urban: 0.15, mix: { farmers: 40, religious: 18, gunowners: 14, retirees: 12, middle: 8, patriots: 8 }, focus: { trade: 0.3, environment: 0.2 } },
  { id: "mining", name: "Industrial Town", pop: [3000, 8000], wealth: 40, urban: 0.5, mix: { workers: 40, unions: 22, poor: 12, patriots: 8, retirees: 8, immigrants: 6, middle: 4 }, focus: { labor: 0.4, trade: 0.3 } },
  { id: "port", name: "Port City", pop: [4000, 10000], wealth: 60, urban: 0.8, mix: { merchants: 24, immigrants: 16, unions: 14, workers: 10, middle: 12, progressives: 10, poor: 8, capitalists: 6 }, focus: { trade: 0.4, settlers: 0.3 } },
  { id: "frontier", name: "Frontier Backcountry", pop: [1200, 4000], wealth: 30, urban: 0.1, mix: { gunowners: 30, farmers: 20, patriots: 18, libertarians: 14, religious: 10, poor: 8 }, focus: { guns: 0.5, authority: 0.4 } },
  { id: "temple", name: "Religious Heartland", pop: [2000, 6000], wealth: 45, urban: 0.4, mix: { religious: 45, retirees: 18, farmers: 12, middle: 10, patriots: 10, youth: 5 }, focus: { tradition: 0.5, drugs: 0.4 } },
  { id: "garrison", name: "Military Town", pop: [1500, 5000], wealth: 45, urban: 0.4, mix: { military: 42, patriots: 18, gunowners: 12, middle: 12, retirees: 8, unions: 8 }, focus: { military: 0.5, expansion: 0.3 } },
  { id: "market", name: "Financial District", pop: [3000, 8000], wealth: 85, urban: 0.9, mix: { capitalists: 30, wealthy: 20, merchants: 16, middle: 14, libertarians: 10, progressives: 10 }, focus: { economy: 0.4, trade: 0.3 } },
  { id: "academy", name: "University Town", pop: [1500, 5000], wealth: 55, urban: 0.8, mix: { youth: 36, progressives: 30, greens: 12, libertarians: 8, middle: 8, immigrants: 6 }, focus: { drugs: 0.3, speech: 0.3, environment: 0.3 } },
  { id: "estates", name: "Wealthy Suburbs", pop: [2000, 6000], wealth: 90, urban: 0.5, mix: { wealthy: 30, middle: 26, retirees: 16, capitalists: 12, religious: 8, gunowners: 8 }, focus: { economy: 0.3, order: 0.3 } },
  { id: "forest", name: "Wild Country", pop: [1000, 3500], wealth: 35, urban: 0.05, mix: { greens: 26, farmers: 22, gunowners: 16, libertarians: 14, retirees: 12, religious: 10 }, focus: { environment: 0.6 } },
  { id: "slums", name: "Working-Class Slums", pop: [3000, 9000], wealth: 20, urban: 0.9, mix: { poor: 38, immigrants: 18, unions: 14, workers: 12, youth: 12, religious: 6 }, focus: { welfare: 0.5, order: 0.3 } },
  { id: "migrant", name: "Immigrant Quarter", pop: [2000, 7000], wealth: 35, urban: 0.85, mix: { immigrants: 45, poor: 16, unions: 12, merchants: 10, youth: 10, religious: 7 }, focus: { settlers: 0.6 } },
  { id: "retirement", name: "Retirement Coast", pop: [1500, 5000], wealth: 60, urban: 0.4, mix: { retirees: 50, wealthy: 14, middle: 14, religious: 12, patriots: 10 }, focus: { welfare: 0.4, order: 0.3 } },
];
