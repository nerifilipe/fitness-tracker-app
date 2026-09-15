import { describe, expect, it } from "vitest";
import {
  amount,
  portionValues,
  shiftDay,
} from "../src/features/nutrition/helpers";
import { nutritionApi, type FoodSnapshot } from "../src/features/nutrition/api";
import type { AuthSession } from "../src/features/auth/session";

describe("nutrition portions", () => {
  it("accepts Portuguese decimal quantities and rejects ambiguous input", () => {
    expect(amount(" 125,5 ")).toBe(125.5);
    for (const value of [
      "",
      "0",
      "-5",
      "1e3",
      "NaN",
      "12 g",
      "10.000,5",
      "10001",
      "0.0001",
    ])
      expect(() => amount(value)).toThrow();
  });
  it("scales calories and macros together for grams and millilitres", () => {
    const food: FoodSnapshot = {
      name: "Iogurte",
      brand: "",
      unit: "g",
      source: "custom",
      calories: 63,
      protein: 4.2,
      carbs: 5,
      fat: 3,
    };
    expect(portionValues(food, 125)).toEqual({
      calories: 78.75,
      protein: 5.25,
      carbs: 6.25,
      fat: 3.75,
    });
    expect(portionValues({ ...food, unit: "ml" }, 250).calories).toBe(157.5);
  });
  it("changes calendar days over DST, month and year boundaries", () => {
    expect(shiftDay("2026-03-29", -1)).toBe("2026-03-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
  });
  it("reuses the caller's identifier when retrying a save", async () => {
    const calls: { path: string; options?: RequestInit }[] = [];
    const session = {
      authorized: async (path: string, options?: RequestInit) => {
        calls.push({ path, options });
        return {};
      },
    } as unknown as AuthSession;
    const api = nutritionApi(session);
    const body = {
      food_id: "food",
      date: "2026-09-15",
      meal: "lunch" as const,
      quantity: 125,
    };
    await api.save("stable-entry", body);
    await api.save("stable-entry", body);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0].options?.method).toBe("PUT");
    await api.search("pão & leite", 1);
    expect(calls[2].path).toContain("q=p%C3%A3o+%26+leite");
  });
});
