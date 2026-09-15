import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { Button } from "../components/ui/Button";
import { useAuth } from "../features/auth/AuthProvider";
import { useReport } from "../features/history/useReport";
import { strengthApi } from "../features/progress/strengthApi";
import { groupLabel } from "../features/progress/strengthHelpers";
import { StrengthSessionCard } from "../features/progress/StrengthSessionCard";
import { theme } from "../theme";

export function StrengthHistoryScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "StrengthHistory">) {
  const { id, name, group } = route.params;
  const { session, user } = useAuth();
  const api = useMemo(() => strengthApi(session), [session]);
  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages.at(-1) ?? null;
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.history(id, group, cursor, signal),
      [api, id, group, cursor, user?.id],
    ),
  );
  return (
    <Screen withHeader key={cursor ?? "first"}>
      <Text variant="title">{name}</Text>
      <Text muted>{groupLabel(group)}</Text>
      <Text muted>Séries de trabalho concluídas. Todo o histórico.</Text>
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
          {!data.items.length && <Text muted>Sem sessões nesta página.</Text>}
          {data.items.map((row) => (
            <StrengthSessionCard
              key={row.workout_id}
              session={row}
              group={group}
              units={user?.unit_system ?? "metric"}
              timezone={user?.timezone ?? "Europe/Lisbon"}
              onOpen={() =>
                navigation.navigate("WorkoutSummary", { id: row.workout_id })
              }
            />
          ))}
          {!!data.next_cursor && (
            <Button
              label="Sessões mais antigas"
              variant="secondary"
              onPress={() => setPages((value) => [...value, data.next_cursor!])}
            />
          )}
        </>
      )}
      {!!pages.length && (
        <Button
          label="Sessões mais recentes"
          variant="secondary"
          disabled={loading}
          onPress={() => setPages((value) => value.slice(0, -1))}
        />
      )}
    </Screen>
  );
}
