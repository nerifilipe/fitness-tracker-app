import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { ActivityIndicator, Alert, Share, View } from "react-native";
import * as Crypto from "expo-crypto";
import { Screen } from "../components/ui/Screen";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import { useWorkout } from "../features/workouts/WorkoutProvider";
import { LiveExerciseCard } from "../features/workouts/LiveExerciseCard";
import {
  cancelWorkout,
  clockText,
  elapsed,
  finishWorkout,
  freshExercise,
  remaining,
  togglePause,
  toggleSet,
} from "../features/workouts/draft";
import { ExercisePicker } from "../features/templates/ExercisePicker";
import { latestRecovery } from "../features/workouts/storage";
import { theme } from "../theme";

export function ActiveWorkoutScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { user, offline } = useAuth();
  const { local, busy, ready, error, storageError, controller } = useWorkout();
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [shareError, setShareError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const workout = local?.workout;
  const completedSets =
    workout?.exercises.reduce(
      (total, exercise) =>
        total + exercise.sets.filter((set) => set.completed_at).length,
      0,
    ) ?? 0;
  const closed = workout && !["active", "paused"].includes(workout.status);
  const pending =
    local &&
    (local.start || local.pending || local.revision !== local.ackRevision);
  const disabled = !!closed || storageError || !!local?.conflict;
  const rest = remaining(workout?.rest_deadline ?? null, now);
  async function exportData(backup = false) {
    try {
      const content = backup
        ? latestRecovery(user!.id)
        : JSON.stringify(local, null, 2);
      if (!content) {
        setShareError("Não existe uma cópia de recuperação neste dispositivo.");
        return;
      }
      await Share.share({ title: "Cópia do treino", message: content });
      setShareError("");
    } catch {
      setShareError("Não foi possível abrir a partilha.");
    }
  }
  return (
    <Screen withHeader>
      {!ready && !error && <ActivityIndicator color={theme.colors.accent} />}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          {error}
        </Text>
      )}
      {storageError && (
        <Button
          label="Tentar recuperar armazenamento"
          onPress={() => controller.retryStorage()}
        />
      )}
      {local?.conflict && (
        <Card>
          <Text variant="section">Alterações noutro dispositivo</Text>
          <Text muted>
            Os teus registos locais foram preservados. Exporta-os para comparar,
            ou carrega a versão do servidor. Ao carregar, fica também uma cópia
            local de recuperação.
          </Text>
          <Button
            label="Exportar registo local"
            variant="secondary"
            onPress={() => void exportData()}
          />
          <Button
            label="Carregar versão do servidor"
            onPress={() =>
              Alert.alert(
                "Carregar versão do servidor?",
                "O ecrã passa a mostrar essa versão. Os registos locais ficam numa cópia de recuperação.",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Carregar",
                    onPress: () => controller.acceptRemote(),
                  },
                ],
              )
            }
          />
        </Card>
      )}
      {workout ? (
        <>
          <Text variant="title" accessibilityRole="header">
            {workout.name_snapshot}
          </Text>
          <View style={{ gap: theme.space.sm }}>
            <Text variant="title">{clockText(elapsed(workout, now))}</Text>
            <Text muted>
              {workout.status === "paused"
                ? "EM PAUSA"
                : closed
                  ? "TREINO ENCERRADO"
                  : "TEMPO ATIVO"}{" "}
              · {completedSets}{" "}
              {completedSets === 1 ? "série registada" : "séries registadas"}
            </Text>
          </View>
          <Text muted>
            {pending
              ? "Guardado no telemóvel · por sincronizar"
              : "Guardado no telemóvel e no servidor"}
            {offline ? " · sem ligação" : ""}
          </Text>
          <Button
            label={busy ? "A sincronizar…" : "Sincronizar agora"}
            variant="secondary"
            loading={busy}
            disabled={storageError || !!local?.conflict}
            onPress={() => void controller.sync()}
          />
          {closed &&
            local &&
            local.revision !== local.ackRevision &&
            !local.pending &&
            !local.conflict && (
              <Button
                label="Corrigir treino antes de encerrar"
                variant="secondary"
                onPress={() => controller.correctClosure()}
              />
            )}
          {workout.status === "completed" && (
            <Card>
              <Text variant="section">
                {pending ? "Conclusão por sincronizar" : "Treino concluído"}
              </Text>
              <Text muted>
                {pending
                  ? "A conclusão está guardada no telemóvel. Sincroniza quando tiveres ligação para consultar o resumo e atualizar o histórico."
                  : "Os resultados já estão disponíveis no teu histórico."}
              </Text>
              {!pending && !local?.conflict && (
                <Button
                  label="Ver resumo"
                  onPress={() =>
                    navigation.replace("WorkoutSummary", { id: workout.id })
                  }
                />
              )}
            </Card>
          )}
          {!closed && (
            <>
              <Button
                label={
                  workout.status === "paused"
                    ? "Retomar treino"
                    : "Pausar treino"
                }
                disabled={disabled}
                onPress={() =>
                  controller.edit((w) => togglePause(w, Date.now()))
                }
              />
              {workout.rest_deadline && (
                <Card>
                  <Text variant="label">DESCANSO</Text>
                  <Text variant="title" accessibilityLiveRegion="none">
                    {clockText(rest)}
                  </Text>
                  {!rest && (
                    <Text style={{ color: theme.colors.accent }}>
                      Descanso terminado.
                    </Text>
                  )}
                  <Button
                    label="+30 segundos"
                    variant="secondary"
                    disabled={disabled || rest > 3570}
                    onPress={() =>
                      controller.edit((w) => ({
                        ...w,
                        rest_deadline: new Date(
                          Date.now() +
                            (remaining(w.rest_deadline, Date.now()) + 30) *
                              1000,
                        ).toISOString(),
                      }))
                    }
                  />
                  <Button
                    label="Saltar descanso"
                    variant="secondary"
                    disabled={disabled}
                    onPress={() =>
                      controller.edit((w) => ({ ...w, rest_deadline: null }))
                    }
                  />
                </Card>
              )}
              <Text muted>
                Usa os valores do plano ou aplica a sugestão de cada exercício.
                Confirma a carga e as repetições realizadas antes de concluir
                cada série.
              </Text>
            </>
          )}
          {workout.exercises.map((e, index) => (
            <LiveExerciseCard
              key={e.id}
              exercise={e}
              workoutId={workout.id}
              startedAt={workout.started_at}
              index={index}
              expanded={expanded === e.id || (expanded === null && index === 0)}
              disabled={disabled}
              paused={workout.status === "paused"}
              uuid={Crypto.randomUUID}
              onToggle={() =>
                setExpanded(
                  expanded === e.id || (expanded === null && index === 0)
                    ? ""
                    : e.id,
                )
              }
              onChange={(value) =>
                controller.edit((w) => ({
                  ...w,
                  exercises: w.exercises.map((item) =>
                    item.id === value.id ? value : item,
                  ),
                }))
              }
              onComplete={(setId) =>
                controller.edit((w) => toggleSet(w, e.id, setId, Date.now()))
              }
              onReplace={() =>
                Alert.alert(
                  "Substituir exercício?",
                  "As séries deste bloco serão removidas. O novo exercício começa com uma série vazia.",
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Escolher exercício",
                      onPress: () => setPicker(e.id),
                    },
                  ],
                )
              }
              onRemove={() =>
                Alert.alert(
                  "Remover exercício?",
                  "As séries deste exercício, incluindo as concluídas, serão removidas do treino.",
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Remover",
                      style: "destructive",
                      onPress: () =>
                        controller.edit((w) => ({
                          ...w,
                          exercises: w.exercises.filter(
                            (item) => item.id !== e.id,
                          ),
                        })),
                    },
                  ],
                )
              }
            />
          ))}
          {!closed && (
            <Button
              label="Adicionar exercício"
              variant="secondary"
              disabled={disabled || workout.exercises.length >= 50}
              onPress={() => setPicker("add")}
            />
          )}
          <Input
            label="Notas do treino"
            value={workout.notes ?? ""}
            maxLength={3000}
            multiline
            editable={!disabled}
            onChangeText={(notes) => controller.edit((w) => ({ ...w, notes }))}
          />
          {!closed && (
            <Button
              label="Finalizar treino"
              disabled={disabled}
              onPress={() => {
                const sets = workout.exercises.flatMap((e) => e.sets);
                const done = sets.filter((s) => s.completed_at).length;
                if (!done) {
                  Alert.alert(
                    "Ainda não há séries concluídas",
                    "Regista pelo menos uma série antes de finalizar.",
                  );
                  return;
                }
                Alert.alert(
                  "Finalizar treino?",
                  `${done} ${done === 1 ? "série concluída" : "séries concluídas"}. Por realizar: ${sets.length - done}. Só as séries concluídas contam para os resultados. Depois de sincronizado, o treino fica fechado.`,
                  [
                    { text: "Continuar treino", style: "cancel" },
                    {
                      text: "Finalizar",
                      onPress: () =>
                        controller.edit((w) => finishWorkout(w, Date.now())),
                    },
                  ],
                );
              }}
            />
          )}
          {!closed && (
            <Button
              label="Cancelar treino"
              variant="secondary"
              disabled={disabled}
              onPress={() =>
                Alert.alert(
                  "Cancelar treino?",
                  "O treino fica marcado como cancelado. Os registos são preservados, mas não contam como treino concluído.",
                  [
                    { text: "Continuar treino", style: "cancel" },
                    {
                      text: "Cancelar treino",
                      style: "destructive",
                      onPress: () =>
                        controller.edit((w) => cancelWorkout(w, Date.now())),
                    },
                  ],
                )
              }
            />
          )}
        </>
      ) : local?.start ? (
        <>
          <Text variant="section">A preparar o treino</Text>
          <Text muted>
            O pedido está guardado. Se a ligação falhar, podes tentar novamente
            sem duplicar o treino.
          </Text>
          <Button
            label="Tentar iniciar novamente"
            loading={busy}
            onPress={() => void controller.sync()}
          />
        </>
      ) : (
        ready && (
          <>
            <Text variant="section">Sem treino em curso</Text>
            <Text muted>
              Abre um plano na área Workout e toca em Iniciar treino.
            </Text>
            <Button
              label="Procurar treino no servidor"
              loading={busy}
              onPress={() => void controller.sync()}
            />
          </>
        )
      )}
      <Button
        label="Exportar última cópia de recuperação"
        variant="secondary"
        onPress={() => void exportData(true)}
      />
      {!!shareError && <Text accessibilityRole="alert">{shareError}</Text>}
      {picker && (
        <ExercisePicker
          onClose={() => setPicker(null)}
          onSelect={(exercise) => {
            const added = freshExercise(exercise, Crypto.randomUUID);
            controller.edit((w) => ({
              ...w,
              exercises:
                picker === "add"
                  ? [...w.exercises, added]
                  : w.exercises.map((e) => (e.id === picker ? added : e)),
            }));
            setExpanded(added.id);
            setPicker(null);
          }}
        />
      )}
    </Screen>
  );
}
