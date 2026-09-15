import { describe, expect, it } from "vitest";
import {
  displayValue,
  initialForm,
  parseForm,
  plotPoints,
  validDay,
} from "../src/features/progress/helpers";
import type { Measurement } from "../src/features/progress/api";

describe("body measurements", () => {
  it("accepts decimal commas, optional measurements and notes", () => {
    const form = initialForm(null, "metric");
    form.weight_kg = "72,345";
    form.waist_cm = "80,5";
    form.notes = " morning ";
    expect(parseForm(form, null, "metric")).toEqual({
      weight_kg: 72.345,
      waist_cm: 80.5,
      chest_cm: null,
      arms_cm: null,
      legs_cm: null,
      notes: "morning",
    });
  });
  it("does not treat absent or invalid values as zero", () => {
    expect(() =>
      parseForm(initialForm(null, "metric"), null, "metric"),
    ).toThrow();
    for (const value of [
      "0",
      "-5",
      "500.001",
      "1e2",
      "NaN",
      "80kg",
      "72.3456",
    ]) {
      expect(() =>
        parseForm(
          { ...initialForm(null, "metric"), weight_kg: value },
          null,
          "metric",
        ),
      ).toThrow();
    }
    expect(
      parseForm(
        { ...initialForm(null, "metric"), arms_cm: "35" },
        null,
        "metric",
      ).weight_kg,
    ).toBeNull();
  });
  it("converts pounds and inches, preserving unedited canonical values", () => {
    const form = {
      ...initialForm(null, "imperial"),
      weight_kg: "160",
      waist_cm: "32",
    };
    const saved = parseForm(form, null, "imperial");
    expect(saved.weight_kg).toBe(72.575);
    expect(saved.waist_cm).toBe(81.28);
    expect(displayValue(2.54, "waist_cm", "imperial")).toBe(1);
    const record: Measurement = {
      ...saved,
      weight_kg: 72.346,
      date: "2026-09-15",
      created_at: "2026-09-15T12:00:00Z",
      updated_at: "2026-09-15T12:00:00Z",
    };
    expect(
      parseForm(initialForm(record, "imperial"), record, "imperial").weight_kg,
    ).toBe(72.346);
  });
  it("validates leap dates and rejects future dates", () => {
    expect(validDay("2024-02-29", "2026-09-15")).toBe(true);
    for (const day of ["2026-02-29", "2026-09-16", "1899-12-31", "2026-2-01"])
      expect(validDay(day, "2026-09-15")).toBe(false);
  });
});

describe("progress chart", () => {
  it("uses actual elapsed days rather than equally spacing sparse records", () => {
    const graph = plotPoints(
      [
        { date: "2026-09-11", value: 70 },
        { date: "2026-09-01", value: 72 },
        { date: "2026-09-02", value: 71 },
      ],
      124,
      180,
    );
    expect(graph.points.map((point) => point.x)).toEqual([12, 22, 112]);
    expect(graph.points[0].y).toBeLessThan(graph.points[2].y);
  });
  it("handles empty, single and flat series without dividing by zero", () => {
    expect(plotPoints([], 300, 180).points).toEqual([]);
    const single = plotPoints([{ date: "2026-09-01", value: 72 }], 300, 180);
    expect(single.points[0].x).toBe(150);
    expect(single.points[0].y).toBe(90);
    const flat = plotPoints(
      [
        { date: "2026-09-01", value: 72 },
        { date: "2026-09-02", value: 72 },
      ],
      0,
      180,
    );
    expect(
      flat.points.every((point) => Number.isFinite(point.x) && point.y === 90),
    ).toBe(true);
    expect(flat.min).toBeLessThan(flat.max);
  });
});
