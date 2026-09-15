import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/ui/Button";
import { ChoiceField } from "../../components/ui/ChoiceField";
import { Text } from "../../components/ui/Text";
import { useAuth } from "../auth/AuthProvider";
import { useReport } from "../history/useReport";
import { strengthApi } from "../progress/strengthApi";
import { loadText, sessionDate } from "../progress/strengthHelpers";
import { useWorkout } from "./WorkoutProvider";
import type { LiveExercise } from "./draft";
import {
  applyProgression,
  progressionChanges,
  suggestProgression,
  type AppliedSet,
} from "./progression";
import { theme } from "../../theme";

type Props = {
  exercise: LiveExercise;
  workoutId: string;
  startedAt: string;
  visible: boolean;
  disabled: boolean;
};

export function ExerciseSuggestion({
  exercise: e,
  workoutId,
  startedAt,
  visible,
  disabled,
}: Props) {
  const { session, user } = useAuth();
  const { controller } = useWorkout();
  const api = useMemo(() => strengthApi(session), [session]);
  const [activated, setActivated] = useState(false);
  const [increment, setIncrement] = useState(
    e.load_convention_snapshot === "per_hand" ? "1" : "2.5",
  );
  const [applied, setApplied] = useState<AppliedSet[]>([]);
  useEffect(() => {
    if (visible) setActivated(true);
  }, [visible]);
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) =>
        activated
          ? api.recent(
              e.exercise_id,
              {
                load_type: e.load_type_snapshot,
                load_convention: e.load_convention_snapshot,
              },
              signal,
            )
          : Promise.resolve(null),
      [
        api,
        activated,
        e.exercise_id,
        e.load_type_snapshot,
        e.load_convention_snapshot,
        user?.id,
        workoutId,
      ],
    ),
  );
  const suggestion = data
    ? suggestProgression(e, data.items, startedAt, Number(increment))
    : null;
  const changes = suggestion ? progressionChanges(e, suggestion) : [];
  const undoable = applied.filter((change) =>
    e.sets.some(
      (s) =>
        s.id === change.id &&
        !s.completed_at &&
        s.set_type === "working" &&
        s.weight === change.after.weight &&
        s.reps === change.after.reps &&
        s.rir === change.after.rir,
    ),
  );
  function save(undo = false) {
    const state = controller.getSnapshot();
    if (
      disabled ||
      state.storageError ||
      state.local?.conflict ||
      state.local?.workout?.id !== workoutId ||
      state.local.workout.status !== "active"
    )
      return;
    const patch = undo ? undoable : changes;
    if (!patch.length) return;
    const saved = controller.edit((w) => ({
      ...w,
      exercises: w.exercises.map((item) =>
        item.id === e.id ? applyProgression(item, patch, undo) : item,
      ),
    }));
    if (saved) setApplied(undo ? [] : patch);
  }
  if (!visible) return null;
  return (
    <View style={{ gap: theme.space.sm }}>
      <Text variant="section">Sugestão para hoje</Text>
      {loading && <Text muted>A consultar a última sessão…</Text>}
      {!!error && (
        <>
          <Text muted>
            Não foi possível consultar o histórico. Podes continuar a registar o
            treino.
          </Text>
          <Button
            label="Tentar carregar sugestão"
            variant="secondary"
            onPress={reload}
          />
        </>
      )}
      {!loading && !error && !suggestion && (
        <Text muted>
          Ainda não há uma sessão anterior nesta convenção de carga. Usa os
          valores do plano; o treino concluído servirá de referência.
        </Text>
      )}
      {suggestion && (
        <>
          <Text muted>
            Última sessão ·{" "}
            {sessionDate(suggestion.source.started_at, user?.timezone ?? "UTC")}
          </Text>
          <Text>
            {suggestion.source.sets
              .map(
                (s, i) =>
                  `S${i + 1}: ${loadText(s.weight_kg, "metric")} × ${s.reps}`,
              )
              .join(" · ")}
          </Text>
          {e.load_type_snapshot === "external" && (
            <ChoiceField
              label={
                e.load_convention_snapshot === "per_hand"
                  ? "Incremento disponível por mão (kg)"
                  : "Incremento disponível no total (kg)"
              }
              value={increment}
              options={["0.5", "1", "1.25", "2.5", "5"].map((value) => ({
                value,
                label: `${value.replace(".", ",")} kg`,
              }))}
              onChange={setIncrement}
              disabled={disabled}
            />
          )}
          <Text variant="label">
            {suggestion.kind === "load"
              ? "SUBIR LIGEIRAMENTE A CARGA"
              : suggestion.kind === "reps"
                ? "TENTAR MAIS 1 REPETIÇÃO"
                : "REPETIR A ÚLTIMA SESSÃO"}
          </Text>
          <Text muted>{suggestion.reason}</Text>
          <Text muted>
            RIR é o número de repetições que ainda conseguias fazer no fim da
            série. A sugestão é ajustável; confirma o que realizaste antes de
            concluir cada série.
          </Text>
          {!!changes.length && (
            <>
              <Text>
                {changes
                  .map(
                    (change) =>
                      `S${e.sets.findIndex((s) => s.id === change.id) + 1}: ${loadText(Number(change.after.weight), "metric")} × ${change.after.reps}`,
                  )
                  .join(" · ")}
              </Text>
              <Text muted>
                Substitui carga e reps nas {changes.length} séries acima. O RIR
                fica por preencher com o esforço de hoje.
              </Text>
              <Button
                label={`Aplicar a ${changes.length} ${changes.length === 1 ? "série" : "séries"}`}
                disabled={disabled}
                onPress={() => save()}
              />
            </>
          )}
          {!changes.length && (
            <Text muted>
              Os valores sugeridos já estão preenchidos ou as séries
              correspondentes estão concluídas.
            </Text>
          )}
        </>
      )}
      {!!undoable.length && (
        <Button
          label="Desfazer preenchimento"
          variant="secondary"
          disabled={disabled}
          onPress={() => save(true)}
        />
      )}
    </View>
  );
}
