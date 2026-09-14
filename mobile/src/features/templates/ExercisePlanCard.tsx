import { StyleSheet, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ChoiceField } from "../../components/ui/ChoiceField";
import { Input } from "../../components/ui/Input";
import { Text } from "../../components/ui/Text";
import { conventionLabels } from "../exercises/labels";
import {
  blankSet,
  move,
  newKey,
  type DraftExercise,
  type DraftSet,
} from "./draft";
import { theme } from "../../theme";

type Props = {
  entry: DraftExercise;
  index: number;
  count: number;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (entry: DraftExercise) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};
export function ExercisePlanCard({
  entry,
  index,
  count,
  expanded,
  disabled,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: Props) {
  function changeSet(key: string, change: Partial<DraftSet>) {
    onChange({
      ...entry,
      sets: entry.sets.map((s) => (s.key === key ? { ...s, ...change } : s)),
    });
  }
  return (
    <Card>
      <Text variant="section">
        {index + 1}. {entry.name}
      </Text>
      <Text muted>
        {entry.sets.length} séries · {entry.rest || "—"} s de descanso
      </Text>
      {entry.archived && (
        <Text style={styles.warning}>
          Exercício arquivado. Podes mantê-lo neste plano ou substituí-lo.
        </Text>
      )}
      <Button
        label={expanded ? "Recolher exercício" : "Editar séries e descanso"}
        variant="secondary"
        disabled={disabled}
        onPress={onToggle}
      />
      <View style={styles.row}>
        <View style={styles.cell}>
          <Button
            label="Subir"
            variant="secondary"
            disabled={disabled || index === 0}
            onPress={() => onMove(-1)}
          />
        </View>
        <View style={styles.cell}>
          <Button
            label="Descer"
            variant="secondary"
            disabled={disabled || index === count - 1}
            onPress={() => onMove(1)}
          />
        </View>
      </View>
      {expanded && (
        <>
          <Text muted>
            {conventionLabels[entry.convention]}. Cargas em kg; deixa vazio se
            ainda não decidiste.
          </Text>
          <Input
            label="Descanso entre séries (segundos)"
            keyboardType="number-pad"
            value={entry.rest}
            onChangeText={(rest) => onChange({ ...entry, rest })}
            maxLength={4}
            editable={!disabled}
          />
          <Input
            label="Notas do exercício (opcional)"
            multiline
            value={entry.notes}
            maxLength={2000}
            onChangeText={(notes) => onChange({ ...entry, notes })}
            editable={!disabled}
          />
          {entry.sets.map((set, j) => (
            <View key={set.key} style={styles.set}>
              <Text variant="label">SÉRIE {j + 1}</Text>
              <ChoiceField
                label={`Tipo da série ${j + 1}`}
                value={set.type}
                options={[
                  { value: "working", label: "Trabalho" },
                  { value: "warmup", label: "Aquecimento" },
                ]}
                disabled={disabled}
                onChange={(type) =>
                  changeSet(set.key, { type: type as DraftSet["type"] })
                }
              />
              <View style={styles.row}>
                <View style={styles.cell}>
                  <Input
                    label="Reps mín."
                    value={set.min}
                    keyboardType="number-pad"
                    maxLength={3}
                    editable={!disabled}
                    onChangeText={(min) => changeSet(set.key, { min })}
                  />
                </View>
                <View style={styles.cell}>
                  <Input
                    label="Reps máx."
                    value={set.max}
                    keyboardType="number-pad"
                    maxLength={3}
                    editable={!disabled}
                    onChangeText={(max) => changeSet(set.key, { max })}
                  />
                </View>
              </View>
              <View style={styles.row}>
                {(entry.convention !== "none" || !!set.weight) && (
                  <View style={styles.cell}>
                    <Input
                      label="Carga (kg)"
                      value={set.weight}
                      keyboardType="decimal-pad"
                      maxLength={9}
                      editable={!disabled}
                      onChangeText={(weight) => changeSet(set.key, { weight })}
                    />
                  </View>
                )}
                <View style={styles.cell}>
                  <Input
                    label="RIR (opcional)"
                    hint="Repetições em reserva: 0–10"
                    value={set.rir}
                    keyboardType="number-pad"
                    maxLength={2}
                    editable={!disabled}
                    onChangeText={(rir) => changeSet(set.key, { rir })}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.cell}>
                  <Button
                    label="Série ↑"
                    variant="secondary"
                    disabled={disabled || j === 0}
                    onPress={() =>
                      onChange({ ...entry, sets: move(entry.sets, j, -1) })
                    }
                  />
                </View>
                <View style={styles.cell}>
                  <Button
                    label="Série ↓"
                    variant="secondary"
                    disabled={disabled || j === entry.sets.length - 1}
                    onPress={() =>
                      onChange({ ...entry, sets: move(entry.sets, j, 1) })
                    }
                  />
                </View>
              </View>
              <Button
                label={`Remover série ${j + 1}`}
                variant="secondary"
                disabled={disabled || entry.sets.length === 1}
                onPress={() =>
                  onChange({
                    ...entry,
                    sets: entry.sets.filter((s) => s.key !== set.key),
                  })
                }
              />
            </View>
          ))}
          <Button
            label="Adicionar série"
            variant="secondary"
            disabled={disabled || entry.sets.length >= 20}
            onPress={() => {
              const last = entry.sets.at(-1);
              onChange({
                ...entry,
                sets: [
                  ...entry.sets,
                  last ? { ...last, key: newKey() } : blankSet(),
                ],
              });
            }}
          />
        </>
      )}
      <Button
        label="Remover exercício"
        variant="secondary"
        disabled={disabled}
        onPress={onRemove}
      />
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
  warning: { color: theme.colors.error },
});
