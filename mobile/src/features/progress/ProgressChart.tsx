import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../components/ui/Text";
import { theme } from "../../theme";
import { dateText, numberText, plotPoints } from "./helpers";

const HEIGHT = 180;
export function ProgressChart({
  values,
  unit,
  label,
}: {
  values: { date: string; value: number }[];
  unit: string;
  label: string;
}) {
  const [width, setWidth] = useState(0);
  const graph = plotPoints(values, width, HEIGHT);
  if (!values.length)
    return <Text muted>Ainda não há registos neste período.</Text>;
  const first = graph.points[0],
    last = graph.points[graph.points.length - 1];
  return (
    <View style={{ gap: 8 }}>
      <Text muted style={{ fontSize: 12 }}>
        Escala: {numberText(graph.min)}–{numberText(graph.max)} {unit}
      </Text>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height: HEIGHT }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${label}. ${values.length} registos. De ${numberText(first.value)} ${unit} em ${dateText(first.date)} a ${numberText(last.value)} ${unit} em ${dateText(last.date)}. Os valores individuais estão no histórico.`}
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <View key={ratio} style={[styles.guide, { top: HEIGHT * ratio }]} />
        ))}
        {width > 0 &&
          graph.points.map((point, index) => {
            const next = graph.points[index + 1];
            const dx = next ? next.x - point.x : 0,
              dy = next ? next.y - point.y : 0;
            const length = Math.hypot(dx, dy);
            return (
              <View
                key={point.date}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
                accessible={false}
              >
                {next && (
                  <View
                    style={{
                      position: "absolute",
                      left: (point.x + next.x) / 2 - length / 2,
                      top: (point.y + next.y) / 2 - 1,
                      width: length,
                      height: 2,
                      backgroundColor: theme.colors.accent,
                      transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                    }}
                  />
                )}
                <View
                  style={{
                    position: "absolute",
                    left: point.x - 3,
                    top: point.y - 3,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.colors.accent,
                  }}
                />
              </View>
            );
          })}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text muted style={{ fontSize: 12, flexShrink: 1 }}>
          {dateText(first.date)}
        </Text>
        {first.date !== last.date && (
          <Text
            muted
            style={{ fontSize: 12, flexShrink: 1, textAlign: "right" }}
          >
            {dateText(last.date)}
          </Text>
        )}
      </View>
      {values.length === 1 && (
        <Text muted>Com o próximo registo, já podes ver a evolução.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  guide: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.colors.border,
  },
});
