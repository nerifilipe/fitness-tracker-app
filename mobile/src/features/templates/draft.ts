import type { Exercise } from "../exercises/api";
import type { Template, TemplateInput } from "./api";

let sequence = 0;
export const newKey = () => `draft-${++sequence}`;
export type DraftSet = {
  key: string;
  type: "warmup" | "working";
  min: string;
  max: string;
  weight: string;
  rir: string;
};
export type DraftExercise = {
  key: string;
  exerciseId: string;
  name: string;
  convention: Exercise["load_convention"];
  archived: boolean;
  rest: string;
  notes: string;
  sets: DraftSet[];
};
export type Draft = { name: string; exercises: DraftExercise[] };
export const blankSet = (): DraftSet => ({
  key: newKey(),
  type: "working",
  min: "8",
  max: "12",
  weight: "",
  rir: "",
});
export function addExercise(exercise: Exercise): DraftExercise {
  return {
    key: newKey(),
    exerciseId: exercise.id,
    name: exercise.name,
    convention: exercise.load_convention,
    archived: false,
    rest: "90",
    notes: "",
    sets: [blankSet(), blankSet(), blankSet()],
  };
}
export function fromTemplate(template: Template): Draft {
  return {
    name: template.name,
    exercises: template.exercises.map((e) => ({
      key: newKey(),
      exerciseId: e.exercise_id,
      name: e.name,
      convention: e.load_convention,
      archived: e.is_archived,
      rest: String(e.rest_seconds),
      notes: e.notes ?? "",
      sets: e.sets.map((s) => ({
        key: newKey(),
        type: s.set_type ?? "working",
        min: String(s.target_reps_min),
        max: String(s.target_reps_max),
        weight: s.target_weight_kg == null ? "" : String(s.target_weight_kg),
        rir: s.target_rir == null ? "" : String(s.target_rir),
      })),
    })),
  };
}
export function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
function integer(
  text: string,
  min: number,
  max: number,
  label: string,
): number {
  if (!/^\d+$/.test(text.trim()) || Number(text) < min || Number(text) > max)
    throw new Error(
      `${label}: indica um número inteiro entre ${min} e ${max}.`,
    );
  return Number(text);
}
export function toInput(draft: Draft): TemplateInput {
  if (!draft.name.trim() || draft.name.trim().length > 120)
    throw new Error("Indica um nome para o plano (até 120 caracteres).");
  if (draft.exercises.length > 40)
    throw new Error("O plano pode ter até 40 exercícios.");
  return {
    name: draft.name.trim(),
    exercises: draft.exercises.map((e, i) => {
      const label = `Exercício ${i + 1} (${e.name})`;
      if (!e.sets.length || e.sets.length > 20)
        throw new Error(`${label}: adiciona entre 1 e 20 séries.`);
      if (e.notes.length > 2000)
        throw new Error(`${label}: as notas podem ter até 2000 caracteres.`);
      return {
        exercise_id: e.exerciseId,
        rest_seconds: integer(e.rest, 0, 3600, `${label}, descanso`),
        notes: e.notes.trim() || null,
        sets: e.sets.map((s, j) => {
          const field = `${label}, série ${j + 1}`;
          const min = integer(s.min, 1, 999, `${field}, repetições mínimas`);
          const max = integer(s.max, min, 999, `${field}, repetições máximas`);
          const weight = s.weight.trim().replace(",", ".");
          if (
            weight &&
            (!/^\d{1,5}(\.\d{1,3})?$/.test(weight) ||
              Number(weight) > 99999.999)
          )
            throw new Error(
              `${field}: indica uma carga válida em kg, com até 3 casas decimais.`,
            );
          if (e.convention === "none" && weight && Number(weight) !== 0)
            throw new Error(
              `${field}: este exercício não usa carga adicional.`,
            );
          return {
            set_type: s.type,
            target_reps_min: min,
            target_reps_max: max,
            target_weight_kg: weight || null,
            target_rir: s.rir.trim()
              ? integer(s.rir, 0, 10, `${field}, RIR`)
              : null,
          };
        }),
      };
    }),
  };
}
