import { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme";

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    padding: theme.space.xl,
    gap: theme.space.md,
  },
});
