import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Text } from "../components/ui/Text";
import { Button } from "../components/ui/Button";
import { ChoiceField } from "../components/ui/ChoiceField";
import { useAuth } from "../features/auth/AuthProvider";
import { useReport } from "../features/history/useReport";
import { progressApi, type Metric } from "../features/progress/api";
import {
  dateText,
  displayValue,
  metrics,
  numberText,
  unitLabel,
} from "../features/progress/helpers";
import { ProgressChart } from "../features/progress/ProgressChart";
import { theme } from "../theme";

export function ProgressScreen() {
  const { session, user } = useAuth();
  const units = user?.unit_system ?? "metric";
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const api = useMemo(() => progressApi(session), [session]);
  const [days, setDays] = useState(90);
  const [metric, setMetric] = useState<Metric>("weight_kg");
  const { data, loading, error, reload } = useReport(
    useCallback(
      (signal: AbortSignal) => api.summary(days, signal),
      [api, days, user?.id, user?.timezone],
    ),
  );
  const trend = data?.metrics[metric];
  const selected = metrics.find((item) => item.key === metric)!;
  const unit = unitLabel(metric, units);
  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <Text variant="label" style={{ color: theme.colors.accent }}>
          PROGRESSO
        </Text>
        <Text variant="title">A tua evolução.</Text>
        <Text muted>O peso de hoje. A perspetiva ao longo do tempo.</Text>
      </View>
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {error}
          </Text>
          <Button label="Tentar novamente" onPress={reload} />
        </>
      )}
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      {data && (
        <>
          <Button
            label={
              data.points.some((point) => point.date === data.today)
                ? "Atualizar registo de hoje"
                : "+ Registar peso"
            }
            onPress={() =>
              navigation.navigate("MeasurementEditor", {
                date: data.today,
                today: data.today,
              })
            }
          />
          <Card>
            <ChoiceField
              label="Acompanhar"
              value={metric}
              options={metrics.map((item) => ({
                value: item.key,
                label: item.label,
              }))}
              onChange={(value) => setMetric(value as Metric)}
            />
            {trend?.latest ? (
              <>
                <Text variant="title">
                  {numberText(displayValue(trend.latest.value, metric, units))}{" "}
                  {unit}
                </Text>
                <Text muted>
                  Último registo · {dateText(trend.latest.date)}
                </Text>
              </>
            ) : (
              <Text muted>
                Ainda não registaste {selected.label.toLowerCase()}.
              </Text>
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                { value: 30, label: "30 dias" },
                { value: 90, label: "90 dias" },
                { value: 365, label: "1 ano" },
              ].map((option) => (
                <Button
                  key={option.value}
                  label={option.label}
                  variant={days === option.value ? "primary" : "secondary"}
                  onPress={() => setDays(option.value)}
                />
              ))}
            </View>
            <ProgressChart
              label={selected.label}
              unit={unit}
              values={data.points.flatMap((point) =>
                point[metric] == null
                  ? []
                  : [
                      {
                        date: point.date,
                        value: displayValue(point[metric], metric, units),
                      },
                    ],
              )}
            />
            {trend?.change != null && (
              <Text>
                {trend.change > 0 ? "+" : ""}
                {numberText(displayValue(trend.change, metric, units))} {unit}{" "}
                entre o primeiro e o último registo do período.
              </Text>
            )}
            <Text muted>
              {trend?.count ?? 0} registos nos últimos {days} dias. A linha liga
              apenas os dias registados.
            </Text>
          </Card>
          <Button
            label="Ver e editar histórico"
            variant="secondary"
            onPress={() =>
              navigation.navigate("MeasurementHistory", { today: data.today })
            }
          />
          <Text muted>
            Podes guardar apenas o peso. Cintura, peito, braço e coxa são
            opcionais.
          </Text>
        </>
      )}
    </Screen>
  );
}
