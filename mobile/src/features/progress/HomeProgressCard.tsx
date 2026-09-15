import { useCallback, useMemo } from "react";
import { ActivityIndicator } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { useReport } from "../history/useReport";
import { Card } from "../../components/ui/Card";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { progressApi } from "./api";
import { dateText, displayValue, numberText, unitLabel } from "./helpers";
import { theme } from "../../theme";

export function HomeProgressCard({ onPress }: { onPress: () => void }) {
  const { session, user } = useAuth();
  const units = user?.unit_system ?? "metric";
  const api = useMemo(() => progressApi(session), [session]);
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.summary(30, signal),
      [api, user?.id, user?.timezone],
    ),
  );
  const weight = data?.metrics.weight_kg;
  return (
    <Card>
      <Text variant="label" style={{ color: theme.colors.accent }}>
        PESO CORPORAL
      </Text>
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {error}
          </Text>
          <Button label="Atualizar peso" variant="secondary" onPress={reload} />
        </>
      )}
      {data &&
        (weight?.latest ? (
          <>
            <Text variant="section">
              {numberText(
                displayValue(weight.latest.value, "weight_kg", units),
              )}{" "}
              {unitLabel("weight_kg", units)}
            </Text>
            <Text muted>Último registo · {dateText(weight.latest.date)}</Text>
            {weight.change != null && (
              <Text muted>
                {weight.change > 0 ? "+" : ""}
                {numberText(
                  displayValue(weight.change, "weight_kg", units),
                )}{" "}
                {unitLabel("weight_kg", units)} entre os registos dos últimos 30
                dias.
              </Text>
            )}
          </>
        ) : (
          <Text muted>
            Regista o teu peso para começar a acompanhar a evolução.
          </Text>
        ))}
      <Button label="Abrir progresso" variant="secondary" onPress={onPress} />
    </Card>
  );
}
