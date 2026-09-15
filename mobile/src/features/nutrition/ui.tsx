import { Linking, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "../../components/ui/Text";
import { theme } from "../../theme";
import type { Goals, Values } from "./api";
import { dateLabel, fmt, nutrients, shiftDay } from "./helpers";

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.icon,
        { opacity: pressed || disabled ? 0.5 : 1 },
      ]}
    >
      <Ionicons name={icon} size={24} color={theme.colors.accent} />
    </Pressable>
  );
}

export function DayPicker({
  day,
  onChange,
  onToday,
  disabled,
}: {
  day: string;
  onChange: (value: string) => void;
  onToday?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <IconButton
        icon="chevron-back"
        label="Dia anterior"
        disabled={disabled}
        onPress={() => onChange(shiftDay(day, -1))}
      />
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text variant="section">{dateLabel(day)}</Text>
        {onToday && (
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onToday}
            style={styles.today}
          >
            <Text muted>Ir para hoje</Text>
          </Pressable>
        )}
      </View>
      <IconButton
        icon="chevron-forward"
        label="Dia seguinte"
        disabled={disabled}
        onPress={() => onChange(shiftDay(day, 1))}
      />
    </View>
  );
}

export function NutritionTotals({
  totals,
  goals = {},
}: {
  totals: Values;
  goals?: Goals;
}) {
  return (
    <View style={{ gap: theme.space.lg }}>
      {nutrients.map(({ key, label, unit }) => {
        const target = goals[key];
        return (
          <View key={key} style={{ gap: theme.space.sm }}>
            <View
              style={[
                styles.row,
                { justifyContent: "space-between", flexWrap: "wrap" },
              ]}
            >
              <Text muted>{label}</Text>
              <Text
                style={
                  key === "calories"
                    ? { fontSize: 22, fontWeight: "700" }
                    : undefined
                }
              >
                {fmt(totals[key])}
                {target != null ? ` / ${fmt(target)}` : ""} {unit}
              </Text>
            </View>
            {target != null && target > 0 && (
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={label}
                accessibilityValue={{
                  min: 0,
                  max: target,
                  now: Math.min(totals[key], target),
                  text: `${fmt(totals[key])} de ${fmt(target)} ${unit}`,
                }}
                style={styles.track}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.min(100, (totals[key] / target) * 100)}%`,
                    },
                  ]}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function FoodAttribution({ code }: { code?: string | null }) {
  const url = code
    ? `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`
    : "https://world.openfoodfacts.org";
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(url).catch(() => {})}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text muted style={{ fontSize: 12 }}>
          Dados: Open Food Facts · ODbL ↗
        </Text>
      </Pressable>
      <Text muted style={{ fontSize: 12 }}>
        Confirma o produto e a porção com a embalagem.
      </Text>
    </View>
  );
}

export function ErrorText({ text }: { text: string }) {
  return text ? (
    <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
      {text}
    </Text>
  ) : null;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: theme.space.sm, alignItems: "center" },
  icon: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  today: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12 },
  track: {
    height: 5,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: { height: 5, backgroundColor: theme.colors.accent },
});
