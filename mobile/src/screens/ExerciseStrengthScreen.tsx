import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Text } from "../components/ui/Text";
import { Button } from "../components/ui/Button";
import { ChoiceField } from "../components/ui/ChoiceField";
import { useAuth } from "../features/auth/AuthProvider";
import { useReport } from "../features/history/useReport";
import {
  strengthApi,
  type StrengthBest,
  type StrengthGroup,
} from "../features/progress/strengthApi";
import {
  groupKey,
  groupLabel,
  loadText,
  sessionComparison,
  sessionDate,
} from "../features/progress/strengthHelpers";
import { displayValue } from "../features/progress/helpers";
import { ProgressChart } from "../features/progress/ProgressChart";
import { StrengthSessionCard } from "../features/progress/StrengthSessionCard";
import { theme } from "../theme";

export function ExerciseStrengthScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "ExerciseStrength">) {
  const { session, user } = useAuth();
  const units = user?.unit_system ?? "metric";
  const api = useMemo(() => strengthApi(session), [session]);
  const [days, setDays] = useState(90);
  const [group, setGroup] = useState<StrengthGroup | null>(null);
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) =>
        api.overview(route.params.id, days, group, signal),
      [api, route.params.id, days, group, user?.id, user?.timezone],
    ),
  );
  const comparison =
    data?.latest && data.previous
      ? sessionComparison(data.latest, data.previous)
      : null;
  function record(title: string, best: StrengthBest | null, reps = false) {
    return (
      best && (
        <View style={{ gap: 4 }}>
          <Text>
            {title}:{" "}
            {reps
              ? `${best.reps} reps com ${loadText(best.weight_kg, units)}`
              : loadText(best.value, units)}
          </Text>
          <Text muted>
            {loadText(best.weight_kg, units)} × {best.reps} ·{" "}
            {sessionDate(best.started_at, data!.timezone)}
          </Text>
          <Button
            label="Ver treino do recorde"
            accessibilityLabel={`Ver treino: ${title}`}
            variant="secondary"
            onPress={() =>
              navigation.navigate("WorkoutSummary", { id: best.workout_id })
            }
          />
        </View>
      )
    );
  }
  return (
    <Screen withHeader>
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {error}
          </Text>
          <Button label="Tentar novamente" onPress={reload} />
        </>
      )}
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      {data && (
        <>
          <Text variant="title">{data.exercise_name}</Text>
          {data.groups.length > 1 ? (
            <ChoiceField
              label="Convenção de carga"
              value={groupKey(data.selected)}
              options={data.groups.map((item) => ({
                value: groupKey(item),
                label: groupLabel(item),
              }))}
              onChange={(key) =>
                setGroup(data.groups.find((item) => groupKey(item) === key)!)
              }
            />
          ) : (
            <Text muted>{groupLabel(data.selected)}</Text>
          )}
          <Text muted>
            Séries de trabalho concluídas, em treinos finalizados e
            sincronizados.
          </Text>
          <Card>
            <Text variant="section">
              {data.chart_metric === "estimated_1rm"
                ? "Evolução do 1RM estimado"
                : "Repetições por série"}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[30, 90, 365].map((period) => (
                <Button
                  key={period}
                  label={period === 365 ? "1 ano" : `${period} dias`}
                  variant={days === period ? "primary" : "secondary"}
                  onPress={() => setDays(period)}
                />
              ))}
            </View>
            <ProgressChart
              label={
                data.chart_metric === "estimated_1rm"
                  ? "1RM estimado"
                  : "Máximo de repetições"
              }
              unit={
                data.chart_metric === "estimated_1rm"
                  ? units === "metric"
                    ? "kg"
                    : "lb"
                  : "reps"
              }
              values={data.points.map((point) => ({
                ...point,
                value:
                  data.chart_metric === "estimated_1rm"
                    ? displayValue(point.value, "weight_kg", units)
                    : point.value,
              }))}
            />
            <Text muted>
              {data.chart_metric === "estimated_1rm"
                ? "Melhor estimativa de cada dia. Fórmula de Epley para 1–10 repetições com carga positiva; uma repetição usa a própria carga."
                : "Maior número de repetições numa série em cada dia. Peso corporal e assistência não geram estimativas de 1RM."}
            </Text>
            {data.selected.load_convention === "per_hand" && (
              <Text muted>A carga é por mão; não é multiplicada por dois.</Text>
            )}
          </Card>
          {data.selected.load_type === "external" && (
            <Card>
              <Text variant="section">Recordes pessoais</Text>
              <Text muted>Todo o histórico nesta convenção.</Text>
              {record("Maior carga", data.records.heaviest)}
              {record("Melhor 1RM estimado", data.records.estimated_1rm)}
              {record(
                "Mais reps à maior carga da última sessão",
                data.records.reps_at_latest_weight,
                true,
              )}
              {!data.records.heaviest && (
                <Text muted>Ainda sem séries elegíveis para recordes.</Text>
              )}
            </Card>
          )}
          <Text variant="section">Últimas duas sessões</Text>
          <Text muted>
            A comparação usa as sessões mais recentes nesta convenção,
            independentemente do período do gráfico.
          </Text>
          {comparison && (
            <Card>
              <Text variant="label">ÚLTIMA − ANTERIOR</Text>
              {comparison.estimated_1rm != null && (
                <Text>
                  1RM estimado: {comparison.estimated_1rm > 0 ? "+" : ""}
                  {loadText(comparison.estimated_1rm, units)}
                </Text>
              )}
              {data.selected.load_convention !== "none" && (
                <Text>
                  {data.selected.load_type === "assisted"
                    ? "Assistência máxima"
                    : "Carga máxima"}
                  : {comparison.max_weight_kg > 0 ? "+" : ""}
                  {loadText(comparison.max_weight_kg, units)}
                </Text>
              )}
              <Text>
                {comparison.total_reps > 0 ? "+" : ""}
                {comparison.total_reps} reps ·{" "}
                {comparison.completed_sets > 0 ? "+" : ""}
                {comparison.completed_sets} séries
              </Text>
              <Text muted>
                As sessões podem ter quantidades de séries diferentes.
              </Text>
            </Card>
          )}
          {[
            { row: data.latest, title: "ÚLTIMA" },
            { row: data.previous, title: "ANTERIOR" },
          ].map(
            ({ row, title }) =>
              row && (
                <StrengthSessionCard
                  key={row.workout_id}
                  session={row}
                  group={data.selected}
                  timezone={data.timezone}
                  units={units}
                  title={title}
                  onOpen={() =>
                    navigation.navigate("WorkoutSummary", {
                      id: row.workout_id,
                    })
                  }
                />
              ),
          )}
          {!data.latest && (
            <Text muted>
              Ainda sem séries de trabalho concluídas neste exercício.
            </Text>
          )}
          {!!data.latest && !data.previous && (
            <Text muted>
              Conclui outra sessão deste exercício para comparar.
            </Text>
          )}
          <Button
            label="Ver todas as sessões"
            variant="secondary"
            onPress={() =>
              navigation.navigate("StrengthHistory", {
                id: data.exercise_id,
                name: data.exercise_name,
                group: data.selected,
              })
            }
          />
        </>
      )}
    </Screen>
  );
}
