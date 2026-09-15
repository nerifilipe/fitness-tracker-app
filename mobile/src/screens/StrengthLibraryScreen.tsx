import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Keyboard } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Text } from "../components/ui/Text";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../features/auth/AuthProvider";
import { useReport } from "../features/history/useReport";
import { strengthApi } from "../features/progress/strengthApi";
import { sessionDate } from "../features/progress/strengthHelpers";
import { theme } from "../theme";

export function StrengthLibraryScreen({
  navigation,
}: NativeStackScreenProps<RootStackParams, "StrengthLibrary">) {
  const { session, user } = useAuth();
  const api = useMemo(() => strengthApi(session), [session]);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages.at(-1) ?? null;
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.exercises(q, cursor, signal),
      [api, q, cursor, user?.id],
    ),
  );
  const search = () => {
    Keyboard.dismiss();
    setQ(text.trim());
    setPages([]);
    reload();
  };
  return (
    <Screen withHeader key={`${q}:${cursor}`}>
      <Text variant="title">A tua força, em perspetiva.</Text>
      <Text muted>Escolhe um exercício dos teus treinos concluídos.</Text>
      <Input
        label="Pesquisar exercício"
        value={text}
        onChangeText={setText}
        maxLength={120}
        placeholder="Ex.: Bench Press"
        returnKeyType="search"
        onSubmitEditing={search}
      />
      <Button
        label="Pesquisar"
        variant="secondary"
        disabled={loading}
        onPress={search}
      />
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {error}
          </Text>
          <Button label="Tentar novamente" onPress={reload} />
        </>
      )}
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      {data && !loading && (
        <>
          {!data.items.length && (
            <Text muted>
              {q
                ? "Sem exercícios com este nome no teu histórico."
                : "Ainda não tens séries de trabalho concluídas. Finaliza e sincroniza um treino para veres a evolução aqui."}
            </Text>
          )}
          {data.items.map((exercise) => (
            <Card key={exercise.id}>
              <Text variant="section">{exercise.name}</Text>
              <Text muted>
                {exercise.sessions}{" "}
                {exercise.sessions === 1 ? "sessão" : "sessões"} · Última:{" "}
                {sessionDate(
                  exercise.last_trained,
                  user?.timezone ?? "Europe/Lisbon",
                )}
              </Text>
              <Button
                label="Ver evolução"
                accessibilityLabel={`Ver evolução de ${exercise.name}`}
                variant="secondary"
                onPress={() =>
                  navigation.navigate("ExerciseStrength", { id: exercise.id })
                }
              />
            </Card>
          ))}
          {!!data.next_cursor && (
            <Button
              label="Mais exercícios"
              variant="secondary"
              onPress={() => setPages((value) => [...value, data.next_cursor!])}
            />
          )}
        </>
      )}
      {!!pages.length && (
        <Button
          label="Página anterior"
          variant="secondary"
          disabled={loading}
          onPress={() => setPages((value) => value.slice(0, -1))}
        />
      )}
    </Screen>
  );
}
