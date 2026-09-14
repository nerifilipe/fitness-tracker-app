import type { Workout, Sync } from "./api";
import type { Exercise } from "../exercises/api";

type ServerExercise = Workout["exercises"][number];
export type LiveSet = Omit<
  ServerExercise["sets"][number],
  "weight_kg" | "reps" | "rir"
> & { weight: string; reps: string; rir: string };
export type LiveExercise = Omit<ServerExercise, "sets" | "rest_seconds"> & {
  rest: string;
  sets: LiveSet[];
};
export type LiveWorkout = Omit<Workout, "exercises"> & {
  exercises: LiveExercise[];
};

export function fromServer(workout: Workout): LiveWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map((e) => ({
      ...e,
      rest: String(e.rest_seconds),
      sets: e.sets.map((s) => ({
        ...s,
        weight: s.weight_kg == null ? "" : String(s.weight_kg),
        reps: s.reps == null ? "" : String(s.reps),
        rir: s.rir == null ? "" : String(s.rir),
      })),
    })),
  };
}
function integer(
  value: string,
  min: number,
  max: number,
  label: string,
): number | null {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value.trim()) || Number(value) < min || Number(value) > max)
    throw new Error(`${label}: usa um inteiro entre ${min} e ${max}.`);
  return Number(value);
}
export function setInput(
  set: LiveSet,
  convention: LiveExercise["load_convention_snapshot"],
) {
  const weight = set.weight.trim().replace(",", ".");
  if (
    weight &&
    (!/^\d{1,5}(\.\d{1,3})?$/.test(weight) || Number(weight) > 99999.999)
  )
    throw new Error(
      "A carga deve ser positiva ou zero, com até 3 casas decimais.",
    );
  if (convention === "none" && weight && Number(weight) !== 0)
    throw new Error("Este exercício não usa carga adicional.");
  const result = {
    id: set.id,
    set_type: set.set_type,
    weight_kg: weight || null,
    reps: integer(set.reps, 1, 999, "Repetições"),
    rir: integer(set.rir, 0, 10, "RIR"),
    completed_at: set.completed_at ?? null,
  };
  if (
    result.completed_at &&
    (result.weight_kg === null || result.reps === null)
  )
    throw new Error(
      "Preenche a carga e as repetições antes de concluir a série (usa 0 quando não há carga).",
    );
  return result;
}
export function toSync(
  workout: LiveWorkout,
  version: number,
  mutationId: string,
): Sync {
  return {
    version,
    mutation_id: mutationId,
    status: workout.status,
    paused_at: workout.paused_at,
    paused_seconds: workout.paused_seconds,
    finished_at: workout.finished_at,
    rest_deadline: workout.rest_deadline,
    notes: workout.notes,
    exercises: workout.exercises.map((e) => {
      const rest = integer(e.rest, 0, 3600, "Descanso");
      if (rest === null)
        throw new Error("Preenche o descanso em segundos (0–3600).");
      return {
        id: e.id,
        exercise_id: e.exercise_id,
        rest_seconds: rest,
        notes: e.notes,
        sets: e.sets.map((s) => setInput(s, e.load_convention_snapshot)),
      };
    }),
  };
}
export function elapsed(workout: LiveWorkout, now: number): number {
  const end = Date.parse(workout.finished_at ?? workout.paused_at ?? "") || now;
  return Math.max(
    0,
    Math.floor((end - Date.parse(workout.started_at)) / 1000) -
      workout.paused_seconds,
  );
}
export function remaining(deadline: string | null, now: number): number {
  return deadline
    ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
    : 0;
}
export function clockText(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function togglePause(workout: LiveWorkout, now: number): LiveWorkout {
  if (workout.status === "active")
    return {
      ...workout,
      status: "paused",
      paused_at: new Date(now).toISOString(),
    };
  if (workout.status !== "paused") return workout;
  return {
    ...workout,
    status: "active",
    paused_at: null,
    paused_seconds:
      workout.paused_seconds +
      Math.max(0, Math.floor((now - Date.parse(workout.paused_at!)) / 1000)),
  };
}
export function cancelWorkout(workout: LiveWorkout, now: number): LiveWorkout {
  const resumed =
    workout.status === "paused" ? togglePause(workout, now) : workout;
  const cancelled: LiveWorkout = {
    ...resumed,
    status: "cancelled",
    finished_at: new Date(now).toISOString(),
    rest_deadline: null,
  };
  toSync(cancelled, cancelled.version, "validation-only");
  return cancelled;
}
export function finishWorkout(workout: LiveWorkout, now: number): LiveWorkout {
  if (!["active", "paused"].includes(workout.status)) return workout;
  if (!workout.exercises.some((e) => e.sets.some((s) => s.completed_at)))
    throw new Error(
      "Conclui pelo menos uma série antes de finalizar o treino.",
    );
  const finished: LiveWorkout = {
    ...cancelWorkout(workout, now),
    status: "completed",
  };
  toSync(finished, finished.version, "validation-only");
  return finished;
}
export function toggleSet(
  workout: LiveWorkout,
  exerciseId: string,
  setId: string,
  now: number,
): LiveWorkout {
  if (workout.status !== "active")
    throw new Error("Retoma o treino antes de concluir uma série.");
  const exercise = workout.exercises.find((e) => e.id === exerciseId)!;
  const set = exercise.sets.find((s) => s.id === setId)!;
  const complete = !set.completed_at;
  const next = {
    ...set,
    completed_at: complete ? new Date(now).toISOString() : null,
  };
  setInput(next, exercise.load_convention_snapshot);
  const rest = integer(exercise.rest, 0, 3600, "Descanso");
  if (rest === null) throw new Error("Preenche o descanso antes de concluir.");
  return {
    ...workout,
    rest_deadline:
      complete && rest > 0 ? new Date(now + rest * 1000).toISOString() : null,
    exercises: workout.exercises.map((e) =>
      e.id !== exerciseId
        ? e
        : { ...e, sets: e.sets.map((s) => (s.id === setId ? next : s)) },
    ),
  };
}
export function freshSet(
  id: () => string,
  convention: LiveExercise["load_convention_snapshot"],
): LiveSet {
  return {
    id: id(),
    set_type: "working",
    reps: "",
    weight: convention === "none" ? "0" : "",
    rir: "",
    completed_at: null,
  };
}
export function freshExercise(
  exercise: Exercise,
  id: () => string,
): LiveExercise {
  return {
    id: id(),
    exercise_id: exercise.id,
    name_snapshot: exercise.name,
    load_type_snapshot: exercise.load_type,
    load_convention_snapshot: exercise.load_convention,
    rest: "90",
    notes: null,
    sets: [freshSet(id, exercise.load_convention)],
  };
}
