import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert } from "react-native";
import { useFocusEffect, usePreventRemove } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import { conventionLabels } from "../features/exercises/labels";
import { templateApi, type Template } from "../features/templates/api";
import type { WorkoutStackParams } from "../navigation/WorkoutNavigator";
import { theme } from "../theme";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { useWorkout } from "../features/workouts/WorkoutProvider";

export function TemplateDetailScreen({
  route,
  navigation,
}: NativeStackScreenProps<WorkoutStackParams, "TemplateDetail">) {
  const { session } = useAuth();
  const { controller, local, ready, storageError } = useWorkout();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [starting, setStarting] = useState(false);
  const api = useMemo(() => templateApi(session), [session]);
  const [plan, setPlan] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [destination, setDestination] = useState<string | null>(null);
  usePreventRemove(busy || starting, () => {});
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      setLoading(true);
      setPlan(null);
      setError("");
      void api
        .detail(route.params.id, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setPlan(value);
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(err.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }, [api, route.params.id, retry]),
  );
  useEffect(() => {
    if (!destination || busy) return;
    if (destination === "list") navigation.popToTop();
    else {
      setDestination(null);
      navigation.push("TemplateDetail", { id: destination });
    }
  }, [destination, busy, navigation]);
  async function action(kind: "duplicate" | "archive") {
    if (!plan || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "duplicate")
        setDestination((await api.duplicate(plan.id)).id);
      else {
        await api.archive(plan.id, plan.version);
        setDestination("list");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível concluir.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen withHeader>
      {loading ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : plan ? (
        <>
          <Text variant="title" accessibilityRole="header">
            {plan.name}
          </Text>
          <Text muted>
            {plan.exercise_count} exercícios · {plan.set_count} séries planeadas
          </Text>
          <Button
            label={
              local?.start ||
              local?.pending ||
              (local?.workout &&
                ["active", "paused"].includes(local.workout.status)) ||
              (local && local.revision !== local.ackRevision)
                ? "Retomar treino em curso"
                : "Iniciar treino"
            }
            loading={starting}
            disabled={busy || !ready || storageError || !plan.exercise_count}
            onPress={() => {
              if (
                local?.start ||
                local?.pending ||
                (local?.workout &&
                  ["active", "paused"].includes(local.workout.status)) ||
                (local && local.revision !== local.ackRevision)
              ) {
                rootNavigation.navigate("ActiveWorkout");
                return;
              }
              setStarting(true);
              void controller
                .begin(plan.id, plan.version)
                .then(() => rootNavigation.navigate("ActiveWorkout"))
                .catch((err) => setError(err.message))
                .finally(() => setStarting(false));
            }}
          />
          <Button
            label="Editar plano"
            disabled={busy}
            onPress={() =>
              navigation.navigate("TemplateEditor", { id: plan.id })
            }
          />
          {!plan.exercises.length && (
            <Card>
              <Text muted>
                Este plano ainda não tem exercícios. Adiciona-os em Editar
                plano.
              </Text>
            </Card>
          )}
          {plan.exercises.map((e, i) => (
            <Card key={e.id}>
              <Text variant="section">
                {i + 1}. {e.name}
              </Text>
              {e.is_archived && (
                <Text style={{ color: theme.colors.error }}>
                  Exercício arquivado na biblioteca
                </Text>
              )}
              <Text muted>
                {e.rest_seconds} s de descanso ·{" "}
                {conventionLabels[e.load_convention]}
              </Text>
              {e.sets.map((s, j) => (
                <Text key={j}>
                  {j + 1}.{" "}
                  {s.set_type === "warmup" ? "Aquecimento" : "Trabalho"} ·{" "}
                  {s.target_reps_min === s.target_reps_max
                    ? s.target_reps_min
                    : `${s.target_reps_min}–${s.target_reps_max}`}{" "}
                  reps
                  {s.target_weight_kg != null
                    ? ` · ${Number(s.target_weight_kg)} kg`
                    : ""}
                  {s.target_rir != null ? ` · RIR ${s.target_rir}` : ""}
                </Text>
              ))}
              {!!e.notes && <Text muted>{e.notes}</Text>}
            </Card>
          ))}
          <Button
            label="Duplicar plano"
            variant="secondary"
            loading={busy}
            onPress={() => void action("duplicate")}
          />
          <Button
            label="Apagar plano"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "Apagar plano?",
                "O plano sai da tua lista. Os exercícios da biblioteca continuam disponíveis.",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Apagar",
                    style: "destructive",
                    onPress: () => void action("archive"),
                  },
                ],
              )
            }
          />
        </>
      ) : null}
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {error}
          </Text>
          <Button
            label="Atualizar plano"
            disabled={busy}
            onPress={() => setRetry((n) => n + 1)}
          />
        </>
      )}
    </Screen>
  );
}
