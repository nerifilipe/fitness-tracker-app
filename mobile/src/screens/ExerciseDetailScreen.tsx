import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import { exerciseApi, type Exercise } from "../features/exercises/api";
import {
  conventionLabels,
  equipmentLabels,
  loadLabels,
} from "../features/exercises/labels";
import type { WorkoutStackParams } from "../navigation/WorkoutNavigator";
import { theme } from "../theme";

export function ExerciseDetailScreen({
  route,
  navigation,
}: NativeStackScreenProps<WorkoutStackParams, "ExerciseDetail">) {
  const { session } = useAuth();
  const api = useMemo(() => exerciseApi(session), [session]);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      setError("");
      setExercise(null);
      void api
        .detail(route.params.id, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setExercise(value);
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(err.message);
        });
      return () => controller.abort();
    }, [api, route.params.id, retry]),
  );
  async function act(archive: boolean) {
    if (!exercise || busy) return;
    setBusy(true);
    setError("");
    try {
      if (archive) {
        await api.archive(exercise.id);
        navigation.popToTop();
      } else
        setExercise(await api.favorite(exercise.id, !exercise.is_favorite));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tenta novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen withHeader>
      {!exercise && !error && (
        <ActivityIndicator
          color={theme.colors.accent}
          accessibilityLabel="A carregar exercício"
        />
      )}
      {exercise && (
        <>
          <Text variant="label" style={styles.accent}>
            {exercise.is_custom ? "EXERCÍCIO PERSONALIZADO" : "CATÁLOGO"}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {exercise.name}
          </Text>
          <Text muted>
            {exercise.primary_muscle.name} ·{" "}
            {equipmentLabels[exercise.equipment]}
          </Text>
          <Button
            label={
              exercise.is_favorite
                ? "Remover dos favoritos"
                : "Adicionar aos favoritos"
            }
            onPress={() => void act(false)}
            loading={busy}
          />
          <Card>
            <Text variant="section">Carga</Text>
            <Text>
              {loadLabels[exercise.load_type]} ·{" "}
              {conventionLabels[exercise.load_convention]}
            </Text>
            <Text muted>
              Usa esta convenção em todas as sessões para comparar resultados.
            </Text>
          </Card>
          {!!exercise.secondary_muscles.length && (
            <Card>
              <Text variant="section">Músculos secundários</Text>
              <Text muted>
                {exercise.secondary_muscles
                  .map((muscle) => muscle.name)
                  .join(" · ")}
              </Text>
            </Card>
          )}
          {!!exercise.instructions && (
            <Card>
              <Text variant="section">Notas e instruções</Text>
              <Text muted>{exercise.instructions}</Text>
            </Card>
          )}
          {exercise.is_custom && (
            <>
              <Button
                label="Editar exercício"
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  navigation.navigate("ExerciseEditor", { id: exercise.id })
                }
              />
              <Button
                label="Arquivar exercício"
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Arquivar exercício?",
                    "Deixa de aparecer na biblioteca. Os dados do exercício ficam preservados.",
                    [
                      { text: "Cancelar", style: "cancel" },
                      {
                        text: "Arquivar",
                        style: "destructive",
                        onPress: () => void act(true),
                      },
                    ],
                  )
                }
              />
            </>
          )}
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!exercise && !!error && (
        <Button
          label="Tentar novamente"
          onPress={() => setRetry((value) => value + 1)}
        />
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  accent: { color: theme.colors.accent },
  error: { color: theme.colors.error },
});
