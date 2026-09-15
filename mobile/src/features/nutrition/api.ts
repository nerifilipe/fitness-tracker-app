import type { components } from "../../services/api/schema";
import type { AuthSession } from "../auth/session";

export type Food = components["schemas"]["FoodResponse"];
export type FoodSnapshot = components["schemas"]["FoodSnapshot"];
export type FoodInput = components["schemas"]["FoodInput"];
export type FoodSearch = components["schemas"]["FoodSearch"];
export type Entry = components["schemas"]["EntryResponse"];
export type EntryInput = components["schemas"]["EntryInput"];
export type Day = components["schemas"]["NutritionDay"];
export type Goals = components["schemas"]["NutritionGoals"];
export type Values = components["schemas"]["NutritionValues"];
export type Meal = EntryInput["meal"];
export type MealCopy = components["schemas"]["MealCopy"];

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export function nutritionApi(session: AuthSession) {
  return {
    diary: (day: string | null, signal?: AbortSignal) =>
      session.authorized<Day>(
        `/nutrition/diary${day ? `?day=${encodeURIComponent(day)}` : ""}`,
        { signal },
      ),
    foods: (favorites: boolean, q: string, signal?: AbortSignal) =>
      session.authorized<Food[]>(
        `/nutrition/foods?${new URLSearchParams({ favorites: String(favorites), q })}`,
        { signal },
      ),
    search: (q: string, page: number, signal?: AbortSignal) =>
      session.authorized<FoodSearch>(
        `/nutrition/search?${new URLSearchParams({ q, page: String(page) })}`,
        { signal },
      ),
    importFood: (code: string) =>
      session.authorized<Food>(
        "/nutrition/foods/import",
        json("POST", { code }),
      ),
    custom: (food: FoodInput) =>
      session.authorized<Food>("/nutrition/foods", json("POST", food)),
    favorite: (id: string, value: boolean) =>
      session.authorized<Food>(
        `/nutrition/foods/${id}/favorite`,
        json("PUT", { is_favorite: value }),
      ),
    save: (id: string, entry: EntryInput) =>
      session.authorized<Entry>(`/nutrition/entries/${id}`, json("PUT", entry)),
    remove: (id: string) =>
      session.authorized<void>(`/nutrition/entries/${id}`, {
        method: "DELETE",
      }),
    goals: (goals: Goals) =>
      session.authorized<Goals>("/nutrition/goals", json("PUT", goals)),
    copy: (id: string, data: MealCopy) =>
      session.authorized<Day>(
        `/nutrition/meal-copies/${id}`,
        json("PUT", data),
      ),
  };
}
