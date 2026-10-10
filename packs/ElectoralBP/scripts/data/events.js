import { TRAIT_BY_ID } from "./traits.js";

// Things that happened during the current term. Admins toggle them on; they
// change what voters care about and how they judge whoever is in office.
//   salience  issue -> multiplier on how much voters care
//   metrics   performance slider -> shift (on top of the sliders)
//   incumbent extra appeal (+) or damage (-) for the officeholder

export const TERM_EVENTS = [
  { id: "war", name: "War", desc: "Defense dominates; voters rally to the leader at first.", salience: { military: 1.7, expansion: 1.3, order: 1.2 }, metrics: {}, incumbent: 0.2 },
  { id: "recession", name: "Recession", desc: "The economy is all anyone talks about, and the leader takes the blame.", salience: { economy: 1.6, labor: 1.3 }, metrics: { economy: -22, jobs: -12 }, incumbent: 0 },
  { id: "boom", name: "Economic Boom", desc: "Good times make the leader look good.", salience: { economy: 1.2 }, metrics: { economy: 20, jobs: 12 }, incumbent: 0.05 },
  { id: "scandal", name: "Scandal", desc: "The leader is caught in a scandal. Honest-minded voters punish them.", salience: {}, metrics: { integrity: -25 }, incumbent: -0.35 },
  { id: "famine", name: "Famine", desc: "Crops failed. Farmers and the hungry want change.", salience: { environment: 1.6, welfare: 1.4, trade: 1.2 }, metrics: { food: -30, services: -8 }, incumbent: -0.1 },
  { id: "strikes", name: "Strikes", desc: "Workers walked off the job. Labor becomes the issue.", salience: { labor: 1.8, welfare: 1.2 }, metrics: { jobs: -15 }, incumbent: -0.05 },
  { id: "crime", name: "Crime Wave", desc: "Tough-on-crime voters are angry.", salience: { order: 1.8, guns: 1.4 }, metrics: { security: -18 }, incumbent: -0.05 },
  { id: "drugs", name: "Drug Epidemic", desc: "Overdoses are rising. Prohibition vs legalization is the fight of the year.", salience: { drugs: 2.2, order: 1.3, welfare: 1.2 }, metrics: { services: -10 }, incumbent: -0.08 },
  { id: "censorship", name: "Censorship Row", desc: "The government silenced critics - or fought lies, depending who you ask.", salience: { speech: 2.2, authority: 1.4 }, metrics: { integrity: -10 }, incumbent: -0.08 },
  { id: "shooting", name: "Gun Violence Crisis", desc: "A wave of shootings reignites the gun debate.", salience: { guns: 2.3, order: 1.4 }, metrics: { security: -12 }, incumbent: -0.05 },
  { id: "corruption", name: "Lobbying Scandal", desc: "Officials caught taking lobby money. Clean candidates shine.", salience: { economy: 1.2 }, metrics: { integrity: -20 }, incumbent: -0.2 },
  { id: "migration", name: "Migration Wave", desc: "Newcomers are arriving. Borders become the big debate.", salience: { settlers: 2, authority: 1.2 }, metrics: {}, incumbent: 0 },
  { id: "plague", name: "Plague", desc: "Sickness spreads. Public services are judged harshly.", salience: { welfare: 1.6, infrastructure: 1.3 }, metrics: { services: -20 }, incumbent: -0.05 },
  { id: "disaster", name: "Disaster", desc: "A flood, fire or quake. Rebuilding matters; a good response rallies people.", salience: { infrastructure: 1.7, welfare: 1.2 }, metrics: { services: -8 }, incumbent: 0.08 },
  { id: "reform", name: "Popular Reform", desc: "The leader passed something people love.", salience: {}, metrics: { services: 12 }, incumbent: 0.15 },
  { id: "unrest", name: "Riots & Unrest", desc: "Streets are restless. Order and authority are on everyone's mind.", salience: { order: 1.5, authority: 1.4, speech: 1.2 }, metrics: { security: -10 }, incumbent: -0.15 },
];
export const TERM_EVENT_BY_ID = Object.fromEntries(TERM_EVENTS.map((e) => [e.id, e]));

// Election-day surprises. Rolled fresh for every election: they change the real
// numbers and are announced during the count. Who the candidates are drives them:
// corrupt or scandal-prone people get caught, silver tongues win debates,
// gaffe-prone ones blunder, and courted lobbies endorse.
export function rollDayEvents(rng, nation, candidates, blocNames) {
  const events = [];
  const regions = nation.regions;
  if (!regions.length || !candidates.length) return events;
  const pickRegion = () => rng.pick(regions);
  const idx = candidates.map((_, i) => i);
  const name = (i) => candidates[i].name || "a candidate";
  const traitsOf = (i) => candidates[i].traits || [];
  const factor = (i, key) => traitsOf(i).reduce((m, id) => m * (TRAIT_BY_ID[id]?.[key] ?? 1), 1);

  // scandals: dishonest and corrupt candidates are far more likely to be caught
  for (const i of idx) {
    const p = 0.06 * factor(i, "scandal") * (1.6 - candidates[i].integrity / 100);
    if (rng.chance(Math.min(0.6, p))) {
      const corrupt = traitsOf(i).includes("corrupt");
      events.push({ type: "scandal", cand: i, swing: corrupt ? -0.4 : -0.3, text: corrupt ? `Leaked ledgers show ${name(i)} taking bribes from lobbyists!` : `A last-minute scandal hit ${name(i)} on the eve of the vote.` });
    }
  }
  // gaffes
  for (const i of idx) {
    const g = traitsOf(i).reduce((m, id) => Math.max(m, TRAIT_BY_ID[id]?.gaffe || 0), 0.04);
    if (rng.chance(g)) events.push({ type: "gaffe", cand: i, swing: -0.2, text: `${name(i)} was caught on a hot mic insulting voters. The clip is everywhere.` });
  }
  // the final debate
  if (candidates.length > 1 && rng.chance(0.55)) {
    const w = rng.weighted(idx, (i) => factor(i, "debate") * (0.5 + candidates[i].charisma / 100));
    events.push({ type: "debate", cand: w, swing: 0.2, text: `${name(w)} won the final debate and gained late momentum.` });
  }
  // endorsements come from groups the candidate courts or is backed by
  if (rng.chance(0.45)) {
    const c = rng.int(0, candidates.length - 1);
    const pool = [...(candidates[c].targets || []), ...(candidates[c].backers || [])].filter((b) => blocNames[b]);
    const b = pool.length ? rng.pick(pool) : rng.pick(Object.keys(blocNames));
    events.push({ type: "endorse", cand: c, blocId: b, swing: 0.45, text: `The ${blocNames[b]} formally endorsed ${name(c)} at the last minute.` });
  }
  // fired-up bases
  for (const i of idx) {
    if (!traitsOf(i).some((id) => TRAIT_BY_ID[id]?.mobilize) || !rng.chance(0.35)) continue;
    const groups = Object.entries(traitsOf(i).reduce((acc, id) => {
      for (const [g, v] of Object.entries(TRAIT_BY_ID[id]?.groups || {})) acc[g] = (acc[g] || 0) + v;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]);
    if (groups.length && groups[0][1] > 0 && blocNames[groups[0][0]]) events.push({ type: "rally", blocId: groups[0][0], turnout: 1.3, text: `${name(i)}'s rallies have the ${blocNames[groups[0][0]]} fired up - they're flooding the polls.` });
  }
  const table = [
    [0.45, () => { const r = pickRegion(); return { type: "storm", regionId: r.id, turnout: 0.78, text: `Heavy storms over ${r.name} kept many voters home.` }; }],
    [0.35, () => { const r = pickRegion(); return { type: "lines", regionId: r.id, turnout: 1.12, text: `Record lines in ${r.name} - turnout there is surging.` }; }],
    [0.4, () => { const c = rng.int(0, candidates.length - 1); const r = pickRegion(); return { type: "ground", cand: c, regionId: r.id, swing: 0.3, text: `${name(c)}'s volunteers ran a huge ground game in ${r.name}.` }; }],
    [0.12, () => ({ type: "youth", blocId: "youth", turnout: 1.45, text: "Young voters turned out in unusual numbers." })],
    [0.1, () => { const r = pickRegion(); return { type: "shortage", regionId: r.id, turnout: 0.85, text: `Ballot shortages slowed voting in ${r.name}.` }; }],
  ];
  for (const [p, make] of table) if (rng.chance(p)) events.push(make());
  return rng.shuffle(events).slice(0, 5);
}
