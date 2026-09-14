import type { components } from "../../services/api/schema";
import type { AuthSession } from "../auth/session";

export type Summary = components["schemas"]["WorkoutSummary"];
export type Report = components["schemas"]["WorkoutReport"];
export type Dashboard = components["schemas"]["Dashboard"];
export type HistoryPage = components["schemas"]["HistoryPage"];
export type Dates = { from: string; to: string };
export function reportsApi(session: AuthSession) {
  return {
    history: (dates: Dates, cursor: string | null, signal?: AbortSignal) => {
      const params = new URLSearchParams({ limit: "20" });
      if (dates.from) params.set("date_from", dates.from);
      if (dates.to) params.set("date_to", dates.to);
      if (cursor) params.set("cursor", cursor);
      return session.authorized<HistoryPage>(`/workouts/history?${params}`, {
        signal,
      });
    },
    report: (id: string, signal?: AbortSignal) =>
      session.authorized<Report>(`/workouts/${id}/summary`, { signal }),
    dashboard: (signal?: AbortSignal) =>
      session.authorized<Dashboard>("/workouts/dashboard", { signal }),
  };
}

export function validateDates(dates: Dates) {
  for (const value of [dates.from, dates.to]) {
    if (!value) continue;
    const parsed = new Date(`${value}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number(value.slice(0, 4)) < 1900 ||
      Number(value.slice(0, 4)) > 9998 ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      throw new Error("Usa datas válidas no formato AAAA-MM-DD (1900–9998).");
  }
  if (dates.from && dates.to && dates.from > dates.to)
    throw new Error("A data inicial deve ser anterior ou igual à data final.");
}
