import { StyleSheet, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { ChoiceField } from "../../components/ui/ChoiceField";
import { Text } from "../../components/ui/Text";
import { conventionLabels } from "../exercises/labels";
import { freshSet, type LiveExercise, type LiveSet } from "./draft";
import { theme } from "../../theme";

type Props = {
  exercise: LiveExercise;
  index: number;
  expanded: boolean;
  disabled: boolean;
  paused: boolean;
  uuid: () => string;
  onToggle: () => void;
  onChange: (value: LiveExercise) => void;
  onComplete: (setId: string) => void;
  onReplace: () => void;
  onRemove: () => void;
};
export function LiveExerciseCard({
  exercise: e,
  index,
  expanded,
  disabled,
  paused,
  uuid,
  onToggle,
  onChange,
  onComplete,
  onReplace,
  onRemove,
}: Props) {
  function changeSet(id: string, changes: Partial<LiveSet>) {
    onChange({
      ...e,
      sets: e.sets.map((s) => (s.id === id ? { ...s, ...changes } : s)),
    });
  }
  return (
    <Card>
      <Text variant="section">
        {index + 1}. {e.name_snapshot}
      </Text>
      <Text muted>
        {e.sets.filter((s) => s.completed_at).length}/{e.sets.length} séries ·{" "}
        {conventionLabels[e.load_convention_snapshot]}
      </Text>
      <Button
        label={expanded ? "Recolher séries" : "Abrir séries"}
        variant="secondary"
        onPress={onToggle}
      />
      {expanded && (
        <>
          <Input
            label="Descanso (segundos)"
            value={e.rest}
            keyboardType="number-pad"
            maxLength={4}
            editable={!disabled}
            onChangeText={(rest) => onChange({ ...e, rest })}
          />
          <Input
            label="Notas do exercício"
            value={e.notes ?? ""}
            multiline
            maxLength={2000}
            editable={!disabled}
            onChangeText={(notes) => onChange({ ...e, notes })}
          />
          {e.sets.map((s, j) => (
            <View key={s.id} style={styles.set}>
              <Text
                variant="label"
                style={s.completed_at ? styles.accent : undefined}
              >
                {s.completed_at ? "✓ " : ""}SÉRIE {j + 1}
              </Text>
              <ChoiceField
                label="Tipo de série"
                value={s.set_type}
                options={[
                  { value: "working", label: "Trabalho" },
                  { value: "warmup", label: "Aquecimento" },
                ]}
                disabled={disabled || !!s.completed_at}
                onChange={(value) =>
                  changeSet(s.id, { set_type: value as LiveSet["set_type"] })
                }
              />
              <View style={styles.row}>
                <View style={styles.cell}>
                  <Input
                    label="Carga (kg)"
                    value={s.weight}
                    maxLength={9}
                    keyboardType="decimal-pad"
                    editable={
                      !disabled &&
                      !s.completed_at &&
                      e.load_convention_snapshot !== "none"
                    }
                    onChangeText={(weight) => changeSet(s.id, { weight })}
                  />
                </View>
                <View style={styles.cell}>
                  <Input
                    label="Repetições"
                    value={s.reps}
                    maxLength={3}
                    keyboardType="number-pad"
                    editable={!disabled && !s.completed_at}
                    onChangeText={(reps) => changeSet(s.id, { reps })}
                  />
                </View>
              </View>
              <Input
                label="RIR (opcional, 0–10)"
                value={s.rir}
                maxLength={2}
                keyboardType="number-pad"
                editable={!disabled && !s.completed_at}
                onChangeText={(rir) => changeSet(s.id, { rir })}
              />
              <Button
                label={
                  s.completed_at
                    ? "Desmarcar série para corrigir"
                    : "Concluir série"
                }
                variant={s.completed_at ? "secondary" : "primary"}
                disabled={disabled || paused}
                onPress={() => onComplete(s.id)}
              />
              {!s.completed_at && (
                <Button
                  label="Remover série"
                  variant="secondary"
                  disabled={disabled || e.sets.length === 1}
                  onPress={() =>
                    onChange({
                      ...e,
                      sets: e.sets.filter((value) => value.id !== s.id),
                    })
                  }
                />
              )}
            </View>
          ))}
          <Button
            label="Adicionar série"
            variant="secondary"
            disabled={disabled || e.sets.length >= 30}
            onPress={() =>
              onChange({
                ...e,
                sets: [...e.sets, freshSet(uuid, e.load_convention_snapshot)],
              })
            }
          />
          <Button
            label="Substituir exercício"
            variant="secondary"
            disabled={disabled}
            onPress={onReplace}
          />
          <Button
            label="Remover exercício"
            variant="secondary"
            disabled={disabled}
            onPress={onRemove}
          />
        </>
      )}
    </Card>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: theme.space.sm },
  cell: { flex: 1, minWidth: 0 },
  set: {
    gap: theme.space.md,
    paddingTop: theme.space.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  accent: { color: theme.colors.accent },
});
