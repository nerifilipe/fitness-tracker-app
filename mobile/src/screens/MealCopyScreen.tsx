import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import * as Crypto from "expo-crypto";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ChoiceField } from "../components/ui/ChoiceField";
import { useAuth } from "../features/auth/AuthProvider";
import { useReport } from "../features/history/useReport";
import {
  nutritionApi,
  type Meal,
  type MealCopy,
} from "../features/nutrition/api";
import { dateLabel, fmt, meals, shiftDay } from "../features/nutrition/helpers";
import { DayPicker, ErrorText } from "../features/nutrition/ui";
import { useMutation } from "../features/nutrition/useMutation";
import { theme } from "../theme";

export function MealCopyScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "MealCopy">) {
  const { session } = useAuth();
  const api = useMemo(() => nutritionApi(session), [session]);
  const [sourceDate, setSourceDate] = useState(shiftDay(route.params.date, -1));
  const [meal, setMeal] = useState<Meal>(route.params.meal);
  const mutation = useMutation();
  const pending = useRef<{ id: string; body: MealCopy } | null>(null);
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.diary(sourceDate, signal),
      [api, sourceDate],
    ),
  );
  const entries = data?.entries.filter((entry) => entry.meal === meal) ?? [];
  const [retrying, setRetrying] = useState(false);
  return (
    <Screen withHeader>
      <Text variant="title">Repetir uma refeição</Text>
      <Text muted>
        Escolhe a origem. Os alimentos e as quantidades serão adicionados a{" "}
        {meals
          .find((item) => item.value === route.params.meal)
          ?.label.toLowerCase()}{" "}
        de {dateLabel(route.params.date)}.
      </Text>
      <DayPicker
        day={sourceDate}
        disabled={mutation.busy || retrying}
        onChange={setSourceDate}
      />
      <ChoiceField
        label="Refeição de origem"
        options={meals}
        value={meal}
        disabled={mutation.busy || retrying}
        onChange={(value) => setMeal(value as Meal)}
      />
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      <ErrorText text={error || mutation.error} />
      {!!error && <Button label="Tentar carregar novamente" onPress={reload} />}
      {data && !loading && (
        <>
          {!entries.length && (
            <Text muted>
              Sem alimentos nesta refeição. Escolhe outro dia ou outra refeição.
            </Text>
          )}
          {entries.map((entry) => (
            <Card key={entry.id}>
              <Text>{entry.food.name}</Text>
              <Text muted>
                {fmt(entry.quantity)} {entry.food.unit} ·{" "}
                {fmt(entry.totals.calories)} kcal
              </Text>
            </Card>
          ))}
          {retrying && (
            <Text muted>
              Se a ligação falhou, repete a tentativa para confirmar esta cópia
              sem duplicar alimentos.
            </Text>
          )}
          <Button
            label={
              retrying
                ? "Confirmar a mesma cópia"
                : `Adicionar ${entries.length} ${entries.length === 1 ? "alimento" : "alimentos"}`
            }
            disabled={!entries.length}
            loading={mutation.busy}
            onPress={() =>
              void mutation.run(
                async () => {
                  pending.current ??= {
                    id: Crypto.randomUUID(),
                    body: {
                      source_date: sourceDate,
                      source_meal: meal,
                      target_date: route.params.date,
                      target_meal: route.params.meal,
                    },
                  };
                  setRetrying(true);
                  return api.copy(pending.current.id, pending.current.body);
                },
                () => navigation.goBack(),
              )
            }
          />
        </>
      )}
    </Screen>
  );
}
