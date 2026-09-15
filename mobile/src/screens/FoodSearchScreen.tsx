import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../features/auth/AuthProvider";
import { useReport } from "../features/history/useReport";
import {
  nutritionApi,
  type Food,
  type FoodSnapshot,
} from "../features/nutrition/api";
import { fmt, meals } from "../features/nutrition/helpers";
import { ErrorText, FoodAttribution } from "../features/nutrition/ui";
import { useMutation } from "../features/nutrition/useMutation";
import { theme } from "../theme";

type Results = { items: (Food | FoodSnapshot)[]; has_more: boolean };
export function FoodSearchScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "FoodSearch">) {
  const { session, user } = useAuth();
  const api = useMemo(() => nutritionApi(session), [session]);
  const [mode, setMode] = useState<"search" | "recent" | "favorites">("recent");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const mutation = useMutation();
  const { data, loading, error, reload } = useReport<Results>(
    useCallback(
      async (signal: AbortSignal) => {
        if (mode === "search")
          return query.length >= 2
            ? api.search(query, page, signal)
            : { items: [], has_more: false };
        return {
          items: await api.foods(mode === "favorites", query, signal),
          has_more: false,
        };
      },
      [api, mode, query, page, user?.id],
    ),
  );
  const submit = () => {
    Keyboard.dismiss();
    setMode("search");
    setQuery(text.trim());
    setPage(1);
    reload();
  };
  function choose(food: Food | FoodSnapshot) {
    void mutation.run(
      async () => ("id" in food ? food : api.importFood(food.source_code!)),
      (result) =>
        navigation.navigate("FoodPortion", { ...route.params, food: result }),
    );
  }
  return (
    <Screen withHeader>
      <Text variant="title">O que vais comer?</Text>
      <Text muted>
        {meals.find((meal) => meal.value === route.params.meal)?.label}
      </Text>
      <Input
        label="Pesquisar alimentos"
        placeholder="Ex.: iogurte natural, aveia, arroz…"
        value={text}
        onChangeText={setText}
        editable={!mutation.busy}
        maxLength={100}
        returnKeyType="search"
        onSubmitEditing={submit}
      />
      <Button
        label="Pesquisar"
        onPress={submit}
        disabled={text.trim().length < 2 || loading || mutation.busy}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(
          [
            { value: "recent", label: "Recentes" },
            { value: "favorites", label: "Favoritos" },
            { value: "search", label: "Resultados" },
          ] as const
        ).map((tab) => (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{
              selected: mode === tab.value,
              disabled: mutation.busy,
            }}
            disabled={mutation.busy}
            onPress={() => {
              setMode(tab.value);
              setPage(1);
              if (tab.value !== "search") {
                setQuery("");
                setText("");
              }
            }}
            style={{
              minHeight: 48,
              padding: 12,
              borderRadius: 12,
              backgroundColor:
                mode === tab.value ? theme.colors.accent : theme.colors.surface,
            }}
          >
            <Text
              style={{
                color:
                  mode === tab.value
                    ? theme.colors.onAccent
                    : theme.colors.text,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <ErrorText text={error || mutation.error} />
      {!!error && (
        <Button label="Tentar novamente" onPress={reload} disabled={loading} />
      )}
      {(loading || mutation.busy) && (
        <ActivityIndicator color={theme.colors.accent} />
      )}
      {data && !loading && (
        <>
          {!data.items.length && (
            <Text muted>
              {mode === "recent"
                ? "Os alimentos que escolheres ficam aqui para a próxima vez. Começa pela pesquisa."
                : mode === "favorites"
                  ? "Marca os teus alimentos habituais com a estrela."
                  : query.length < 2
                    ? "Escreve o nome do alimento e toca em Pesquisar."
                    : "Sem resultados com calorias e macros completos. Experimenta a marca ou outro nome."}
            </Text>
          )}
          {data.items.map((food) => (
            <Pressable
              key={"id" in food ? food.id : food.source_code}
              accessibilityRole="button"
              accessibilityLabel={`Escolher ${food.name}, ${food.brand}`}
              disabled={mutation.busy}
              onPress={() => choose(food)}
              style={({ pressed }) => ({
                paddingVertical: 16,
                gap: 4,
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed || mutation.busy ? 0.5 : 1,
              })}
            >
              <Text style={{ fontWeight: "600" }}>
                {food.name}
                {"id" in food && food.is_favorite ? " ★" : ""}
              </Text>
              {!!food.brand && <Text muted>{food.brand}</Text>}
              <Text muted>
                {fmt(food.calories)} kcal · {fmt(food.protein)} g proteína / 100{" "}
                {food.unit}
              </Text>
            </Pressable>
          ))}
          {mode === "search" && (page > 1 || data.has_more) && (
            <View style={{ gap: 8 }}>
              <Text muted>Página {page}</Text>
              {page > 1 && (
                <Button
                  label="Página anterior"
                  variant="secondary"
                  disabled={mutation.busy}
                  onPress={() => setPage((value) => value - 1)}
                />
              )}
              {data.has_more && (
                <Button
                  label="Mais resultados"
                  variant="secondary"
                  disabled={mutation.busy}
                  onPress={() => setPage((value) => value + 1)}
                />
              )}
            </View>
          )}
        </>
      )}
      {mode === "search" && <FoodAttribution />}
      <Button
        label="Não encontrei · criar alimento"
        variant="secondary"
        disabled={mutation.busy}
        onPress={() => navigation.navigate("CustomFood", route.params)}
      />
    </Screen>
  );
}
