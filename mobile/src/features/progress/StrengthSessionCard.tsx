import { useState } from "react";
import { View } from "react-native";
import { Card } from "../../components/ui/Card";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import type { Units } from "./api";
import type { StrengthGroup, StrengthSession } from "./strengthApi";
import { loadText, sessionDate } from "./strengthHelpers";
import { displayValue, numberText } from "./helpers";
import { theme } from "../../theme";

export function StrengthSessionCard({
  session,
  group,
  timezone,
  units,
  onOpen,
  title,
}: {
  session: StrengthSession;
  group: StrengthGroup;
  timezone: string;
  units: Units;
  onOpen: () => void;
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      {!!title && (
        <Text variant="label" style={{ color: theme.colors.accent }}>
          {title}
        </Text>
      )}
      <Text variant="section">{session.workout_name}</Text>
      <Text muted>{sessionDate(session.started_at, timezone)}</Text>
      <Text>
        {session.completed_sets}{" "}
        {session.completed_sets === 1 ? "série" : "séries"} ·{" "}
        {session.total_reps} repetições
      </Text>
      {group.load_convention !== "none" && (
        <Text>
          {group.load_type === "assisted" ? "Maior assistência" : "Maior carga"}
          : {loadText(session.max_weight_kg, units)}
        </Text>
      )}
      {session.estimated_1rm != null && (
        <Text>1RM estimado: {loadText(session.estimated_1rm, units)}</Text>
      )}
      {session.volume_kg != null && (
        <Text muted>
          Volume:{" "}
          {numberText(displayValue(session.volume_kg, "weight_kg", units))}{" "}
          {units === "metric" ? "kg" : "lb"}·reps
        </Text>
      )}
      <Button
        label={expanded ? "Ocultar séries" : "Ver cargas e repetições"}
        variant="secondary"
        onPress={() => setExpanded((value) => !value)}
      />
      {expanded && (
        <View style={{ gap: 8 }}>
          {session.sets.map((set, index) => (
            <Text key={index}>
              Série {index + 1} ·{" "}
              {group.load_convention === "none"
                ? ""
                : `${loadText(set.weight_kg, units)} × `}
              {set.reps} reps{set.rir == null ? "" : ` · RIR ${set.rir}`}
            </Text>
          ))}
        </View>
      )}
      <Button
        label="Abrir treino completo"
        variant="secondary"
        onPress={onOpen}
      />
    </Card>
  );
}
