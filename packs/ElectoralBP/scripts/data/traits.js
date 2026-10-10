// Character traits, CK3-style. Who a candidate IS matters as much as what they
// say: each trait shifts specific interest groups, and some change the odds of
// election-day events (scandals, gaffes, debate wins) or bring money.
//   groups   interest group -> appeal change (about +-0.6 at most)
//   valence  general appeal with everyone
//   scandal  multiplier on the chance of a late scandal
//   debate   multiplier on the chance of winning the debate
//   gaffe    chance of a campaign-trail gaffe
//   money    extra effective campaign funds
//   mobilize this candidate's fans turn out harder

export const TRAITS = [
  { id: "charismatic", name: "Charismatic", desc: "Lights up a room. Everyone likes them a little more.", valence: 0.18, groups: { youth: 0.15 } },
  { id: "silver", name: "Silver Tongue", desc: "A brilliant debater.", valence: 0.05, groups: {}, debate: 3, opposite: ["gaffe"] },
  { id: "gaffe", name: "Gaffe-Prone", desc: "Says the wrong thing at the worst time.", valence: -0.08, groups: {}, gaffe: 0.45, opposite: ["silver"] },
  { id: "warhero", name: "War Hero", desc: "Decorated in battle. Veterans and patriots adore them.", valence: 0.08, groups: { military: 0.6, patriots: 0.4, gunowners: 0.15, progressives: -0.1 } },
  { id: "devout", name: "Devout", desc: "Openly, deeply religious.", groups: { religious: 0.6, retirees: 0.15, progressives: -0.3, libertarians: -0.15, youth: -0.1 }, opposite: ["secular"] },
  { id: "secular", name: "Secularist", desc: "Wants faith out of politics.", groups: { progressives: 0.35, youth: 0.15, religious: -0.55 }, opposite: ["devout"] },
  { id: "corrupt", name: "Corrupt", desc: "Takes bribes. Donors love it - until a scandal breaks.", valence: -0.08, groups: { capitalists: 0.15 }, scandal: 3.5, money: 20, opposite: ["clean"] },
  { id: "clean", name: "Squeaky Clean", desc: "Not a single skeleton in the closet.", valence: 0.08, groups: { religious: 0.12, retirees: 0.12 }, scandal: 0.2, opposite: ["corrupt"] },
  { id: "populist", name: "Populist", desc: "Speaks for 'the people' against 'the elites'.", groups: { poor: 0.4, workers: 0.3, farmers: 0.15, wealthy: -0.4, capitalists: -0.2 }, mobilize: true, opposite: ["elitist"] },
  { id: "elitist", name: "Elitist", desc: "Polished, connected and out of touch.", groups: { wealthy: 0.35, capitalists: 0.2, poor: -0.4, workers: -0.25 }, money: 10, opposite: ["populist"] },
  { id: "mogul", name: "Business Mogul", desc: "Built an empire. Brings deep pockets.", groups: { capitalists: 0.5, merchants: 0.3, unions: -0.45, poor: -0.1 }, money: 25 },
  { id: "unionman", name: "Union Organizer", desc: "Came up through the labor movement.", groups: { unions: 0.65, workers: 0.4, capitalists: -0.5, wealthy: -0.2 } },
  { id: "outsider", name: "Outsider", desc: "Never held office. Fresh to some, risky to others.", groups: { youth: 0.2, libertarians: 0.2, middle: 0.05, retirees: -0.12 }, mobilize: true, opposite: ["career"] },
  { id: "career", name: "Career Politician", desc: "Knows the system - and everyone knows it.", valence: -0.08, groups: { middle: 0.1, retirees: 0.1 }, opposite: ["outsider"] },
  { id: "intellectual", name: "Intellectual", desc: "Brilliant, bookish, a little aloof.", groups: { progressives: 0.25, youth: 0.15, workers: -0.15, farmers: -0.1 } },
  { id: "hardliner", name: "Hardliner", desc: "Never compromises. Inspires the base, scares the middle.", groups: { patriots: 0.4, gunowners: 0.25, middle: -0.15, immigrants: -0.45, progressives: -0.3 }, mobilize: true, opposite: ["moderate"] },
  { id: "moderate", name: "Bridge Builder", desc: "Works across the aisle. Few love them, few hate them.", valence: 0.05, groups: { middle: 0.3, retirees: 0.1 }, opposite: ["hardliner"] },
  { id: "folk", name: "Folk Hero", desc: "A legend in the countryside.", valence: 0.1, groups: { farmers: 0.45, workers: 0.2, gunowners: 0.15 } },
  { id: "immigrant", name: "Immigrant Roots", desc: "Came to the nation with nothing.", groups: { immigrants: 0.65, progressives: 0.1, patriots: -0.35 } },
  { id: "green", name: "Green Crusader", desc: "Has chained themselves to a tree. Twice.", groups: { greens: 0.65, youth: 0.2, workers: -0.35, capitalists: -0.2 } },
  { id: "marksman", name: "Sharpshooter", desc: "Never seen without a rifle.", groups: { gunowners: 0.55, farmers: 0.1, progressives: -0.3 } },
  { id: "elder", name: "Elder Statesman", desc: "Decades of experience. Maybe too many.", groups: { retirees: 0.35, youth: -0.25 }, opposite: ["young"] },
  { id: "young", name: "Young Gun", desc: "Energetic and new to the stage.", groups: { youth: 0.4, retirees: -0.2 }, mobilize: true, opposite: ["elder"] },
  { id: "demagogue", name: "Demagogue", desc: "Stirs crowds with fear and fury.", valence: -0.05, groups: { patriots: 0.35, poor: 0.15, progressives: -0.35, libertarians: -0.2, immigrants: -0.3 }, mobilize: true },
  { id: "heir", name: "Wealthy Heir", desc: "Born rich. Never had to work.", groups: { wealthy: 0.3, poor: -0.25, workers: -0.15 }, money: 20 },
  { id: "libertine", name: "Free Spirit", desc: "Openly enjoys the vices others hide.", groups: { libertarians: 0.3, youth: 0.25, religious: -0.45, retirees: -0.15 } },
];

export const TRAIT_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t]));
export const MAX_TRAITS = 3;

/** Appeal of one person's traits to a mix of groups ([[groupId, weight], ...]). */
export function traitAppeal(traits, mix) {
  let total = 0;
  const parts = {};
  for (const id of traits || []) {
    const t = TRAIT_BY_ID[id];
    if (!t) continue;
    let v = t.valence || 0;
    let wsum = 0;
    for (const [g, w] of mix) {
      v += (t.groups[g] || 0) * w;
      wsum += w;
    }
    if (wsum > 0 && wsum !== 1) v = (t.valence || 0) + (v - (t.valence || 0)) / wsum;
    parts[id] = v;
    total += v;
  }
  return { total, parts };
}

export const traitMoney = (traits) => (traits || []).reduce((s, id) => s + (TRAIT_BY_ID[id]?.money || 0), 0);
export const hasFlag = (traits, flag) => (traits || []).some((id) => TRAIT_BY_ID[id]?.[flag]);
export const traitFactor = (traits, key) => (traits || []).reduce((m, id) => m * (TRAIT_BY_ID[id]?.[key] ?? 1), 1);
