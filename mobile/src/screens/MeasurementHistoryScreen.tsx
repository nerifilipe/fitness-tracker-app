import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuth } from "../features/auth/AuthProvider";
import { useReport } from "../features/history/useReport";
import { progressApi } from "../features/progress/api";
import {
  dateText,
  displayValue,
  metrics,
  numberText,
  unitLabel,
} from "../features/progress/helpers";
import { theme } from "../theme";

export function MeasurementHistoryScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "MeasurementHistory">) {
  const { session, user } = useAuth();
  const units = user?.unit_system ?? "metric";
  const api = useMemo(() => progressApi(session), [session]);
  const [pages, setPages] = useState<string[]>([]);
  const before = pages.at(-1) ?? null;
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.history(before, signal),
      [api, before, user?.id],
    ),
  );
  return (
    <Screen withHeader key={before ?? "first"}>
      <Text variant="title">Os teus registos.</Text>
      <Button
        label="+ Registar outro dia"
        onPress={() =>
          navigation.navigate("MeasurementEditor", {
            date: route.params.today,
            today: route.params.today,
          })
        }
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
            <Text muted>Ainda não há registos nesta página.</Text>
          )}
          {data.items.map((record) => (
            <Card key={record.date}>
              <Text variant="section">{dateText(record.date)}</Text>
              {metrics.map(({ key, label }) =>
                record[key] == null ? null : (
                  <Text key={key}>
                    {label}: {numberText(displayValue(record[key], key, units))}{" "}
                    {unitLabel(key, units)}
                  </Text>
                ),
              )}
              {!!record.notes && <Text muted>{record.notes}</Text>}
              <Button
                label="Editar registo"
                accessibilityLabel={`Editar registo de ${dateText(record.date)}`}
                variant="secondary"
                onPress={() =>
                  navigation.navigate("MeasurementEditor", {
                    date: record.date,
                    today: route.params.today,
                  })
                }
              />
            </Card>
          ))}
          {!!data.next_before && (
            <Button
              label="Mais antigos"
              variant="secondary"
              onPress={() => setPages((value) => [...value, data.next_before!])}
            />
          )}
        </>
      )}
      {!!pages.length && (
        <Button
          label="Mais recentes"
          variant="secondary"
          disabled={loading}
          onPress={() => setPages((value) => value.slice(0, -1))}
        />
      )}
    </Screen>
  );
}
