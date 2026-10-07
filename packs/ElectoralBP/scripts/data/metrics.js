// Performance sliders (0..100, 50 = neutral). Each metric is tied to issues, so a
// bloc that cares about Labor automatically cares about the Jobs slider.

export const METRICS = [
  { id: "economy", name: "Economy & Wealth", issues: { economy: 1, trade: 0.6, labor: 0.3 } },
  { id: "jobs", name: "Jobs & Wages", issues: { labor: 1, welfare: 0.5, economy: 0.4 } },
  { id: "security", name: "Security & Defense", issues: { military: 1, order: 0.5, expansion: 0.3 } },
  { id: "stability", name: "Order & Stability", issues: { order: 1, authority: 0.5, tradition: 0.3 } },
  { id: "infrastructure", name: "Infrastructure", issues: { infrastructure: 1, settlers: 0.3 } },
  { id: "diplomacy", name: "Foreign Relations", issues: { trade: 0.6, military: 0.4, expansion: 0.4 } },
  { id: "services", name: "Public Services", issues: { welfare: 1, infrastructure: 0.3 } },
  { id: "food", name: "Food & Harvest", issues: { environment: 0.6, trade: 0.4 }, base: 0.25 },
  { id: "integrity", name: "Honesty & Integrity", issues: {}, base: 0.45 },
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
