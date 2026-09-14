import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ExerciseLibraryScreen } from "../screens/ExerciseLibraryScreen";
import { ExerciseDetailScreen } from "../screens/ExerciseDetailScreen";
import { ExerciseEditorScreen } from "../screens/ExerciseEditorScreen";
import { TemplateListScreen } from "../screens/TemplateListScreen";
import { TemplateDetailScreen } from "../screens/TemplateDetailScreen";
import { TemplateEditorScreen } from "../screens/TemplateEditorScreen";

export type WorkoutStackParams = {
  TemplateList: undefined;
  TemplateDetail: { id: string };
  TemplateEditor: { id?: string };
  ExerciseLibrary: undefined;
  ExerciseDetail: { id: string };
  ExerciseEditor: { id?: string };
};
const Stack = createNativeStackNavigator<WorkoutStackParams>();
export function WorkoutNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="TemplateList"
        component={TemplateListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TemplateDetail"
        component={TemplateDetailScreen}
        options={{ title: "Plano de treino" }}
      />
      <Stack.Screen
        name="TemplateEditor"
        component={TemplateEditorScreen}
        options={({ route }) => ({
          title: route.params.id ? "Editar plano" : "Criar plano",
        })}
      />
      <Stack.Screen
        name="ExerciseLibrary"
        component={ExerciseLibraryScreen}
        options={{ title: "Biblioteca" }}
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
