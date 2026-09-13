import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { usePreventRemove } from "@react-navigation/native";
import { Button } from "../components/ui/Button";
import { ChoiceField } from "../components/ui/ChoiceField";
import { Input } from "../components/ui/Input";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import {
  exerciseApi,
  type ExerciseInput,
  type Muscle,
} from "../features/exercises/api";
import {
  choices,
  conventions,
  conventionLabels,
  equipmentLabels,
  loadLabels,
} from "../features/exercises/labels";
import type { WorkoutStackParams } from "../navigation/WorkoutNavigator";
import { theme } from "../theme";

const initial: ExerciseInput = {
  name: "",
  equipment: "dumbbell",
  load_type: "external",
  load_convention: "per_hand",
  primary_muscle_id: "",
  secondary_muscle_ids: [],
  instructions: "",
};

export function ExerciseEditorScreen({
  route,
  navigation,
}: NativeStackScreenProps<WorkoutStackParams, "ExerciseEditor">) {
  const { session } = useAuth();
  const api = useMemo(() => exerciseApi(session), [session]);
  const [form, setForm] = useState<ExerciseInput>(initial);
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  usePreventRemove(busy, () => {});
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setReady(false);
    setError("");
    void Promise.all([
      api.muscles(controller.signal),
      route.params.id
        ? api.detail(route.params.id, controller.signal)
        : Promise.resolve(null),
    ])
      .then(([groups, exercise]) => {
        if (controller.signal.aborted) return;
        if (exercise) {
          if (!exercise.is_custom)
            throw new Error("Este exercício pertence ao catálogo.");
          setForm({
            name: exercise.name,
            equipment: exercise.equipment,
            load_type: exercise.load_type,
            load_convention: exercise.load_convention,
            primary_muscle_id: exercise.primary_muscle.id,
            secondary_muscle_ids: exercise.secondary_muscles.map(
              (muscle) => muscle.id,
            ),
            instructions: exercise.instructions ?? "",
          });
        }
        setMuscles(groups);
        setReady(true);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, route.params.id, retry]);
  async function save() {
    if (busy) return;
    if (
      !form.name.trim() ||
      !form.primary_muscle_id ||
      (form.secondary_muscle_ids?.length ?? 0) > 8
    ) {
      setError(
        "Indica o nome, um músculo principal e até 8 músculos secundários.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await api.save(
        {
          ...form,
          name: form.name.trim(),
          instructions: form.instructions?.trim() || null,
        },
        route.params.id,
      );
      setBusy(false);
      // Defer navigation until React has removed the saving guard.
      setSavedId(saved.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível guardar.",
      );
      setBusy(false);
    }
  }
  const [savedId, setSavedId] = useState<string | null>(null);
  useEffect(() => {
    if (savedId && !busy) {
      if (route.params.id) navigation.goBack();
      else navigation.replace("ExerciseDetail", { id: savedId });
    }
  }, [savedId, busy, navigation, route.params.id]);
  return (
    <Screen withHeader>
      {loading ? (
        <ActivityIndicator
          color={theme.colors.accent}
          accessibilityLabel="A preparar formulário"
        />
      ) : !ready || !muscles.length ? (
        <>
          <Text muted>
            {error || "A biblioteca ainda não está disponível."}
          </Text>
          <Button
            label="Tentar novamente"
            onPress={() => setRetry((value) => value + 1)}
          />
        </>
      ) : (
        <>
          <Text muted>Este exercício fica disponível apenas na tua conta.</Text>
          <Input
            label="Nome do exercício"
            value={form.name}
            onChangeText={(name) =>
              setForm((previous) => ({ ...previous, name }))
            }
            maxLength={120}
            editable={!busy}
          />
          <ChoiceField
            label="Músculo principal"
            value={form.primary_muscle_id}
            options={muscles.map((muscle) => ({
              value: muscle.id,
              label: muscle.name,
            }))}
            disabled={busy}
            onChange={(primary_muscle_id) =>
              setForm((previous) => ({
                ...previous,
                primary_muscle_id,
                secondary_muscle_ids: previous.secondary_muscle_ids?.filter(
                  (id) => id !== primary_muscle_id,
                ),
              }))
            }
          />
          <ChoiceField
            label="Músculos secundários (opcional)"
            multiple
            value={form.secondary_muscle_ids ?? []}
            options={muscles
              .filter((muscle) => muscle.id !== form.primary_muscle_id)
              .map((muscle) => ({ value: muscle.id, label: muscle.name }))}
            disabled={busy}
            onChange={(secondary_muscle_ids) =>
              setForm((previous) => ({ ...previous, secondary_muscle_ids }))
            }
          />
          <ChoiceField
            label="Equipamento"
            value={form.equipment}
            options={choices(equipmentLabels)}
            disabled={busy}
            onChange={(equipment) =>
              setForm((previous) => ({
                ...previous,
                equipment: equipment as ExerciseInput["equipment"],
              }))
            }
          />
          <ChoiceField
            label="Tipo de carga"
            value={form.load_type}
            options={choices(loadLabels)}
            disabled={busy}
            onChange={(value) => {
              const load_type = value as ExerciseInput["load_type"];
              setForm((previous) => ({
                ...previous,
                load_type,
                load_convention: conventions[load_type][0],
              }));
            }}
          />
          <ChoiceField
            label="Como registar o peso"
            value={form.load_convention}
            options={conventions[form.load_type].map((value) => ({
              value,
              label: conventionLabels[value],
            }))}
            disabled={busy}
            onChange={(load_convention) =>
              setForm((previous) => ({
                ...previous,
                load_convention:
                  load_convention as ExerciseInput["load_convention"],
              }))
            }
          />
          <Input
            label="Notas e instruções (opcional)"
            multiline
            value={form.instructions ?? ""}
            onChangeText={(instructions) =>
              setForm((previous) => ({ ...previous, instructions }))
            }
            maxLength={3000}
            editable={!busy}
          />
          {!!error && (
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.error }}
            >
              {error}
            </Text>
          )}
          <Button
            label="Guardar exercício"
            onPress={() => void save()}
            loading={busy}
          />
        </>
      )}
    </Screen>
  );
}
