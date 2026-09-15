import type { components } from "../../services/api/schema";
import type { AuthSession } from "../auth/session";

export type StrengthOverview = components["schemas"]["StrengthOverview"];
export type StrengthSession = components["schemas"]["StrengthSession"];
export type StrengthGroup = components["schemas"]["StrengthGroup"];
export type StrengthBest = components["schemas"]["StrengthBest"];
export type StrengthExercisePage =
  components["schemas"]["StrengthExercisePage"];
export type StrengthSessionPage = components["schemas"]["StrengthSessionPage"];

export function strengthApi(session: AuthSession) {
  return {
    exercises: (q: string, cursor: string | null, signal?: AbortSignal) =>
      session.authorized<StrengthExercisePage>(
        `/progress/strength/exercises?${new URLSearchParams({ q, limit: "20", ...(cursor ? { cursor } : {}) })}`,
        { signal },
      ),
    overview: (
      id: string,
      days: number,
      group: StrengthGroup | null,
      signal?: AbortSignal,
    ) =>
      session.authorized<StrengthOverview>(
        `/progress/strength/${id}?${new URLSearchParams({ days: String(days), ...(group ?? {}) })}`,
        { signal },
      ),
    history: (
      id: string,
      group: StrengthGroup,
      cursor: string | null,
      signal?: AbortSignal,
    ) =>
      session.authorized<StrengthSessionPage>(
        `/progress/strength/${id}/sessions?${new URLSearchParams({ ...group, limit: "20", ...(cursor ? { cursor } : {}) })}`,
        { signal },
      ),
  };
}
