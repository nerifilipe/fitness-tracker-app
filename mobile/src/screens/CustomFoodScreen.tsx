import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { ChoiceField } from "../components/ui/ChoiceField";
import { useAuth } from "../features/auth/AuthProvider";
import { nutritionApi, type FoodInput } from "../features/nutrition/api";
import { nutrients } from "../features/nutrition/helpers";
import { ErrorText } from "../features/nutrition/ui";
import { useMutation } from "../features/nutrition/useMutation";

export function CustomFoodScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "CustomFood">) {
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"g" | "ml">("g");
  const [form, setForm] = useState<Record<string, string>>({
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  });
  const mutation = useMutation();
  return (
    <Screen withHeader>
      <Text variant="title">Guardar uma vez.</Text>
      <Text muted>
        Para um alimento que não aparece na pesquisa. Usa os valores da
        embalagem por 100 {unit}; depois fica nos teus recentes.
      </Text>
      <Input
        label="Nome"
        value={name}
        onChangeText={setName}
        maxLength={200}
        editable={!mutation.busy}
      />
      <ChoiceField
        label="Valores por"
        value={unit}
        onChange={(value) => setUnit(value as "g" | "ml")}
        disabled={mutation.busy}
        options={[
          { value: "g", label: "100 g" },
          { value: "ml", label: "100 ml" },
        ]}
      />
      {nutrients.map(({ key, label, unit: macroUnit }) => (
        <Input
          key={key}
          label={`${label} (${macroUnit})`}
          value={form[key]}
          onChangeText={(value) => setForm({ ...form, [key]: value })}
          keyboardType="decimal-pad"
          editable={!mutation.busy}
          maxLength={8}
        />
      ))}
      <ErrorText text={mutation.error} />
      <Button
        label="Guardar e escolher porção"
        disabled={!name.trim()}
        loading={mutation.busy}
        onPress={() =>
          void mutation.run(
            async () => {
              const values: Record<string, number> = {};
              for (const { key, label } of nutrients) {
                const text = form[key].trim().replace(",", ".");
                const value = Number(text);
                if (
                  !/^\d+(\.\d+)?$/.test(text) ||
                  !Number.isFinite(value) ||
                  value < 0 ||
                  value > (key === "calories" ? 1000 : 100)
                )
                  throw new Error(
                    `Preenche ${label.toLowerCase()} por 100 ${unit}. Usa 0 apenas se a embalagem indicar zero.`,
                  );
                values[key] = value;
              }
              return nutritionApi(session).custom({
                name: name.trim(),
                unit,
                ...values,
              } as FoodInput);
            },
            (food) =>
              navigation.replace("FoodPortion", { ...route.params, food }),
          )
        }
      />
    </Screen>
  );
}
