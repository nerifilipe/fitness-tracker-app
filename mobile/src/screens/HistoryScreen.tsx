import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { useAuth } from "../features/auth/AuthProvider";
import { reportsApi } from "../features/history/api";
import { HistoryController } from "../features/history/controller";
import { SummaryCard } from "../features/history/SummaryCard";
import { Text } from "../components/ui/Text";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { theme } from "../theme";

export function HistoryScreen({
  navigation,
}: NativeStackScreenProps<RootStackParams, "History">) {
  const { session, user } = useAuth();
  const controller = useMemo(
    () => new HistoryController(reportsApi(session)),
    [session, user?.id, user?.timezone],
  );
  const { page, loading, error } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useFocusEffect(
    useCallback(() => {
      void controller.refresh();
      return () => controller.cancel();
    }, [controller]),
  );
  return (
    <SafeAreaView
      edges={["left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={page?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: theme.space.xl,
            gap: theme.space.lg,
            width: "100%",
            maxWidth: 560,
            alignSelf: "center",
          }}
          refreshing={loading && !page}
          onRefresh={() => void controller.refresh()}
          ListHeaderComponent={
            <View style={{ gap: theme.space.md }}>
              <Text variant="title">Os teus treinos</Text>
              <Text muted>
                Treinos concluídos e sincronizados. Datas de início em{" "}
                {page?.timezone ?? user?.timezone}.
              </Text>
              <Input
                label="Desde (AAAA-MM-DD)"
                value={from}
                onChangeText={setFrom}
                maxLength={10}
                autoCapitalize="none"
                placeholder="Sem limite"
              />
              <Input
                label="Até (AAAA-MM-DD)"
                value={to}
                onChangeText={setTo}
                maxLength={10}
                autoCapitalize="none"
                placeholder="Sem limite"
              />
              <Button
                label="Aplicar datas"
                variant="secondary"
                onPress={() =>
                  void controller.refresh({ from: from.trim(), to: to.trim() })
                }
              />
              <Button
                label="Limpar filtros"
                variant="secondary"
                onPress={() => {
                  setFrom("");
                  setTo("");
                  void controller.refresh({ from: "", to: "" });
                }}
              />
            </View>
          }
          renderItem={({ item }) => (
            <SummaryCard
              summary={item}
              timezone={page!.timezone}
              onPress={() =>
                navigation.navigate("WorkoutSummary", { id: item.id })
              }
            />
          )}
          ListEmptyComponent={
            !loading && !error ? (
              <Text muted>
                Não há treinos concluídos neste intervalo. Finaliza e sincroniza
                um treino para o veres aqui.
              </Text>
            ) : null
          }
          ListFooterComponent={
            <View style={{ gap: theme.space.md }}>
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
                    onPress={() =>
                      void (page?.next_cursor
                        ? controller.more()
                        : controller.refresh())
                    }
                  />
                </>
              )}
              {loading && <ActivityIndicator color={theme.colors.accent} />}
              {!!page?.next_cursor && !error && (
                <Button
                  label="Carregar mais"
                  loading={loading}
                  variant="secondary"
                  onPress={() => void controller.more()}
                />
              )}
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
