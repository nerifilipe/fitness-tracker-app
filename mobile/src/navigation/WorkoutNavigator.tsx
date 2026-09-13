import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ExerciseLibraryScreen } from "../screens/ExerciseLibraryScreen";
import { ExerciseDetailScreen } from "../screens/ExerciseDetailScreen";
import { ExerciseEditorScreen } from "../screens/ExerciseEditorScreen";

export type WorkoutStackParams = {
  ExerciseLibrary: undefined;
  ExerciseDetail: { id: string };
  ExerciseEditor: { id?: string };
};
const Stack = createNativeStackNavigator<WorkoutStackParams>();
export function WorkoutNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ExerciseLibrary"
        component={ExerciseLibraryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ title: "Exercício" }}
      />
      <Stack.Screen
        name="ExerciseEditor"
        component={ExerciseEditorScreen}
        options={({ route }) => ({
          title: route.params.id ? "Editar exercício" : "Criar exercício",
        })}
      />
    </Stack.Navigator>
  );
}
