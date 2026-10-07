// Policy axes. Every voter group, candidate, party and clan holds a position
// from -100 (the "low" pole) to +100 (the "high" pole) on each axis.

export const ISSUES = [
  { id: "economy", name: "Economy", low: "State Control", high: "Free Enterprise" },
  { id: "welfare", name: "Welfare", low: "Self-Reliance", high: "Safety Net" },
  { id: "labor", name: "Labor", low: "Owner Rights", high: "Worker Rights" },
  { id: "military", name: "Military", low: "Peace First", high: "Strong Army" },
  { id: "order", name: "Law & Order", low: "Civil Liberty", high: "Strict Order" },
  { id: "tradition", name: "Tradition", low: "Progress", high: "Tradition & Faith" },
  { id: "environment", name: "Land & Nature", low: "Industry First", high: "Protect Nature" },
  { id: "trade", name: "Trade", low: "Protectionism", high: "Open Trade" },
  { id: "expansion", name: "Expansion", low: "Stay Home", high: "Expand Borders" },
  { id: "infrastructure", name: "Public Works", low: "Lean Spending", high: "Build Big" },
  { id: "authority", name: "Authority", low: "Local Autonomy", high: "Central Power" },
  { id: "settlers", name: "Newcomers", low: "Closed Borders", high: "Open Borders" },
];

export const ISSUE_IDS = ISSUES.map((i) => i.id);
export const ISSUE_BY_ID = Object.fromEntries(ISSUES.map((i) => [i.id, i]));

export function describePosition(issueId, value) {
  const issue = ISSUE_BY_ID[issueId];
  if (!issue) return String(value);
  const a = Math.abs(value);
  if (a < 15) return "Moderate";
  const pole = value < 0 ? issue.low : issue.high;
  if (a < 45) return `Leans ${pole}`;
  if (a < 75) return pole;
  return `Strongly ${pole}`;
}

export function blankPositions(value = 0) {
  return Object.fromEntries(ISSUE_IDS.map((id) => [id, value]));
}
