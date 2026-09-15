import { conventionLabels, loadLabels } from "../exercises/labels";
import { displayValue } from "./helpers";
import type { Units } from "./api";
import type { StrengthGroup, StrengthSession } from "./strengthApi";

export const groupKey = (group: StrengthGroup) =>
  `${group.load_type}:${group.load_convention}`;
export const groupLabel = (group: StrengthGroup) =>
  `${loadLabels[group.load_type]} · ${conventionLabels[group.load_convention]}`;
export const loadText = (value: number, units: Units) =>
  `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 3 }).format(displayValue(value, "weight_kg", units))} ${units === "metric" ? "kg" : "lb"}`;
export function sessionDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function sessionComparison(
  latest: StrengthSession,
  previous: StrengthSession,
) {
  return {
    estimated_1rm:
      latest.estimated_1rm == null || previous.estimated_1rm == null
        ? null
        : latest.estimated_1rm - previous.estimated_1rm,
    max_weight_kg: latest.max_weight_kg - previous.max_weight_kg,
    total_reps: latest.total_reps - previous.total_reps,
    completed_sets: latest.completed_sets - previous.completed_sets,
  };
}
