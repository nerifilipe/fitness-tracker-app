import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Text } from "../../components/ui/Text";
import type { RootStackParams } from "../../navigation/RootNavigator";
import { useWorkout } from "./WorkoutProvider";

export function WorkoutBanner() {
  const { local, error, storageError, controller } = useWorkout();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  if (storageError)
    return (
      <Card>
        <Text accessibilityRole="alert">{error}</Text>
        <Button
          label="Recuperar armazenamento"
          onPress={() => controller.retryStorage()}
        />
      </Card>
    );
  const pending =
    local &&
    (local.start || local.pending || local.revision !== local.ackRevision);
  const live =
    local?.workout && ["active", "paused"].includes(local.workout.status);
  if (!pending && !live && !local?.conflict) return null;
  return (
    <Card>
      <Text variant="label">
        {live ? "TREINO EM CURSO" : "TREINO POR SINCRONIZAR"}
      </Text>
      <Text variant="section">
        {local?.workout?.name_snapshot ?? "A iniciar treino"}
      </Text>
      <Text muted>
        {pending
          ? "Existem registos por sincronizar."
          : local?.workout?.status === "paused"
            ? "Treino em pausa."
            : "Continua de onde ficaste."}
      </Text>
      <Button
        label={live ? "Retomar treino" : "Abrir registo pendente"}
        onPress={() => navigation.navigate("ActiveWorkout")}
      />
    </Card>
  );
}
