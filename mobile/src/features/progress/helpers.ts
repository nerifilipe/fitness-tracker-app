import type { Measurement, MeasurementInput, Metric, Units } from "./api";

export const metrics: { key: Metric; label: string; max: number }[] = [
  { key: "weight_kg", label: "Peso", max: 500 },
  { key: "waist_cm", label: "Cintura", max: 400 },
  { key: "chest_cm", label: "Peito", max: 400 },
  { key: "arms_cm", label: "Braço", max: 200 },
  { key: "legs_cm", label: "Coxa", max: 300 },
];

export function unitLabel(key: Metric, units: Units) {
  return key === "weight_kg"
    ? units === "metric"
      ? "kg"
      : "lb"
    : units === "metric"
      ? "cm"
      : "in";
}

export function displayValue(value: number, key: Metric, units: Units) {
  if (units === "metric") return value;
  return key === "weight_kg" ? value / 0.45359237 : value / 2.54;
}

export function numberText(value: number) {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(
    value,
  );
}

export function dateText(day: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

export function validDay(day: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < "1900-01-01" || day > today)
    return false;
  const parsed = new Date(`${day}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
  );
}

export type MeasurementForm = Record<Metric, string> & { notes: string };
export function initialForm(
  record: Measurement | null,
  units: Units,
): MeasurementForm {
  return Object.fromEntries([
    ...metrics.map(({ key }) => [
      key,
      record?.[key] == null
        ? ""
        : String(Number(displayValue(record[key], key, units).toFixed(3))),
    ]),
    ["notes", record?.notes ?? ""],
  ]) as MeasurementForm;
}

export function parseForm(
  form: MeasurementForm,
  original: Measurement | null,
  units: Units,
): MeasurementInput {
  const initial = initialForm(original, units);
  const data: MeasurementInput = { notes: form.notes.trim() || null };
  for (const { key, label, max } of metrics) {
    const text = form[key].trim().replace(",", ".");
    if (!text) {
      data[key] = null;
      continue;
    }
    // Preserve the exact original when a rounded imperial display was not edited.
    if (text === initial[key] && original?.[key] != null) {
      data[key] = original[key];
      continue;
    }
    if (!/^\d+(\.\d{1,3})?$/.test(text))
      throw new Error(`Indica um valor válido para ${label.toLowerCase()}.`);
    const shown = Number(text);
    const canonical =
      units === "metric"
        ? shown
        : shown * (key === "weight_kg" ? 0.45359237 : 2.54);
    if (!Number.isFinite(canonical) || canonical < 1 || canonical > max)
      throw new Error(
        `${label}: usa um valor entre ${numberText(displayValue(1, key, units))} e ${numberText(displayValue(max, key, units))} ${unitLabel(key, units)}.`,
      );
    data[key] = Math.round(canonical * 1000) / 1000;
  }
  if (metrics.every(({ key }) => data[key] == null))
    throw new Error("Regista o peso ou pelo menos uma medida.");
  return data;
}

export type PlotPoint = { date: string; value: number; x: number; y: number };
export function plotPoints(
  points: { date: string; value: number }[],
  width: number,
  height: number,
) {
  if (!points.length) return { points: [] as PlotPoint[], min: 0, max: 1 };
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((point) => point.value);
  const low = Math.min(...values),
    high = Math.max(...values);
  const padding = Math.max((high - low) * 0.15, 0.5);
  const min = low - padding,
    max = high + padding;
  const times = sorted.map((point) => Date.parse(`${point.date}T12:00:00Z`));
  const span = times[times.length - 1] - times[0];
  const inset = 12,
    usableWidth = Math.max(0, width - inset * 2);
  return {
    min,
    max,
    points: sorted.map((point, index) => ({
      ...point,
      x: span
        ? inset + ((times[index] - times[0]) / span) * usableWidth
        : width / 2,
      y:
        inset +
        ((max - point.value) / (max - min)) * Math.max(0, height - inset * 2),
    })),
  };
}
