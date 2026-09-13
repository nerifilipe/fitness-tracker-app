import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../../theme";
import { Text } from "./Text";
import { Button } from "./Button";

type Option = { value: string; label: string };
type Props = { label: string; options: Option[]; disabled?: boolean } & (
  | { multiple?: false; value: string; onChange: (value: string) => void }
  | { multiple: true; value: string[]; onChange: (value: string[]) => void }
);

export function ChoiceField(props: Props) {
  const [open, setOpen] = useState(false);
  const selected = (value: string) =>
    props.multiple ? props.value.includes(value) : props.value === value;
  const summary =
    props.options
      .filter((option) => selected(option.value))
      .map((option) => option.label)
      .join(", ") || "Selecionar";
  function choose(value: string) {
    if (props.multiple)
      props.onChange(
        selected(value)
          ? props.value.filter((item) => item !== value)
          : [...props.value, value],
      );
    else {
      props.onChange(value);
      setOpen(false);
    }
  }
  return (
    <View style={styles.field}>
      <Text>{props.label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.label}: ${summary}`}
        accessibilityState={{ disabled: props.disabled, expanded: open }}
        disabled={props.disabled}
        onPress={() => setOpen(true)}
        style={styles.control}
      >
        <Text style={styles.summary}>{summary}</Text>
        <Ionicons name="chevron-down" color={theme.colors.muted} size={20} />
      </Pressable>
      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modal}>
          <Text variant="section" accessibilityRole="header">
            {props.label}
          </Text>
          <FlatList
            data={props.options}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole={props.multiple ? "checkbox" : "radio"}
                accessibilityState={{ checked: selected(item.value) }}
                onPress={() => choose(item.value)}
                style={styles.option}
              >
                <Text style={styles.summary}>{item.label}</Text>
                {selected(item.value) && (
                  <Ionicons
                    name="checkmark"
                    size={22}
                    color={theme.colors.accent}
                  />
                )}
              </Pressable>
            )}
          />
          <Button label="Concluído" onPress={() => setOpen(false)} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  field: { gap: theme.space.sm },
  control: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.control,
    minHeight: theme.minTouchTarget,
    padding: theme.space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
  },
  summary: { flex: 1 },
  modal: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.space.xl,
    gap: theme.space.lg,
  },
  option: {
    minHeight: theme.minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
});
