import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import { templateApi } from "../features/templates/api";
import {
  addExercise,
  fromTemplate,
  move,
  toInput,
  type Draft,
} from "../features/templates/draft";
import { ExercisePicker } from "../features/templates/ExercisePicker";
import { ExercisePlanCard } from "../features/templates/ExercisePlanCard";
import type { WorkoutStackParams } from "../navigation/WorkoutNavigator";
import { theme } from "../theme";

const emptyDraft: Draft = { name: "", exercises: [] };
export function TemplateEditorScreen({
  route,
  navigation,
}: NativeStackScreenProps<WorkoutStackParams, "TemplateEditor">) {
  const { session } = useAuth();
  const api = useMemo(() => templateApi(session), [session]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState(JSON.stringify(emptyDraft));
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(!route.params.id);
  const [loading, setLoading] = useState(!!route.params.id);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== baseline;
  usePreventRemove(busy || (dirty && !savedId), ({ data }) => {
    if (saving.current) return;
    Alert.alert(
      "Sair sem guardar?",
      "As alterações deste plano serão descartadas.",
      [
        { text: "Continuar a editar", style: "cancel" },
        {
          text: "Descartar",
          style: "destructive",
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });
  useEffect(() => {
    if (!route.params.id) return;
    const controller = new AbortController();
    setLoading(true);
    setReady(false);
    setError("");
    void api
      .detail(route.params.id, controller.signal)
      .then((plan) => {
        if (controller.signal.aborted) return;
        const value = fromTemplate(plan);
        setDraft(value);
        setBaseline(JSON.stringify(value));
        setVersion(plan.version);
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
  useEffect(() => {
    if (!savedId || busy) return;
    if (route.params.id) navigation.goBack();
    else navigation.replace("TemplateDetail", { id: savedId });
  }, [savedId, busy, navigation, route.params.id]);
  async function save() {
    if (saving.current || !ready) return;
    setError("");
    try {
      const input = toInput(draft);
      saving.current = true;
      setBusy(true);
      const result = route.params.id
        ? await api.update(route.params.id, version, input)
        : await api.create(input);
      setBaseline(JSON.stringify(draft));
      setSavedId(result.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível guardar o plano.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen withHeader>
      {loading ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : !ready ? (
        <>
          <Text accessibilityRole="alert">{error}</Text>
          <Button
            label="Tentar novamente"
            onPress={() => setRetry((n) => n + 1)}
          />
        </>
      ) : (
        <>
          <Input
            label="Nome do plano"
            placeholder="Ex.: Push A"
            value={draft.name}
            maxLength={120}
            editable={!busy}
            onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
          />
          <Text muted>
            {draft.exercises.length} exercícios ·{" "}
            {draft.exercises.reduce((sum, e) => sum + e.sets.length, 0)} séries
            planeadas
          </Text>
          {!draft.exercises.length && (
            <Text muted>
              Adiciona exercícios da biblioteca. Também podes guardar o plano
              vazio e completá-lo mais tarde.
            </Text>
          )}
          {draft.exercises.map((entry, index) => (
            <ExercisePlanCard
              key={entry.key}
              entry={entry}
              index={index}
              count={draft.exercises.length}
              expanded={expanded === entry.key}
              disabled={busy}
              onToggle={() =>
                setExpanded(expanded === entry.key ? null : entry.key)
              }
              onChange={(updated) =>
                setDraft((d) => ({
                  ...d,
                  exercises: d.exercises.map((e) =>
                    e.key === entry.key ? updated : e,
                  ),
                }))
              }
              onMove={(direction) =>
                setDraft((d) => ({
                  ...d,
                  exercises: move(d.exercises, index, direction),
                }))
              }
              onRemove={() =>
                Alert.alert(
                  "Remover exercício?",
                  `As séries de ${entry.name} serão removidas deste plano.`,
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Remover",
                      style: "destructive",
                      onPress: () =>
                        setDraft((d) => ({
                          ...d,
                          exercises: d.exercises.filter(
                            (e) => e.key !== entry.key,
                          ),
                        })),
                    },
                  ],
                )
              }
            />
          ))}
          <Button
            label="Adicionar exercício"
            variant="secondary"
            disabled={busy || draft.exercises.length >= 40}
            onPress={() => setPicker(true)}
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
            label="Guardar plano"
            loading={busy}
            onPress={() => void save()}
          />
          <Text muted>
            As alterações só são guardadas quando tocas em Guardar plano.
          </Text>
        </>
      )}
      {picker && (
        <ExercisePicker
          onClose={() => setPicker(false)}
          onSelect={(exercise) => {
            const entry = addExercise(exercise);
            setDraft((d) => ({ ...d, exercises: [...d.exercises, entry] }));
            setExpanded(entry.key);
            setPicker(false);
          }}
        />
      )}
    </Screen>
  );
}
