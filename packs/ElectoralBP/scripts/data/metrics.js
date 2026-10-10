// Performance sliders for whoever currently holds office (0..100, 50 = average).
// Each one is tied to issues, so voters who care about Labor watch the Jobs slider.

export const METRICS = [
  { id: "economy", name: "Economy", issues: { economy: 1, trade: 0.6 } },
  { id: "jobs", name: "Jobs & Wages", issues: { labor: 1, welfare: 0.4, economy: 0.3 } },
  { id: "security", name: "Safety & Defense", issues: { military: 1, order: 0.6, expansion: 0.3, guns: 0.3 } },
  { id: "services", name: "Public Services", issues: { welfare: 1, infrastructure: 0.8, settlers: 0.2 } },
  { id: "food", name: "Food & Land", issues: { environment: 0.8, trade: 0.3 }, base: 0.2 },
  { id: "integrity", name: "Honesty & Freedoms", issues: { authority: 0.3, speech: 0.4 }, base: 0.45 },
];

export const METRIC_IDS = METRICS.map((m) => m.id);
export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export function defaultMetrics() {
  return Object.fromEntries(METRIC_IDS.map((id) => [id, 50]));
}

export function gradeMetric(v) {
  if (v >= 85) return "§aExcellent";
  if (v >= 65) return "§2Good";
  if (v >= 45) return "§eFair";
  if (v >= 25) return "§6Poor";
  return "§cFailing";
}
