import { useState } from "react";
import { Alert, View } from "react-native";
import * as Crypto from "expo-crypto";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Text } from "../components/ui/Text";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { ChoiceField } from "../components/ui/ChoiceField";
import { useAuth } from "../features/auth/AuthProvider";
import { nutritionApi, type Meal } from "../features/nutrition/api";
import {
  amount,
  dateLabel,
  fmt,
  meals,
  portionValues,
} from "../features/nutrition/helpers";
import {
  ErrorText,
  FoodAttribution,
  IconButton,
  NutritionTotals,
} from "../features/nutrition/ui";
import { useMutation } from "../features/nutrition/useMutation";

export function FoodPortionScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "FoodPortion">) {
  const { food, entry, date } = route.params;
  const { session } = useAuth();
  const api = nutritionApi(session);
  const [entryId] = useState(() => entry?.id ?? Crypto.randomUUID());
  const [quantity, setQuantity] = useState(
    String(
      entry?.quantity ?? food.last_quantity ?? food.serving_quantity ?? 100,
    ),
  );
  const [meal, setMeal] = useState<Meal>(route.params.meal);
  const [favorite, setFavorite] = useState(food.is_favorite);
  const mutation = useMutation();
  let value = 0;
  try {
    value = amount(quantity);
  } catch {
    /* The field can be empty while typing. */
  }
  const done = () => navigation.popTo("Main", { screen: "Nutrition" });
  function remove() {
    Alert.alert("Remover alimento?", `${food.name} será removido deste dia.`, [
      { text: "Manter", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => void mutation.run(() => api.remove(entryId), done),
      },
    ]);
  }
  return (
    <Screen withHeader>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Text variant="title">{food.name}</Text>
          {!!food.brand && <Text muted>{food.brand}</Text>}
        </View>
        {!entry && (
          <IconButton
            icon={favorite ? "star" : "star-outline"}
            label={favorite ? "Remover dos favoritos" : "Guardar nos favoritos"}
            disabled={mutation.busy}
            onPress={() =>
              void mutation.run(
                () => api.favorite(food.id, !favorite),
                (result) => setFavorite(result.is_favorite),
              )
            }
          />
        )}
      </View>
      <Text muted>{dateLabel(date)}</Text>
      <ChoiceField
        label="Refeição"
        options={meals}
        value={meal}
        disabled={mutation.busy}
        onChange={(value) => setMeal(value as Meal)}
      />
      <Input
        label={`Quantidade (${food.unit})`}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        maxLength={12}
        editable={!mutation.busy}
        hint={
          food.serving_quantity
            ? `Porção indicada: ${food.serving_label ?? `${fmt(food.serving_quantity)} ${food.unit}`}`
            : `Valores calculados por 100 ${food.unit}. Ajusta à quantidade que vais consumir.`
        }
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(food.serving_quantity ? [0.5, 1, 2] : [50, 100, 150, 200]).map(
          (preset) => (
            <Button
              key={preset}
              label={
                food.serving_quantity
                  ? `${fmt(preset)} ${preset === 1 ? "porção" : "porções"}`
                  : `${preset} ${food.unit}`
              }
              variant="secondary"
              disabled={mutation.busy}
              onPress={() =>
                setQuantity(
                  String(
                    Number(
                      (food.serving_quantity
                        ? preset * food.serving_quantity
                        : preset
                      ).toFixed(3),
                    ),
                  ),
                )
              }
            />
          ),
        )}
      </View>
      {value > 0 && (
        <Card>
          <Text variant="label">NESTA QUANTIDADE</Text>
          <NutritionTotals totals={portionValues(food, value)} />
        </Card>
      )}
      <ErrorText text={mutation.error} />
      <Button
        label={entry ? "Guardar alterações" : "Adicionar à refeição"}
        loading={mutation.busy}
        disabled={!value}
        onPress={() =>
          void mutation.run(
            () =>
              api.save(entryId, {
                food_id: food.id,
                date,
                meal,
                quantity: amount(quantity),
              }),
            done,
          )
        }
      />
      {entry && (
        <Button
          label="Remover alimento"
          variant="secondary"
          disabled={mutation.busy}
          onPress={remove}
        />
      )}
      {food.source === "openfoodfacts" && (
        <FoodAttribution code={food.source_code} />
      )}
    </Screen>
  );
}
