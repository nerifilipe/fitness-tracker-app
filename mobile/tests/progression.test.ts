import { describe, expect, it } from "vitest";
import type { AuthSession } from "../src/features/auth/session";
import {
  strengthApi,
  type StrengthSession,
} from "../src/features/progress/strengthApi";
import type { LiveExercise } from "../src/features/workouts/draft";
import {
  applyProgression,
  progressionChanges,
  suggestProgression,
} from "../src/features/workouts/progression";

const now = Date.parse("2026-09-15T12:00:00Z");
const started = new Date(now).toISOString();
function exercise(values: Partial<LiveExercise> = {}): LiveExercise {
  return {
    id: "block",
    exercise_id: "exercise",
    name_snapshot: "Press",
    load_type_snapshot: "external",
    load_convention_snapshot: "total",
    rest: "90",
    notes: null,
    sets: [0, 1, 2].map((i) => ({
      id: `set-${i}`,
      set_type: "working",
      weight: "40",
      reps: "8",
      rir: "",
      completed_at: null,
    })),
    ...values,
  };
}
function session(
  days = 2,
  values: Partial<StrengthSession> = {},
): StrengthSession {
  return {
    workout_id: `workout-${days}`,
    workout_name: "Push",
    started_at: new Date(now - days * 86400000).toISOString(),
    completed_sets: 3,
    total_reps: 24,
    max_weight_kg: 40,
    volume_kg: 960,
    estimated_1rm: 50.67,
    sets: [0, 1, 2].map(() => ({ weight_kg: 40, reps: 8, rir: 3 })),
    ...values,
  };
}
const suggest = (history: StrengthSession[], e = exercise(), increment = 1) =>
  suggestProgression(e, history, started, increment, now);

describe("progression decisions", () => {
  it("requires prior history and never uses the current or a future workout", () => {
    expect(suggest([])).toBeNull();
    expect(suggest([session(0), session(-1)])).toBeNull();
    expect(suggest([session(0), session(2)])?.source.workout_id).toBe(
      "workout-2",
    );
  });
  it("adds reps with recorded reserve and requires two consistent sessions to add load", () => {
    expect(suggest([session()])?.targets[0]).toEqual({
      weight: "40",
      reps: "9",
    });
    expect(suggest([session(), session(5)])?.targets[0]).toEqual({
      weight: "41",
      reps: "8",
    });
    expect(suggest([session(), session(5)])?.kind).toBe("load");
  });
  it("uses the weakest recorded RIR and does not infer effort from records", () => {
    for (const rir of [null, 0, 1]) {
      const last = session();
      last.sets[1].rir = rir;
      expect(suggest([last, session(5)])?.kind).toBe("repeat");
    }
    const last = session();
    last.sets[1].rir = 2;
    expect(suggest([last, session(5)])?.kind).toBe("reps");
    const older = session(5);
    older.sets[1].rir = null;
    expect(suggest([session(), older])?.kind).toBe("reps");
  });
  it("does not increase from old history, or from inconsistent volumes/loads", () => {
    expect(suggest([session(29)])?.kind).toBe("repeat");
    expect(suggest([session(), session(29)])?.kind).toBe("reps");
    const varied = session();
    varied.sets[1].weight_kg = 35;
    expect(suggest([varied])?.targets[1].weight).toBe("35");
    expect(suggest([varied])?.kind).toBe("repeat");
    expect(
      suggest([session()], exercise({ sets: exercise().sets.slice(0, 2) }))
        ?.kind,
    ).toBe("repeat");
    expect(suggest([session(), varied])?.kind).toBe("reps");
  });
  it("limits the increase to 5 percent and preserves decimal/per-hand loads", () => {
    expect(suggest([session(), session(5)], exercise(), 2)?.kind).toBe("load");
    for (const increment of [2.5, 0, -1, NaN, Infinity])
      expect(
        suggest([session(), session(5)], exercise(), increment)?.kind,
      ).toBe("reps");
    const perHand = exercise({ load_convention_snapshot: "per_hand" });
    const history = [session(), session(5)].map((s) => ({
      ...s,
      sets: s.sets.map((set) => ({ ...set, weight_kg: 20.125 })),
    }));
    expect(suggest(history, perHand)?.targets[0]).toEqual({
      weight: "21.125",
      reps: "8",
    });
  });
  it("keeps assistance unchanged, and progresses bodyweight only through reps", () => {
    expect(
      suggest(
        [session(), session(5)],
        exercise({
          load_type_snapshot: "assisted",
          load_convention_snapshot: "assistance",
        }),
      )?.kind,
    ).toBe("repeat");
    const body = exercise({
      load_type_snapshot: "bodyweight",
      load_convention_snapshot: "none",
    });
    const history = [session(), session(5)].map((s) => ({
      ...s,
      sets: s.sets.map((set) => ({ ...set, weight_kg: 0 })),
    }));
    expect(suggest(history, body)?.targets[0]).toEqual({
      weight: "0",
      reps: "9",
    });
  });
  it("does not exceed the repetition input limit", () => {
    const last = session();
    last.sets.forEach((s) => {
      s.reps = 999;
    });
    expect(suggest([last])?.kind).toBe("repeat");
  });
});

describe("applying a suggestion", () => {
  it("keeps working-set ordinals, completed sets, warmups and unpaired extra sets", () => {
    const e = exercise();
    e.sets[0].completed_at = started;
    e.sets[1].rir = "7";
    e.sets.unshift({
      ...e.sets[1],
      id: "warmup",
      set_type: "warmup",
      weight: "10",
    });
    e.sets.push({ ...e.sets[1], id: "extra", weight: "" });
    const recommendation = suggest([session()])!;
    recommendation.targets[1].weight = "20.125";
    const changes = progressionChanges(e, recommendation);
    expect(changes.map((c) => c.id)).toEqual(["set-1", "set-2"]);
    const result = applyProgression(e, changes);
    expect(result.sets[0]).toEqual(e.sets[0]);
    expect(result.sets[1]).toEqual(e.sets[1]);
    expect(result.sets[2]).toMatchObject({
      weight: "20.125",
      reps: "9",
      rir: "",
      completed_at: null,
    });
    expect(result.sets[4]).toEqual(e.sets[4]);
    expect(progressionChanges(result, recommendation)).toEqual([]);
    expect(applyProgression(result, changes, true)).toEqual(e);
  });
  it("does not overwrite edits/completions made after preview, including when undoing", () => {
    const e = exercise();
    const changes = progressionChanges(e, suggest([session()])!);
    const changed = structuredClone(e);
    changed.sets[0].weight = "42";
    changed.sets[1].completed_at = started;
    const result = applyProgression(changed, changes);
    expect(result.sets[0].weight).toBe("42");
    expect(result.sets[1].reps).toBe("8");
    expect(result.sets[2].reps).toBe("9");
    result.sets[2].rir = "1";
    expect(applyProgression(result, changes, true)).toEqual(result);
  });
  it("fetches only two sessions with the current exercise and exact convention", async () => {
    const paths: string[] = [];
    const auth = {
      authorized: async (path: string) => {
        paths.push(path);
        return {};
      },
    } as unknown as AuthSession;
    await strengthApi(auth).recent("exercise", {
      load_type: "external",
      load_convention: "per_hand",
    });
    expect(paths).toEqual([
      "/progress/strength/exercise/sessions?load_type=external&load_convention=per_hand&limit=2",
    ]);
  });
});
