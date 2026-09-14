import { Card } from "../../components/ui/Card";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { clockText } from "../workouts/draft";
import type { Summary } from "./api";

export const numberText = (value: string | number) =>
  Number(value).toLocaleString("pt-PT", { maximumFractionDigits: 3 });
export const dateText = (value: string, timezone: string) =>
  new Intl.DateTimeFormat("pt-PT", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function SummaryCard({
  summary,
  timezone,
  onPress,
}: {
  summary: Summary;
  timezone: string;
  onPress?: () => void;
}) {
  return (
    <Card>
      <Text variant="section">{summary.name}</Text>
      <Text muted>{dateText(summary.started_at, timezone)}</Text>
      <Text>
        {clockText(summary.active_seconds)} de tempo ativo ·{" "}
        {summary.exercise_count}{" "}
        {summary.exercise_count === 1 ? "exercício" : "exercícios"}
      </Text>
      <Text>
        {summary.completed_sets}{" "}
        {summary.completed_sets === 1 ? "série concluída" : "séries concluídas"}{" "}
        · {summary.skipped_sets} por realizar
      </Text>
      <Text>{numberText(summary.volume_kg)} kg·reps de volume</Text>
      {onPress && (
        <Button label="Ver resumo" variant="secondary" onPress={onPress} />
      )}
    </Card>
  );
}
