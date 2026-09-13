import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import { theme } from "../theme";

export function ProfileScreen() {
  const { user, session } = useAuth();
  const [name, setName] = useState(user?.display_name ?? "");
  const [target, setTarget] = useState(
    String(user?.weekly_workout_target ?? 4),
  );
  const [timezone, setTimezone] = useState(user?.timezone ?? "Europe/Lisbon");
  const [units, setUnits] = useState<"metric" | "imperial">(
    user?.unit_system ?? "metric",
  );
  const [busy, setBusy] = useState<"save" | "logout" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (user) {
      setName(user.display_name);
      setTarget(String(user.weekly_workout_target));
      setTimezone(user.timezone);
      setUnits(user.unit_system);
    }
  }, [user]);

  async function act(action: "save" | "logout") {
    if (busy) return;
    setBusy(action);
    setFeedback("");
    setFailed(false);
    try {
      if (action === "logout") await session.signOut();
      else {
        if (
          !/^\d+$/.test(target) ||
          Number(target) < 1 ||
          Number(target) > 14 ||
          !name.trim()
        )
          throw new Error("Indica um nome e um objetivo entre 1 e 14 treinos.");
        await session.updateProfile({
          display_name: name.trim(),
          timezone: timezone.trim(),
          unit_system: units,
          weekly_workout_target: Number(target),
        });
        setFeedback("Preferências guardadas.");
      }
    } catch (err) {
      setFailed(true);
      setFeedback(err instanceof Error ? err.message : "Tenta novamente.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        O teu perfil
      </Text>
      <Text muted>{user?.email}</Text>
      <Input
        label="Nome"
        value={name}
        onChangeText={setName}
        maxLength={80}
        editable={!busy}
      />
      <Input
        label="Objetivo semanal de treinos"
        value={target}
        onChangeText={setTarget}
        keyboardType="number-pad"
        maxLength={2}
        editable={!busy}
      />
      <Input
        label="Fuso horário"
        hint="Por exemplo: Europe/Lisbon"
        value={timezone}
        onChangeText={setTimezone}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={80}
        editable={!busy}
      />
      <View style={styles.field}>
        <Text>Unidades</Text>
        <View style={styles.units}>
          {(["metric", "imperial"] as const).map((value) => (
            <Pressable
              key={value}
              disabled={!!busy}
              accessibilityRole="radio"
              accessibilityState={{ checked: units === value }}
              onPress={() => setUnits(value)}
              style={[styles.option, units === value && styles.selected]}
            >
              <Text>{value === "metric" ? "kg / cm" : "lb / in"}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {!!feedback && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: failed ? theme.colors.error : theme.colors.accent }}
        >
          {feedback}
        </Text>
      )}
      <Button
        label="Guardar preferências"
        onPress={() => void act("save")}
        loading={busy === "save"}
        disabled={busy === "logout"}
      />
      <Button
        label="Terminar sessão"
        onPress={() => void act("logout")}
        loading={busy === "logout"}
        disabled={busy === "save"}
        variant="secondary"
      />
      <Text muted>
        A sessão é terminada em segurança no serviço. É necessária ligação à
        rede.
      </Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  field: { gap: theme.space.sm },
  units: { flexDirection: "row", gap: theme.space.md },
  option: {
    flex: 1,
    minHeight: theme.minTouchTarget,
    padding: theme.space.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
  },
});
