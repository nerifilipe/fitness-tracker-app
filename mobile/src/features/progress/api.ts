import type { components } from "../../services/api/schema";
import type { AuthSession } from "../auth/session";

export type Measurement = components["schemas"]["MeasurementResponse"];
export type MeasurementInput = components["schemas"]["MeasurementInput"];
export type ProgressSummary = components["schemas"]["ProgressSummary"];
export type MeasurementPage = components["schemas"]["MeasurementPage"];
export type Metric =
  "weight_kg" | "waist_cm" | "chest_cm" | "arms_cm" | "legs_cm";
export type Units = "metric" | "imperial";

export function progressApi(session: AuthSession) {
  return {
    summary: (days: number, signal?: AbortSignal) =>
      session.authorized<ProgressSummary>(`/progress/summary?days=${days}`, {
        signal,
      }),
    history: (before: string | null, signal?: AbortSignal) =>
      session.authorized<MeasurementPage>(
        `/progress/measurements?limit=20${before ? `&before=${encodeURIComponent(before)}` : ""}`,
        { signal },
      ),
    detail: (day: string, signal?: AbortSignal) =>
      session.authorized<Measurement | null>(
        `/progress/measurements/${encodeURIComponent(day)}`,
        { signal },
      ),
    save: (day: string, data: MeasurementInput) =>
      session.authorized<Measurement>(
        `/progress/measurements/${encodeURIComponent(day)}`,
        { method: "PUT", body: JSON.stringify(data) },
      ),
    remove: (day: string) =>
      session.authorized<void>(
        `/progress/measurements/${encodeURIComponent(day)}`,
        { method: "DELETE" },
      ),
  };
}
