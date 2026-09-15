import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/RootNavigator";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../features/auth/AuthProvider";
import { useReport } from "../features/history/useReport";
import {
  progressApi,
  type Measurement,
  type Units,
} from "../features/progress/api";
import {
  dateText,
  initialForm,
  metrics,
  parseForm,
  unitLabel,
  validDay,
} from "../features/progress/helpers";
import { useMutation } from "../hooks/useMutation";
import { theme } from "../theme";

export function MeasurementEditorScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "MeasurementEditor">) {
  const { session, user } = useAuth();
  const api = useMemo(() => progressApi(session), [session]);
  const [date, setDate] = useState(route.params.date);
  const { data, loading, error, reload } = useReport(
    useCallback(
      async (signal: AbortSignal) => ({
        date,
        record: await api.detail(date, signal),
      }),
      [api, date, user?.id],
    ),
  );
  return (
    <Screen withHeader>
      <Text variant="title">Um registo rápido.</Text>
      {loading && <ActivityIndicator color={theme.colors.accent} />}
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {error}
          </Text>
          <Button label="Tentar novamente" onPress={reload} />
        </>
      )}
      {data && data.date === date && !loading && (
        <MeasurementForm
          key={`${date}:${data.record?.updated_at ?? "new"}`}
          record={data.record}
          date={date}
          today={route.params.today}
          units={user?.unit_system ?? "metric"}
          api={api}
          onDateChange={setDate}
          done={() => navigation.goBack()}
        />
      )}
    </Screen>
  );
}

function MeasurementForm({
  record,
  date,
  today,
  units,
  api,
  onDateChange,
  done,
}: {
  record: Measurement | null;
  date: string;
  today: string;
  units: Units;
  api: ReturnType<typeof progressApi>;
  onDateChange: (date: string) => void;
  done: () => void;
}) {
  const [form, setForm] = useState(() => initialForm(record, units));
  const [more, setMore] = useState(
    () =>
      metrics.slice(1).some(({ key }) => record?.[key] != null) ||
      !!record?.notes,
  );
  const [changeDate, setChangeDate] = useState(false);
  const [dateInput, setDateInput] = useState(date);
  const [dateError, setDateError] = useState("");
  const mutation = useMutation();
  const dirty =
    JSON.stringify(form) !== JSON.stringify(initialForm(record, units));
  function chooseDate(value: string) {
    if (!validDay(value, today)) {
      setDateError("Usa uma data válida até hoje, no formato AAAA-MM-DD.");
      return;
    }
    if (value === date) {
      setChangeDate(false);
      return;
    }
    const apply = () => onDateChange(value);
    if (dirty)
      Alert.alert(
        "Mudar de dia?",
        "As alterações por guardar neste formulário serão descartadas.",
        [
          { text: "Manter", style: "cancel" },
          { text: "Mudar de dia", onPress: apply },
        ],
      );
    else apply();
  }
  const weightUnit = unitLabel("weight_kg", units);
  return (
    <>
      <Button
        label={`${date === today ? "Hoje · " : ""}${dateText(date)}`}
        variant="secondary"
        disabled={mutation.busy}
        onPress={() => setChangeDate((value) => !value)}
      />
      {changeDate && (
        <View style={{ gap: 12 }}>
          <Input
            label="Data (AAAA-MM-DD)"
            value={dateInput}
            onChangeText={setDateInput}
            maxLength={10}
            editable={!mutation.busy}
            autoCapitalize="none"
          />
          {!!dateError && (
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.error }}
            >
              {dateError}
            </Text>
          )}
          <Button
            label="Abrir este dia"
            variant="secondary"
            disabled={mutation.busy}
            onPress={() => chooseDate(dateInput.trim())}
          />
          {date !== today && (
            <Button
              label="Ir para hoje"
              variant="secondary"
              disabled={mutation.busy}
              onPress={() => chooseDate(today)}
            />
          )}
        </View>
      )}
      <Input
        label={`Peso (${weightUnit})`}
        value={form.weight_kg}
        onChangeText={(value) => setForm({ ...form, weight_kg: value })}
        keyboardType="decimal-pad"
        maxLength={9}
        editable={!mutation.busy}
        placeholder={units === "metric" ? "Ex.: 72,4" : "Ex.: 159,6"}
        style={{ fontSize: 32 }}
        hint={
          record
            ? "Já existe um registo neste dia. Guardar atualiza esse registo."
            : "Só precisas deste campo para acompanhar o peso."
        }
      />
      <Button
        label={
          more ? "Ocultar medidas opcionais" : "+ Medidas e notas (opcional)"
        }
        variant="secondary"
        disabled={mutation.busy}
        onPress={() => setMore((value) => !value)}
      />
      {more && (
        <View style={{ gap: 16 }}>
          <Text muted>
            Mede sempre do mesmo lado e no mesmo ponto para comparar os teus
            registos.
          </Text>
          {metrics.slice(1).map(({ key, label }) => (
            <Input
              key={key}
              label={`${label} (${unitLabel(key, units)})`}
              value={form[key]}
              onChangeText={(value) => setForm({ ...form, [key]: value })}
              keyboardType="decimal-pad"
              maxLength={9}
              editable={!mutation.busy}
              placeholder="Opcional"
            />
          ))}
          <Input
            label="Notas"
            value={form.notes}
            onChangeText={(value) => setForm({ ...form, notes: value })}
            multiline
            maxLength={500}
            editable={!mutation.busy}
            placeholder="Opcional"
          />
        </View>
      )}
      {!!mutation.error && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          {mutation.error}
        </Text>
      )}
      <Button
        label={record ? "Guardar alterações" : "Guardar registo"}
        loading={mutation.busy}
        onPress={() =>
          void mutation.run(
            () => api.save(date, parseForm(form, record, units)),
            done,
          )
        }
      />
      {record && (
        <Button
          label="Apagar registo deste dia"
          variant="secondary"
          disabled={mutation.busy}
          onPress={() =>
            Alert.alert(
              "Apagar este registo?",
              `O peso, as medidas e as notas de ${dateText(date)} serão removidos.`,
              [
                { text: "Manter", style: "cancel" },
                {
                  text: "Apagar",
                  style: "destructive",
                  onPress: () =>
                    void mutation.run(() => api.remove(date), done),
                },
              ],
            )
          }
        />
      )}
    </>
  );
}
