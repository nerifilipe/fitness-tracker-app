import type { FoodSnapshot, Meal, Values } from "./api";

export const meals: { value: Meal; label: string }[] = [
  { value: "breakfast", label: "Pequeno-almoço" },
  { value: "lunch", label: "Almoço" },
  { value: "dinner", label: "Jantar" },
  { value: "snack", label: "Lanches" },
];
export const nutrients = [
  { key: "calories", label: "Calorias", unit: "kcal" },
  { key: "protein", label: "Proteína", unit: "g" },
  { key: "carbs", label: "Hidratos", unit: "g" },
  { key: "fat", label: "Gordura", unit: "g" },
] as const;

export function amount(text: string): number {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(normalized))
    throw new Error("Indica uma quantidade válida (até 3 casas decimais).");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 10000)
    throw new Error("A quantidade deve estar entre 0,001 e 10 000.");
  return value;
}

export function portionValues(food: FoodSnapshot, quantity: number): Values {
  return Object.fromEntries(
    nutrients.map(({ key }) => [key, (food[key] * quantity) / 100]),
  ) as Values;
}

export function shiftDay(day: string, offset: number): string {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function dateLabel(day: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

export function defaultMeal(timezone: string): Meal {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(new Date()),
  );
  return hour < 11
    ? "breakfast"
    : hour < 15
      ? "lunch"
      : hour < 19
        ? "snack"
        : "dinner";
}

export function fmt(value: number) {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(
    value,
  );
}
