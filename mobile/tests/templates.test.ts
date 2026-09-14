import { describe, expect, it } from "vitest";
import {
  addExercise,
  fromTemplate,
  move,
  toInput,
  type Draft,
} from "../src/features/templates/draft";
import type { Exercise } from "../src/features/exercises/api";
import type { Template } from "../src/features/templates/api";

const exercise: Exercise = {
  id: "exercise-a",
  name: "Dumbbell Press",
  equipment: "dumbbell",
  load_type: "external",
  load_convention: "per_hand",
  primary_muscle: { id: "chest", name: "Peito", slug: "chest" },
  secondary_muscles: [],
  instructions: null,
  is_custom: false,
  is_favorite: false,
  created_at: "",
  updated_at: "",
};
const form = (): Draft => ({
  name: "Push A",
  exercises: [addExercise(exercise)],
});

describe("planned workout editing", () => {
  it("keeps repeated exercises and their sets independent when reordered or removed", () => {
    const draft = form();
    const second = addExercise(exercise);
    second.sets[0].min = "5";
    second.notes = "Second block";
    draft.exercises.push(second);
    const original = draft.exercises;
    draft.exercises = move(draft.exercises, 1, -1);
    const result = toInput(draft);
    expect(result.exercises?.map((e) => e.notes)).toEqual([
      "Second block",
      null,
    ]);
    expect(original[0].sets[0].min).toBe("8");
    expect(
      new Set(
        draft.exercises.flatMap((e) => [e.key, ...e.sets.map((s) => s.key)]),
      ).size,
    ).toBe(8);
    draft.exercises = draft.exercises.filter((e) => e.key !== second.key);
    expect(toInput(draft).exercises?.[0].sets).toHaveLength(3);
  });

  it("preserves decimal precision, accepts Portuguese commas, and distinguishes zero from unspecified", () => {
    const draft = form();
    draft.exercises[0].sets[0].weight = "12,125";
    draft.exercises[0].sets[1].weight = "0";
    draft.exercises[0].sets[1].rir = "0";
    const sets = toInput(draft).exercises![0].sets;
    expect(sets.map((s) => s.target_weight_kg)).toEqual(["12.125", "0", null]);
    expect(sets.map((s) => s.target_rir)).toEqual([null, 0, null]);
  });

  it.each(["-1", "1e2", "NaN", "Infinity", "2.1234", "100000"])(
    "rejects invalid weight %s without mutating the draft",
    (weight) => {
      const draft = form();
      draft.exercises[0].sets[0].weight = weight;
      const before = JSON.stringify(draft);
      expect(() => toInput(draft)).toThrow(/carga válida/);
      expect(JSON.stringify(draft)).toBe(before);
    },
  );

  it("validates ranges, rest and limits before a request", () => {
    const draft = form();
    draft.exercises[0].rest = "";
    expect(() => toInput(draft)).toThrow(/descanso/);
    draft.exercises[0].rest = "0";
    draft.exercises[0].sets[0].min = "15";
    expect(() => toInput(draft)).toThrow(/repetições máximas/);
    draft.exercises[0].sets[0].max = "15";
    draft.exercises[0].sets[0].rir = "11";
    expect(() => toInput(draft)).toThrow(/RIR/);
    draft.exercises[0].sets = [];
    expect(() => toInput(draft)).toThrow(/1 e 20/);
    expect(toInput({ name: "  Recovery  ", exercises: [] })).toEqual({
      name: "Recovery",
      exercises: [],
    });
  });

  it("keeps archived references and warmup prescriptions when reopening a plan", () => {
    const plan: Template = {
      id: "plan",
      name: "Push",
      version: 2,
      exercise_count: 1,
      set_count: 1,
      created_at: "",
      updated_at: "",
      exercises: [
        {
          id: "entry",
          exercise_id: exercise.id,
          position: 0,
          name: exercise.name,
          load_type: "external",
          load_convention: "per_hand",
          is_archived: true,
          rest_seconds: 0,
          notes: "Slow",
          sets: [
            {
              set_type: "warmup",
              target_reps_min: 10,
              target_reps_max: 12,
              target_weight_kg: "12.125",
              target_rir: 0,
            },
          ],
        },
      ],
    };
    const draft = fromTemplate(plan);
    expect(draft.exercises[0].archived).toBe(true);
    const input = toInput(draft);
    expect(input.exercises?.[0]).toEqual({
      exercise_id: exercise.id,
      rest_seconds: 0,
      notes: "Slow",
      sets: plan.exercises[0].sets,
    });
    expect(input).not.toHaveProperty("version");
    expect(input.exercises?.[0]).not.toHaveProperty("is_archived");
  });

  it("rejects additional weight for bodyweight exercises that do not use it", () => {
    const draft = form();
    draft.exercises[0].convention = "none";
    draft.exercises[0].sets[0].weight = "10";
    expect(() => toInput(draft)).toThrow(/não usa carga adicional/);
    draft.exercises[0].sets[0].weight = "0";
    expect(toInput(draft).exercises![0].sets[0].target_weight_kg).toBe("0");
  });
});
