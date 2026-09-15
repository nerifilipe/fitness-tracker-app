import { describe, expect, it } from "vitest";
import type { AuthSession } from "../src/features/auth/session";
import {
  strengthApi,
  type StrengthSession,
} from "../src/features/progress/strengthApi";
import {
  groupKey,
  loadText,
  sessionComparison,
} from "../src/features/progress/strengthHelpers";

function row(values: Partial<StrengthSession> = {}): StrengthSession {
  return {
    workout_id: "test",
    workout_name: "Push",
    started_at: "2026-09-15T12:00:00Z",
    completed_sets: 3,
    total_reps: 24,
    max_weight_kg: 20,
    estimated_1rm: 25.33,
    volume_kg: 480,
    sets: [],
    ...values,
  };
}

describe("exercise strength", () => {
  it("compares last to previous and preserves absent 1RM", () => {
    const diff = sessionComparison(
      row({
        max_weight_kg: 22,
        completed_sets: 2,
        total_reps: 16,
        estimated_1rm: 27.87,
      }),
      row(),
    );
    expect(diff.max_weight_kg).toBe(2);
    expect(diff.total_reps).toBe(-8);
    expect(diff.completed_sets).toBe(-1);
    expect(diff.estimated_1rm).toBeCloseTo(2.54);
    expect(
      sessionComparison(row({ estimated_1rm: null }), row()).estimated_1rm,
    ).toBeNull();
  });
  it("keeps load groups separate and displays profile units", () => {
    expect(
      groupKey({ load_type: "external", load_convention: "per_hand" }),
    ).not.toBe(groupKey({ load_type: "external", load_convention: "total" }));
    expect(loadText(0.45359237, "imperial")).toBe("1 lb");
    expect(loadText(20.125, "metric")).toBe("20,125 kg");
  });
  it("retains the selected group and escapes search/cursor parameters", async () => {
    const paths: string[] = [];
    const session = {
      authorized: async (path: string) => {
        paths.push(path);
        return {};
      },
    } as unknown as AuthSession;
    const api = strengthApi(session);
    const group = {
      load_type: "external",
      load_convention: "per_hand",
    } as const;
    await api.overview("exercise", 90, group);
    await api.history("exercise", group, "a+b/=");
    await api.exercises("Press & Row", null);
    expect(paths[0]).toContain("load_convention=per_hand");
    expect(paths[1]).toContain("load_type=external");
    expect(paths[1]).toContain("cursor=a%2Bb%2F%3D");
    expect(paths[2]).toContain("q=Press+%26+Row");
  });
});
