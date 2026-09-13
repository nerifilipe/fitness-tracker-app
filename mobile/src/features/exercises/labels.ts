import type { ExerciseInput } from "./api";

export const equipmentLabels: Record<ExerciseInput["equipment"], string> = {
  barbell: "Barra",
  dumbbell: "Halteres",
  machine: "Máquina",
  cable: "Cabo",
  bodyweight: "Peso corporal",
  band: "Elástico",
  kettlebell: "Kettlebell",
  other: "Outro",
};
export const loadLabels: Record<ExerciseInput["load_type"], string> = {
  external: "Carga externa",
  bodyweight: "Peso corporal",
  assisted: "Com assistência",
};
export const conventionLabels: Record<
  ExerciseInput["load_convention"],
  string
> = {
  total: "Carga total",
  per_hand: "Carga por mão",
  none: "Sem carga externa",
  added: "Apenas carga adicional",
  assistance: "Peso da assistência",
};
export const conventions: Record<
  ExerciseInput["load_type"],
  ExerciseInput["load_convention"][]
> = {
  external: ["total", "per_hand"],
  bodyweight: ["none", "added"],
  assisted: ["assistance"],
};
export const choices = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
