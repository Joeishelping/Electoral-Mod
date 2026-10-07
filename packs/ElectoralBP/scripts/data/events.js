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
  { id: "crime", name: "Crime Wave", desc: "Law and order voters are angry.", salience: { order: 1.8, military: 1.1 }, metrics: { security: -18 }, incumbent: -0.05 },
  { id: "migration", name: "Migration Wave", desc: "Newcomers are arriving. Borders become the big debate.", salience: { settlers: 2, authority: 1.2 }, metrics: {}, incumbent: 0 },
  { id: "plague", name: "Plague", desc: "Sickness spreads. Public services are judged harshly.", salience: { welfare: 1.6, infrastructure: 1.3 }, metrics: { services: -20 }, incumbent: -0.05 },
  { id: "disaster", name: "Disaster", desc: "A flood, fire or quake. Rebuilding matters; a good response rallies people.", salience: { infrastructure: 1.7, welfare: 1.2 }, metrics: { services: -8 }, incumbent: 0.08 },
  { id: "reform", name: "Popular Reform", desc: "The leader passed something people love.", salience: {}, metrics: { services: 12 }, incumbent: 0.15 },
  { id: "unrest", name: "Riots & Unrest", desc: "Streets are restless. Order and authority are on everyone's mind.", salience: { order: 1.5, authority: 1.4 }, metrics: { security: -10 }, incumbent: -0.15 },
];
export const TERM_EVENT_BY_ID = Object.fromEntries(TERM_EVENTS.map((e) => [e.id, e]));

// Election-day surprises. Rolled fresh for every election: they change the real
// numbers and are announced during the count.
export function rollDayEvents(rng, nation, candidates, blocNames) {
  const events = [];
  const regions = nation.regions;
  if (!regions.length || !candidates.length) return events;
  const pickRegion = () => rng.pick(regions);
  const pickCand = () => rng.int(0, candidates.length - 1);
  const name = (i) => candidates[i].name || "a candidate";
  const table = [
    [0.45, () => { const r = pickRegion(); return { type: "storm", regionId: r.id, turnout: 0.78, text: `Heavy storms over ${r.name} kept many voters home.` }; }],
    [0.35, () => { const r = pickRegion(); return { type: "lines", regionId: r.id, turnout: 1.12, text: `Record lines in ${r.name} - turnout there is surging.` }; }],
    [0.15, () => { const c = pickCand(); return { type: "scandal", cand: c, swing: -0.3, text: `A last-minute scandal hit ${name(c)} on the eve of the vote.` }; }],
    [0.3, () => { const c = pickCand(); const b = rng.pick(Object.keys(blocNames)); return { type: "endorse", cand: c, blocId: b, swing: 0.45, text: `${blocNames[b]} leaders endorsed ${name(c)} at the last minute.` }; }],
    [0.4, () => { const c = pickCand(); const r = pickRegion(); return { type: "ground", cand: c, regionId: r.id, swing: 0.3, text: `${name(c)}'s supporters ran a huge ground game in ${r.name}.` }; }],
    [0.15, () => ({ type: "youth", blocId: "youth", turnout: 1.45, text: "Young voters turned out in unusual numbers." })],
    [0.12, () => { const c = pickCand(); return { type: "debate", cand: c, swing: 0.2, text: `${name(c)} won the final debate and gained late momentum.` }; }],
    [0.1, () => { const r = pickRegion(); return { type: "shortage", regionId: r.id, turnout: 0.85, text: `Ballot shortages slowed voting in ${r.name}.` }; }],
  ];
  for (const [p, make] of table) if (rng.chance(p) && events.length < 4) events.push(make());
  return events;
}
