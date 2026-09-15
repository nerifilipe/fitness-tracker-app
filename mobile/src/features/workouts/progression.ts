import type { StrengthSession } from "../progress/strengthApi";
import type { LiveExercise, LiveSet } from "./draft";

type Target = { weight: string; reps: string };
export type Progression = {
  kind: "repeat" | "reps" | "load";
  reason: string;
  targets: Target[];
  source: StrengthSession;
};
export type AppliedSet = {
  id: string;
  before: Pick<LiveSet, "weight" | "reps" | "rir">;
  after: Pick<LiveSet, "weight" | "reps" | "rir">;
};
const DAY = 86_400_000;
const load = (value: number) => String(Number(value.toFixed(3)));
const recent = (session: StrengthSession, now: number) => {
  const age = now - Date.parse(session.started_at);
  return age >= 0 && age <= 28 * DAY;
};
const uniform = (session: StrengthSession) =>
  session.sets.length >= 2 &&
  session.sets.every(
    (s) =>
      s.weight_kg === session.sets[0].weight_kg &&
      s.reps === session.sets[0].reps,
  );

// Product rule v1: use recorded effort, never infer it from an estimated 1RM.
export function suggestProgression(
  exercise: LiveExercise,
  sessions: StrengthSession[],
  workoutStartedAt: string,
  incrementKg: number,
  now = Date.now(),
): Progression | null {
  const [latest, previous] = sessions.filter(
    (s) => Date.parse(s.started_at) < Date.parse(workoutStartedAt),
  );
  if (!latest?.sets.length) return null;
  const targets = latest.sets.map((s) => ({
    weight: load(s.weight_kg),
    reps: String(s.reps),
  }));
  const repeat = (reason: string): Progression => ({
    kind: "repeat",
    reason,
    targets,
    source: latest,
  });
  if (!recent(latest, now))
    return repeat(
      "O último registo tem mais de 28 dias. Usa-o como referência e ajusta à forma de hoje.",
    );
  if (exercise.load_type_snapshot === "assisted")
    return repeat(
      "Repete a assistência registada. Mais assistência não significa maior esforço.",
    );
  if (
    exercise.sets.filter((s) => s.set_type === "working").length !==
    latest.sets.length
  )
    return repeat(
      "O número de séries é diferente. Recupera os valores correspondentes e ajusta as restantes.",
    );
  if (!uniform(latest))
    return repeat(
      "As cargas ou repetições variaram. Mantém a referência de cada série.",
    );
  if (latest.sets.some((s) => s.rir == null))
    return repeat(
      "Falta o RIR da última sessão. Repete os valores e regista o esforço de hoje se quiseres sugestões de progressão.",
    );
  if (latest.sets.some((s) => s.rir! < 2))
    return repeat(
      "Na última sessão houve séries com menos de 2 repetições em reserva. A sugestão é manter.",
    );
  const first = latest.sets[0];
  const canAddLoad =
    exercise.load_type_snapshot === "external" &&
    first.weight_kg > 0 &&
    Number.isFinite(incrementKg) &&
    incrementKg > 0 &&
    incrementKg <= first.weight_kg * 0.05 &&
    first.weight_kg + incrementKg <= 99999.999 &&
    previous &&
    recent(previous, now) &&
    uniform(previous) &&
    previous.sets.length === latest.sets.length &&
    previous.sets.every(
      (s) =>
        s.weight_kg === first.weight_kg &&
        s.reps === first.reps &&
        s.rir != null &&
        s.rir >= 3,
    ) &&
    latest.sets.every((s) => s.rir! >= 3);
  if (canAddLoad)
    return {
      kind: "load",
      reason:
        "Duas sessões recentes com as mesmas séries, carga e reps, todas com RIR ≥ 3. Experimenta o incremento escolhido, mantendo as reps.",
      targets: targets.map((s) => ({
        ...s,
        weight: load(first.weight_kg + incrementKg),
      })),
      source: latest,
    };
  if (first.reps >= 999)
    return repeat("Já atingiste o limite de repetições do registo.");
  return {
    kind: "reps",
    reason:
      "Todas as séries tiveram pelo menos 2 repetições em reserva. Experimenta mais 1 repetição por série, mantendo a carga.",
    targets: targets.map((s) => ({ ...s, reps: String(first.reps + 1) })),
    source: latest,
  };
}

export function progressionChanges(
  exercise: LiveExercise,
  suggestion: Progression,
): AppliedSet[] {
  let ordinal = 0;
  return exercise.sets.flatMap((set) => {
    if (set.set_type !== "working") return [];
    const target = suggestion.targets[ordinal++];
    if (!target || set.completed_at) return [];
    const after = { ...target, rir: "" };
    if (
      set.weight === after.weight &&
      set.reps === after.reps &&
      set.rir === after.rir
    )
      return [];
    return [
      {
        id: set.id,
        before: { weight: set.weight, reps: set.reps, rir: set.rir },
        after,
      },
    ];
  });
}

// Compare the preview with the current draft; never replace later edits or completed sets.
export function applyProgression(
  exercise: LiveExercise,
  changes: AppliedSet[],
  undo = false,
): LiveExercise {
  return {
    ...exercise,
    sets: exercise.sets.map((set) => {
      const change = changes.find((item) => item.id === set.id);
      if (!change || set.completed_at || set.set_type !== "working") return set;
      const expected = undo ? change.after : change.before;
      if (
        set.weight !== expected.weight ||
        set.reps !== expected.reps ||
        set.rir !== expected.rir
      )
        return set;
      return { ...set, ...(undo ? change.before : change.after) };
    }),
  };
}
