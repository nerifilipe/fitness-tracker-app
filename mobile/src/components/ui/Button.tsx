import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { theme } from "../../theme";
import { Text } from "./Text";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: loading || disabled, busy: loading }}
      disabled={loading || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondary,
        (pressed || loading || disabled) && styles.dimmed,
      ]}
    >
      {loading && (
        <ActivityIndicator
          color={
            variant === "secondary"
              ? theme.colors.accent
              : theme.colors.onAccent
          }
        />
      )}
      <Text
        style={[styles.label, variant === "secondary" && styles.secondaryLabel]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: theme.minTouchTarget,
    padding: theme.space.md,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
  },
  label: { color: theme.colors.onAccent, fontWeight: "700", flexShrink: 1 },
  dimmed: { opacity: 0.7 },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryLabel: { color: theme.colors.text },
});
