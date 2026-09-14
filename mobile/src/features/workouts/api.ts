import type { components } from "../../services/api/schema";
import type { AuthSession } from "../auth/session";

export type Workout = components["schemas"]["WorkoutResponse"];
export type Start = components["schemas"]["WorkoutStart"];
export type Sync = components["schemas"]["WorkoutSync"];
export type SyncResult = components["schemas"]["WorkoutSyncResponse"];
export type WorkoutApi = ReturnType<typeof workoutApi>;
export function workoutApi(session: AuthSession) {
  return {
    start: (data: Start) =>
      session.authorized<Workout>("/workouts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    active: () => session.authorized<Workout | null>("/workouts/active"),
    detail: (id: string) => session.authorized<Workout>(`/workouts/${id}`),
    sync: (id: string, data: Sync) =>
      session.authorized<SyncResult>(`/workouts/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  };
}
