import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../features/auth/AuthProvider";
import { nutritionApi, type Goals } from "../features/nutrition/api";
import { nutrients } from "../features/nutrition/helpers";
import { ErrorText } from "../features/nutrition/ui";
import { useMutation } from "../features/nutrition/useMutation";

export function NutritionGoalsScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "NutritionGoals">) {
  const { session } = useAuth();
  const [form, setForm] = useState(() =>
    Object.fromEntries(
      nutrients.map(({ key }) => [
        key,
        route.params.goals[key]?.toString() ?? "",
      ]),
    ),
  );
  const mutation = useMutation();
  return (
    <Screen withHeader>
      <Text variant="title">Ao teu ritmo.</Text>
      <Text muted>
        Define os teus objetivos diários. Deixa em branco o que não queres
        acompanhar. Podes registar alimentos sem definir objetivos.
      </Text>
      {nutrients.map(({ key, label, unit }) => (
        <Input
          key={key}
          label={`${label} (${unit})`}
          value={form[key]}
          editable={!mutation.busy}
          keyboardType="decimal-pad"
          maxLength={8}
          placeholder="Sem objetivo"
          onChangeText={(value) => setForm({ ...form, [key]: value })}
        />
      ))}
      <ErrorText text={mutation.error} />
      <Button
        label="Guardar objetivos"
        loading={mutation.busy}
        onPress={() =>
          void mutation.run(
            async () => {
              const goals: Goals = {};
              for (const { key, label } of nutrients) {
                const text = form[key].trim().replace(",", ".");
                if (!text) {
                  goals[key] = null;
                  continue;
                }
                const value = Number(text);
                if (
                  !/^\d+(\.\d+)?$/.test(text) ||
                  !Number.isFinite(value) ||
                  value < (key === "calories" ? 1 : 0) ||
                  value > (key === "calories" ? 20000 : 1000)
                )
                  throw new Error(
                    `Verifica o objetivo de ${label.toLowerCase()}.`,
                  );
                goals[key] = value;
              }
              return nutritionApi(session).goals(goals);
            },
            () => navigation.goBack(),
          )
        }
      />
    </Screen>
  );
}
