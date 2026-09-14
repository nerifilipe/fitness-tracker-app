import { useCallback, useMemo } from "react";
import { ActivityIndicator } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { useAuth } from "../features/auth/AuthProvider";
import { reportsApi } from "../features/history/api";
import { useReport } from "../features/history/useReport";
import { SummaryCard, numberText } from "../features/history/SummaryCard";
import { conventionLabels } from "../features/exercises/labels";
import { Screen } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Text } from "../components/ui/Text";
import { Button } from "../components/ui/Button";
import { theme } from "../theme";

export function WorkoutSummaryScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "WorkoutSummary">) {
  const { session, user } = useAuth();
  const api = useMemo(() => reportsApi(session), [session]);
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.report(route.params.id, signal),
      [api, route.params.id],
    ),
  );
  return (
    <Screen withHeader>
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {error}
          </Text>
          <Button label="Tentar novamente" onPress={reload} />
        </>
      )}
      {data && (
        <>
          <Text variant="label" style={{ color: theme.colors.accent }}>
            TREINO CONCLUÍDO
          </Text>
          <SummaryCard summary={data.summary} timezone={user!.timezone} />
          <Text muted>
            O volume soma carga registada × repetições das séries de trabalho
            com carga externa. Exclui aquecimentos, peso corporal e assistência.
            A carga por mão não é duplicada.
          </Text>
          <Text variant="section">Marcas deste treino</Text>
          {!data.records.length && (
            <Text muted>Sem novas marcas neste treino.</Text>
          )}
          {data.records.map((record) => (
            <Card
              key={`${record.exercise_id}:${record.load_convention}:${record.kind}:${record.weight_kg}`}
            >
              <Text variant="label" style={{ color: theme.colors.accent }}>
                {record.previous_value == null
                  ? "PRIMEIRA MARCA"
                  : "NOVO RECORDE"}
              </Text>
              <Text variant="section">{record.exercise_name}</Text>
              <Text muted>
                {
                  conventionLabels[
                    record.load_convention as keyof typeof conventionLabels
                  ]
                }
              </Text>
              <Text>
                {record.kind === "reps"
                  ? `${numberText(record.value)} repetições com ${numberText(record.weight_kg!)} kg`
                  : `${numberText(record.value)} kg de 1RM estimado`}
              </Text>
              {record.previous_value != null && (
                <Text muted>
                  Anterior: {numberText(record.previous_value)}{" "}
                  {record.kind === "reps"
                    ? "repetições com a mesma carga"
                    : "kg estimados"}
                </Text>
              )}
            </Card>
          ))}
          <Text muted>
            Marcas de séries de trabalho com carga externa, comparadas com
            treinos anteriores. O 1RM é uma estimativa de Epley para 1–10
            repetições.
          </Text>
          <Text variant="section">Séries registadas</Text>
          {data.workout.exercises.map((exercise) => (
            <Card key={exercise.id}>
              <Text variant="section">{exercise.name_snapshot}</Text>
              <Text muted>
                {conventionLabels[exercise.load_convention_snapshot]}
              </Text>
              {exercise.sets.map((set, index) => (
                <Text key={set.id} muted={!set.completed_at}>
                  {index + 1}.{" "}
                  {set.set_type === "warmup" ? "Aquecimento" : "Trabalho"} ·{" "}
                  {set.completed_at
                    ? `${numberText(set.weight_kg!)} kg × ${set.reps}${set.rir == null ? "" : ` · RIR ${set.rir}`}`
                    : "Não realizada"}
                </Text>
              ))}
              {!!exercise.notes && <Text muted>{exercise.notes}</Text>}
            </Card>
          ))}
          {!!data.workout.notes && (
            <Card>
              <Text variant="section">Notas do treino</Text>
              <Text>{data.workout.notes}</Text>
            </Card>
          )}
          <Button
            label="Abrir histórico"
            variant="secondary"
            onPress={() => navigation.navigate("History")}
          />
          <Button
            label="Voltar ao início"
            onPress={() => navigation.popTo("Main", { screen: "Home" })}
          />
        </>
      )}
    </Screen>
  );
}
