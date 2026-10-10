// Policy axes - the hot-button debates of the nation. Every interest group,
// candidate and party holds a position from -100 (the "low" side) to +100 (the
// "high" side) on each. Ids are internal; names are what players see.

export const ISSUES = [
  { id: "economy", name: "Taxes & Business", low: "Tax the Rich", high: "Cut Taxes" },
  { id: "welfare", name: "Welfare State", low: "Slash Handouts", high: "Expand Welfare" },
  { id: "labor", name: "Unions & Wages", low: "Break the Unions", high: "Higher Minimum Wage" },
  { id: "military", name: "Military Spending", low: "Cut the Military", high: "Arms Buildup" },
  { id: "order", name: "Crime & Policing", low: "Police Reform", high: "Tough on Crime" },
  { id: "tradition", name: "Religion & Values", low: "Secular Progress", high: "Traditional Values" },
  { id: "environment", name: "Environment", low: "Drill & Mine", high: "Green Agenda" },
  { id: "trade", name: "Trade Policy", low: "Tariffs", high: "Free Trade" },
  { id: "expansion", name: "Foreign Policy", low: "Isolationism", high: "Expansionism" },
  { id: "infrastructure", name: "Public Spending", low: "Austerity", high: "Big Public Works" },
  { id: "authority", name: "Central Power", low: "Local Control", high: "Strong Central State" },
  { id: "settlers", name: "Immigration", low: "Close the Borders", high: "Open Borders" },
  { id: "guns", name: "Gun Rights", low: "Gun Control", high: "Gun Rights" },
  { id: "speech", name: "Free Speech", low: "Censor Hate & Lies", high: "Absolute Free Speech" },
  { id: "drugs", name: "Drug Policy", low: "War on Drugs", high: "Legalize It" },
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
