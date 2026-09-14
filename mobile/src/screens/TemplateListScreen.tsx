import { useCallback, useMemo, useRef, useState } from "react";
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
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import { templateApi, type TemplatePage } from "../features/templates/api";
import type { WorkoutStackParams } from "../navigation/WorkoutNavigator";
import { theme } from "../theme";

export function TemplateListScreen({
  navigation,
}: NativeStackScreenProps<WorkoutStackParams, "TemplateList">) {
  const { session } = useAuth();
  const api = useMemo(() => templateApi(session), [session]);
  const [page, setPage] = useState<TemplatePage>({
    items: [],
    next_offset: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(
    async (offset = 0) => {
      if (offset && pending.current) return;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setLoading(true);
      setError("");
      if (!offset) setPage({ items: [], next_offset: null });
      try {
        const result = await api.list(offset, controller.signal);
        if (controller.signal.aborted) return;
        setPage((previous) => ({
          ...result,
          items: offset
            ? [
                ...new Map(
                  [...previous.items, ...result.items].map((p) => [p.id, p]),
                ).values(),
              ]
            : result.items,
        }));
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar os planos.",
          );
      } finally {
        if (!controller.signal.aborted) {
          pending.current = null;
          setLoading(false);
        }
      }
    },
    [api],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        pending.current?.abort();
        pending.current = null;
      };
    }, [load]),
  );
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <FlatList
        data={page.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshing={loading && !page.items.length}
        onRefresh={() => void load()}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="label" style={{ color: theme.colors.accent }}>
              WORKOUT / PLANOS
            </Text>
            <Text variant="title" accessibilityRole="header">
              O teu próximo treino
            </Text>
            <Text muted>
              Organiza os exercícios e define as séries para chegares ao ginásio
              com um plano.
            </Text>
            <Button
              label="Criar plano"
              onPress={() => navigation.navigate("TemplateEditor", {})}
            />
            <Button
              label="Biblioteca de exercícios"
              variant="secondary"
              onPress={() => navigation.navigate("ExerciseLibrary")}
            />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Abrir plano ${item.name}`}
            onPress={() =>
              navigation.navigate("TemplateDetail", { id: item.id })
            }
          >
            <Card>
              <Text variant="section">{item.name}</Text>
              <Text muted>
                {item.exercise_count} exercícios · {item.set_count} séries
              </Text>
              <Text style={{ color: theme.colors.accent }}>Ver plano →</Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <Card>
              <Text variant="section">O primeiro plano começa aqui</Text>
              <Text muted>
                Cria um Push A, um treino de pernas ou a tua rotina de corpo
                inteiro.
              </Text>
            </Card>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.header}>
            {loading && <ActivityIndicator color={theme.colors.accent} />}
            {!!error && (
              <>
                <Text
                  accessibilityRole="alert"
                  style={{ color: theme.colors.error }}
                >
                  {error}
                </Text>
                <Button
                  label="Tentar novamente"
                  onPress={() => void load(page.next_offset ?? 0)}
                />
              </>
            )}
            {page.next_offset !== null && !error && (
              <Button
                label="Carregar mais planos"
                variant="secondary"
                loading={loading}
                onPress={() => void load(page.next_offset!)}
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
    paddingBottom: theme.space.section,
    gap: theme.space.lg,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  header: { gap: theme.space.lg },
});
