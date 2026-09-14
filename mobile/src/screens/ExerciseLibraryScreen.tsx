import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button } from "../components/ui/Button";
import { ChoiceField } from "../components/ui/ChoiceField";
import { Input } from "../components/ui/Input";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import {
  emptyFilters,
  exerciseApi,
  type Filters,
  type Muscle,
} from "../features/exercises/api";
import { ExerciseLibrary } from "../features/exercises/library";
import { choices, equipmentLabels } from "../features/exercises/labels";
import type { WorkoutStackParams } from "../navigation/WorkoutNavigator";
import { theme } from "../theme";

export function ExerciseLibraryScreen({
  navigation,
}: NativeStackScreenProps<WorkoutStackParams, "ExerciseLibrary">) {
  const { session } = useAuth();
  const api = useMemo(() => exerciseApi(session), [session]);
  const library = useMemo(() => new ExerciseLibrary(api), [api]);
  const state = useSyncExternalStore(
    library.subscribe,
    library.getSnapshot,
    library.getSnapshot,
  );
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [muscleError, setMuscleError] = useState(false);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilters((previous) =>
          previous.q === query ? previous : { ...previous, q: query },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [query]);
  useFocusEffect(
    useCallback(() => {
      void library.load(filters);
      return library.cancel;
    }, [library, filters]),
  );
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      setMuscleError(false);
      void api
        .muscles(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setMuscles(value);
        })
        .catch(() => {
          if (!controller.signal.aborted) setMuscleError(true);
        });
      return () => controller.abort();
    }, [api]),
  );
  function reset() {
    setQuery("");
    setFilters(emptyFilters);
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.screen}>
      <FlatList
        data={state.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshing={state.loading}
        onRefresh={() => void library.load(filters)}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="label" style={styles.accent}>
              A TUA BIBLIOTECA
            </Text>
            <Text variant="title" accessibilityRole="header">
              Exercícios
            </Text>
            <Text muted>Encontra os teus essenciais. Guarda os favoritos.</Text>
            <Button
              label="Criar exercício"
              onPress={() => navigation.navigate("ExerciseEditor", {})}
            />
            <Input
              label="Pesquisar"
              placeholder="Ex.: dumbbell press"
              value={query}
              onChangeText={setQuery}
              maxLength={120}
              autoCorrect={false}
              returnKeyType="search"
            />
            <View style={styles.modes}>
              {(
                [
                  ["all", "Todos"],
                  ["favorites", "Favoritos"],
                  ["custom", "Meus"],
                ] as const
              ).map(([mode, label]) => (
                <Pressable
                  key={mode}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: filters.mode === mode }}
                  onPress={() =>
                    setFilters((previous) => ({ ...previous, mode }))
                  }
                  style={[
                    styles.mode,
                    filters.mode === mode && styles.selected,
                  ]}
                >
                  <Text>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showFilters }}
              style={styles.filterButton}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Ionicons
                name="options-outline"
                size={20}
                color={theme.colors.accent}
              />
              <Text style={styles.accent}>
                Filtros{filters.muscle_id || filters.equipment ? " ativos" : ""}
              </Text>
            </Pressable>
            {showFilters && (
              <>
                <ChoiceField
                  label="Músculo principal"
                  value={filters.muscle_id}
                  onChange={(muscle_id) =>
                    setFilters((previous) => ({ ...previous, muscle_id }))
                  }
                  options={[
                    { value: "", label: "Todos os músculos" },
                    ...muscles.map((muscle) => ({
                      value: muscle.id,
                      label: muscle.name,
                    })),
                  ]}
                />
                {muscleError && (
                  <Text muted>
                    Não foi possível carregar os músculos. Volta a abrir esta
                    área para tentar novamente.
                  </Text>
                )}
                <ChoiceField
                  label="Equipamento"
                  value={filters.equipment}
                  onChange={(equipment) =>
                    setFilters((previous) => ({ ...previous, equipment }))
                  }
                  options={[
                    { value: "", label: "Todos os equipamentos" },
                    ...choices(equipmentLabels),
                  ]}
                />
                <Button
                  label="Limpar filtros"
                  variant="secondary"
                  onPress={reset}
                />
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.primary_muscle.name}${item.is_favorite ? ", favorito" : ""}`}
            onPress={() =>
              navigation.navigate("ExerciseDetail", { id: item.id })
            }
            style={styles.row}
          >
            <View style={styles.rowText}>
              <Text variant="section">{item.name}</Text>
              <Text muted>
                {item.primary_muscle.name} · {equipmentLabels[item.equipment]}
              </Text>
              {item.is_custom && (
                <Text variant="label" style={styles.accent}>
                  PERSONALIZADO
                </Text>
              )}
            </View>
            <Ionicons
              name={item.is_favorite ? "star" : "chevron-forward"}
              size={20}
              color={
                item.is_favorite ? theme.colors.accent : theme.colors.muted
              }
            />
          </Pressable>
        )}
        ListEmptyComponent={
          !state.loading && !state.error ? (
            <View style={styles.empty}>
              <Text variant="section">Nenhum exercício encontrado</Text>
              <Text muted>Ajusta os filtros ou cria um exercício teu.</Text>
              <Button
                label="Mostrar todos"
                variant="secondary"
                onPress={reset}
              />
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {state.loading && (
              <ActivityIndicator
                color={theme.colors.accent}
                accessibilityLabel="A carregar exercícios"
              />
            )}
            {!!state.error && (
              <>
                <Text accessibilityRole="alert" style={styles.error}>
                  {state.error}
                </Text>
                <Button
                  label="Tentar novamente"
                  onPress={() =>
                    void library.load(filters, state.items.length > 0)
                  }
                />
              </>
            )}
            {!state.error && !!state.cursor && (
              <Button
                label="Carregar mais"
                variant="secondary"
                loading={state.loadingMore}
                onPress={() => void library.load(filters, true)}
              />
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.space.xl,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  header: { gap: theme.space.lg, marginBottom: theme.space.xl },
  accent: { color: theme.colors.accent },
  modes: { flexDirection: "row", gap: theme.space.sm },
  mode: {
    flex: 1,
    minHeight: theme.minTouchTarget,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
  },
  filterButton: {
    flexDirection: "row",
    gap: theme.space.sm,
    alignItems: "center",
    minHeight: theme.minTouchTarget,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    padding: theme.space.lg,
    marginBottom: theme.space.md,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowText: { flex: 1, gap: theme.space.xs },
  empty: { gap: theme.space.lg, paddingVertical: theme.space.xl },
  footer: { gap: theme.space.lg, paddingVertical: theme.space.xl },
  error: { color: theme.colors.error },
});
