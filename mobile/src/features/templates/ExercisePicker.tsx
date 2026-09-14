import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Text } from "../../components/ui/Text";
import { useAuth } from "../auth/AuthProvider";
import { emptyFilters, exerciseApi, type Exercise } from "../exercises/api";
import { ExerciseLibrary } from "../exercises/library";
import { theme } from "../../theme";

export function ExercisePicker({
  onSelect,
  onClose,
}: {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const library = useMemo(
    () => new ExerciseLibrary(exerciseApi(session)),
    [session],
  );
  const state = useSyncExternalStore(library.subscribe, library.getSnapshot);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(false);
  useEffect(() => {
    library.cancel();
    const timer = setTimeout(
      () =>
        void library.load({
          ...emptyFilters,
          q: query,
          mode: favorites ? "favorites" : "all",
        }),
      250,
    );
    return () => {
      clearTimeout(timer);
      library.cancel();
    };
  }, [library, query, favorites]);
  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text variant="section" accessibilityRole="header">
            Adicionar exercício
          </Text>
          <Input
            label="Pesquisar na biblioteca"
            value={query}
            onChangeText={setQuery}
            maxLength={120}
          />
          <Button
            label={favorites ? "Mostrar todos" : "Só favoritos"}
            variant="secondary"
            onPress={() => setFavorites((v) => !v)}
          />
        </View>
        <FlatList
          data={state.items}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Adicionar ${item.name}`}
              onPress={() => onSelect(item)}
              style={styles.row}
            >
              <Text>{item.name}</Text>
              <Text muted>
                {item.primary_muscle.name}
                {item.is_custom ? " · Pessoal" : ""}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            !state.loading && !state.error ? (
              <Text muted style={styles.header}>
                Sem exercícios para esta pesquisa.
              </Text>
            ) : null
          }
          ListFooterComponent={
            <View style={styles.header}>
              {(state.loading || state.loadingMore) && (
                <ActivityIndicator color={theme.colors.accent} />
              )}
              {!!state.error && (
                <>
                  <Text accessibilityRole="alert">{state.error}</Text>
                  <Button
                    label="Tentar novamente"
                    onPress={() => void library.load(undefined, !!state.cursor)}
                  />
                </>
              )}
              {!!state.cursor && !state.error && (
                <Button
                  label="Carregar mais"
                  variant="secondary"
                  loading={state.loadingMore}
                  onPress={() => void library.load(undefined, true)}
                />
              )}
            </View>
          }
        />
        <View style={styles.header}>
          <Button label="Fechar" variant="secondary" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: theme.space.lg, gap: theme.space.md },
  row: {
    padding: theme.space.lg,
    gap: theme.space.xs,
    minHeight: theme.minTouchTarget,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
});
