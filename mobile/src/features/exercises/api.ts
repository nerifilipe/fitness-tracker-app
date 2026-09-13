import type { components } from "../../services/api/schema";
import type { AuthSession } from "../auth/session";

export type Exercise = components["schemas"]["ExerciseResponse"];
export type ExerciseInput = components["schemas"]["ExerciseInput"];
export type ExercisePage = components["schemas"]["ExercisePage"];
export type Muscle = components["schemas"]["MuscleResponse"];
export type Filters = {
  q: string;
  muscle_id: string;
  equipment: string;
  mode: "all" | "favorites" | "custom";
};
export const emptyFilters: Filters = {
  q: "",
  muscle_id: "",
  equipment: "",
  mode: "all",
};

export function exerciseApi(session: AuthSession) {
  return {
    list: (filters: Filters, cursor: string | null, signal?: AbortSignal) => {
      const params = new URLSearchParams({ limit: "20" });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.muscle_id) params.set("muscle_id", filters.muscle_id);
      if (filters.equipment) params.set("equipment", filters.equipment);
      if (filters.mode === "favorites") params.set("favorites_only", "true");
      if (filters.mode === "custom") params.set("custom_only", "true");
      if (cursor) params.set("cursor", cursor);
      return session.authorized<ExercisePage>(`/exercises?${params}`, {
        signal,
      });
    },
    muscles: (signal?: AbortSignal) =>
      session.authorized<Muscle[]>("/exercises/muscle-groups", { signal }),
    detail: (id: string, signal?: AbortSignal) =>
      session.authorized<Exercise>(`/exercises/${id}`, { signal }),
    save: (data: ExerciseInput, id?: string) =>
      session.authorized<Exercise>(id ? `/exercises/${id}` : "/exercises", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(data),
      }),
    favorite: (id: string, value: boolean) =>
      session.authorized<Exercise>(`/exercises/${id}/favorite`, {
        method: "PUT",
        body: JSON.stringify({ is_favorite: value }),
      }),
    archive: (id: string) =>
      session.authorized<void>(`/exercises/${id}`, { method: "DELETE" }),
  };
}

export type ExerciseApi = ReturnType<typeof exerciseApi>;
