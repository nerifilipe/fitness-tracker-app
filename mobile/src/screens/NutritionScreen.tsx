import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import { useReport } from "../features/history/useReport";
import { nutritionApi } from "../features/nutrition/api";
import { defaultMeal, fmt, meals } from "../features/nutrition/helpers";
import {
  DayPicker,
  ErrorText,
  IconButton,
  NutritionTotals,
} from "../features/nutrition/ui";
import { theme } from "../theme";

export function NutritionScreen() {
  const { session, user } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const api = useMemo(() => nutritionApi(session), [session]);
  const [date, setDate] = useState<string | null>(null);
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.diary(date, signal),
      [api, date, user?.id, user?.timezone],
    ),
  );
  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <Text variant="label" style={{ color: theme.colors.accent }}>
          NUTRIÇÃO
        </Text>
        <Text variant="title">O teu dia, à mesa.</Text>
        <Text muted>Escolhe. Ajusta a porção. Está registado.</Text>
      </View>
      <ErrorText text={error} />
      {!!error && <Button label="Tentar novamente" onPress={reload} />}
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      {data && (
        <>
          <DayPicker
            day={data.date}
            onChange={setDate}
            onToday={() => {
              setDate(null);
              reload();
            }}
          />
          <Card>
            <NutritionTotals totals={data.totals} goals={data.goals} />
            <Button
              label={
                data.goals.calories == null
                  ? "Definir objetivos"
                  : "Editar objetivos"
              }
              variant="secondary"
              onPress={() =>
                navigation.navigate("NutritionGoals", { goals: data.goals })
              }
            />
          </Card>
          <Button
            label="+ Adicionar alimento"
            onPress={() =>
              navigation.navigate("FoodSearch", {
                date: data.date,
                meal: defaultMeal(data.timezone),
              })
            }
          />
          {meals.map(({ value, label }) => {
            const rows = data.entries.filter((entry) => entry.meal === value);
            return (
              <Card key={value}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="section">{label}</Text>
                    <Text muted>
                      {fmt(
                        rows.reduce((sum, row) => sum + row.totals.calories, 0),
                      )}{" "}
                      kcal
                    </Text>
                  </View>
                  <IconButton
                    icon="add"
                    label={`Adicionar ao ${label}`}
                    onPress={() =>
                      navigation.navigate("FoodSearch", {
                        date: data.date,
                        meal: value,
                      })
                    }
                  />
                </View>
                {rows.length === 0 && <Text muted>Ainda sem alimentos.</Text>}
                {rows.map((entry) => (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar ${entry.food.name}, ${entry.quantity} ${entry.food.unit}`}
                    onPress={() =>
                      navigation.navigate("FoodPortion", {
                        date: data.date,
                        meal: entry.meal,
                        entry,
                        food: {
                          ...entry.food,
                          id: entry.food_id,
                          is_favorite: false,
                          last_quantity: entry.quantity,
                        },
                      })
                    }
                    style={({ pressed }) => ({
                      paddingVertical: 12,
                      gap: 4,
                      borderTopWidth: 1,
                      borderTopColor: theme.colors.border,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text>{entry.food.name}</Text>
                    <Text muted>
                      {fmt(entry.quantity)} {entry.food.unit} ·{" "}
                      {fmt(entry.totals.calories)} kcal ·{" "}
                      {fmt(entry.totals.protein)} g proteína
                    </Text>
                  </Pressable>
                ))}
                <Button
                  label="Repetir de outro dia"
                  variant="secondary"
                  onPress={() =>
                    navigation.navigate("MealCopy", {
                      date: data.date,
                      meal: value,
                    })
                  }
                />
              </Card>
            );
          })}
          <Text muted>
            Registos em {data.timezone}. Toca num alimento para editar ou
            remover.
          </Text>
        </>
      )}
    </Screen>
  );
}
