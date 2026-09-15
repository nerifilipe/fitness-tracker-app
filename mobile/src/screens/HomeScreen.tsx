import { useCallback, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Screen } from "../components/ui/Screen";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Text } from "../components/ui/Text";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { RootStackParams, TabParams } from "../navigation/RootNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../features/auth/AuthProvider";
import { theme } from "../theme";
import { WorkoutBanner } from "../features/workouts/WorkoutBanner";
import { useWorkout } from "../features/workouts/WorkoutProvider";
import { reportsApi } from "../features/history/api";
import { useReport } from "../features/history/useReport";
import { SummaryCard, numberText } from "../features/history/SummaryCard";
import { clockText } from "../features/workouts/draft";
import { HomeNutritionCard } from "../features/nutrition/HomeNutritionCard";
import { HomeProgressCard } from "../features/progress/HomeProgressCard";

export function HomeScreen() {
  const { user, session } = useAuth();
  const navigation = useNavigation<BottomTabNavigationProp<TabParams>>();
  const root = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { local } = useWorkout();
  const completedVersion =
    local?.workout?.status === "completed" ? local.serverVersion : 0;
  const api = useMemo(() => reportsApi(session), [session]);
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.dashboard(signal),
      [api, completedVersion, user?.timezone, user?.weekly_workout_target],
    ),
  );
  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="label" style={styles.accent}>
          FITNESS / TRACKER
        </Text>
        <Text variant="title" accessibilityRole="header">
          Olá, {user?.display_name}.
        </Text>
        <Text muted>Mais consistência. Um treino de cada vez.</Text>
      </View>
      <WorkoutBanner />
      <HomeNutritionCard onPress={() => navigation.navigate("Nutrition")} />
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      {!!error && (
        <Card>
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {error}
          </Text>
          <Button label="Atualizar resultados" onPress={reload} />
        </Card>
      )}
      {data && (
        <>
          <Card>
            <Text variant="label" style={styles.accent}>
              ESTA SEMANA
            </Text>
            <Text variant="title">
              {data.completed_workouts} / {data.weekly_target} treinos
            </Text>
            <Text muted>
              {data.completed_workouts >= data.weekly_target
                ? "Objetivo semanal atingido."
                : "Cada treino conta para a tua consistência."}
            </Text>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Objetivo semanal"
              accessibilityValue={{
                min: 0,
                max: data.weekly_target,
                now: Math.min(data.completed_workouts, data.weekly_target),
                text: `${data.completed_workouts} de ${data.weekly_target} treinos`,
              }}
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.colors.accent,
                  width: `${Math.min(100, (data.completed_workouts / data.weekly_target) * 100)}%`,
                }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {data.days.map((day, index) => (
                <View
                  key={day.date}
                  style={{ flex: 1, alignItems: "center", gap: 8 }}
                >
                  <Text muted>
                    {["S", "T", "Q", "Q", "S", "S", "D"][index]}
                  </Text>
                  <Text
                    accessibilityLabel={`${day.date}: ${day.workouts} ${day.workouts === 1 ? "treino" : "treinos"}`}
                    style={{
                      color: day.workouts
                        ? theme.colors.accent
                        : theme.colors.muted,
                    }}
                  >
                    {day.workouts || "—"}
                  </Text>
                </View>
              ))}
            </View>
            <Text>
              {data.completed_sets}{" "}
              {data.completed_sets === 1 ? "série" : "séries"} ·{" "}
              {clockText(data.active_seconds)} de tempo ativo
            </Text>
            <Text>{numberText(data.volume_kg)} kg·reps de volume</Text>
            <Text muted>
              Desde {data.week_start} · {data.timezone}. Só treinos concluídos e
              sincronizados. Volume de séries de trabalho com carga externa.
            </Text>
          </Card>
          <Text variant="section">Treinos recentes</Text>
          {!data.recent.length && (
            <Text muted>
              Ainda não tens treinos concluídos. Escolhe um plano para começar.
            </Text>
          )}
          {data.recent.map((summary) => (
            <SummaryCard
              key={summary.id}
              summary={summary}
              timezone={data.timezone}
              onPress={() =>
                root.navigate("WorkoutSummary", { id: summary.id })
              }
            />
          ))}
        </>
      )}
      <HomeProgressCard onPress={() => navigation.navigate("Progress")} />
      <Button
        label="Ver histórico"
        variant="secondary"
        onPress={() => root.navigate("History")}
      />
      <Button
        label="Abrir área de treino"
        onPress={() => navigation.navigate("Workout")}
      />
      <Text variant="label" muted style={styles.footer}>
        UM TREINO DE CADA VEZ
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: theme.space.md,
    paddingTop: theme.space.xl,
    paddingBottom: theme.space.lg,
  },
  accent: { color: theme.colors.accent },
  footer: { textAlign: "center", marginTop: theme.space.sm },
});
