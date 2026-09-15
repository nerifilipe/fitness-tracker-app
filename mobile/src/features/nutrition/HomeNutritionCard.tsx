import { useCallback, useMemo } from "react";
import { ActivityIndicator } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { useReport } from "../history/useReport";
import { nutritionApi } from "./api";
import { fmt } from "./helpers";
import { Card } from "../../components/ui/Card";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "./ui";
import { theme } from "../../theme";

export function HomeNutritionCard({ onPress }: { onPress: () => void }) {
  const { session, user } = useAuth();
  const api = useMemo(() => nutritionApi(session), [session]);
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.diary(null, signal),
      [api, user?.id, user?.timezone],
    ),
  );
  return (
    <Card>
      <Text variant="label" style={{ color: theme.colors.accent }}>
        NUTRIÇÃO · HOJE
      </Text>
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      <ErrorText text={error} />
      {!!error && (
        <Button
          label="Atualizar nutrição"
          variant="secondary"
          onPress={reload}
        />
      )}
      {data && (
        <>
          <Text variant="section">
            {fmt(data.totals.calories)}
            {data.goals.calories != null
              ? ` / ${fmt(data.goals.calories)}`
              : ""}{" "}
            kcal
          </Text>
          <Text muted>
            {fmt(data.totals.protein)}
            {data.goals.protein != null
              ? ` / ${fmt(data.goals.protein)}`
              : ""}{" "}
            g de proteína
          </Text>
          {!data.entries.length && (
            <Text muted>Regista a primeira refeição do dia.</Text>
          )}
        </>
      )}
      <Button
        label="Abrir diário alimentar"
        variant="secondary"
        onPress={onPress}
      />
    </Card>
  );
}
