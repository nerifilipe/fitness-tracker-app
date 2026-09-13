import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { theme } from "../../theme";
import { Text } from "./Text";

type Props = TextInputProps & {
  label: string;
  hint?: string;
  password?: boolean;
};

export function Input({ label, hint, password, style, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text>{label}</Text>
      <View style={[styles.control, focused && styles.focused]}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholderTextColor={theme.colors.muted}
          secureTextEntry={password && !visible}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={theme.colors.accent}
          style={[styles.input, style]}
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              visible ? "Ocultar palavra-passe" : "Mostrar palavra-passe"
            }
            onPress={() => setVisible(!visible)}
            style={styles.toggle}
          >
            <Text muted>{visible ? "Ocultar" : "Mostrar"}</Text>
          </Pressable>
        )}
      </View>
      {hint && (
        <Text muted style={styles.hint}>
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: theme.space.sm },
  control: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.control,
  },
  focused: { borderColor: theme.colors.accent },
  input: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    minHeight: theme.minTouchTarget,
    padding: theme.space.md,
    flex: 1,
    minWidth: 0,
  },
  toggle: {
    minHeight: theme.minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: theme.space.md,
  },
  hint: { fontSize: theme.type.label },
});
