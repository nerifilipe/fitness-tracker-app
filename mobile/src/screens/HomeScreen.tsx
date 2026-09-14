import { StyleSheet, View } from "react-native";
import { Screen } from "../components/ui/Screen";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Text } from "../components/ui/Text";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { TabParams } from "../navigation/RootNavigator";
import { useAuth } from "../features/auth/AuthProvider";
import { theme } from "../theme";

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<BottomTabNavigationProp<TabParams>>();
  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="label" style={styles.accent}>
          FITNESS / TRACKER
        </Text>
        <Text variant="title" accessibilityRole="header">
          Olá, {user?.display_name}.
        </Text>
        <Text muted>Mais consistência. Um treino de cada vez.</Text>
      </View>
      <Card>
        <Text variant="label" muted>
          O TEU TREINO
        </Text>
        <View
          style={styles.mark}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.markText}>＋</Text>
        </View>
        <Text variant="section" accessibilityRole="header">
          Espaço para evoluir
        </Text>
        <Text muted>
          Os teus treinos e recordes vão ganhar vida aqui. Ainda não existem
          sessões registadas.
        </Text>
      </Card>
      <View style={styles.note}>
        <Text variant="label" style={styles.accent}>
          UM INÍCIO SIMPLES
        </Text>
        <Text muted>
          O teu objetivo é treinar {user?.weekly_workout_target} vezes por
          semana. Prepara os teus planos para o próximo treino.
        </Text>
      </View>
      <Button
        label="Abrir área de treino"
        onPress={() => navigation.navigate("Workout")}
      />
      <Text variant="label" muted style={styles.footer}>
        UM TREINO DE CADA VEZ
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: theme.space.md,
    paddingTop: theme.space.xl,
    paddingBottom: theme.space.lg,
  },
  accent: { color: theme.colors.accent },
  mark: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: theme.space.sm,
  },
  markText: { color: theme.colors.accent, fontSize: theme.type.title },
  note: { gap: theme.space.sm },
  footer: { textAlign: "center", marginTop: theme.space.sm },
});
