import { ActivityIndicator } from "react-native";
import {
  NavigationContainer,
  DarkTheme,
  type NavigatorScreenParams,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../features/auth/AuthProvider";
import { AuthScreen } from "../screens/AuthScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { WorkoutNavigator } from "./WorkoutNavigator";
import { Button } from "../components/ui/Button";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { theme } from "../theme";
import { ActiveWorkoutScreen } from "../screens/ActiveWorkoutScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { WorkoutSummaryScreen } from "../screens/WorkoutSummaryScreen";
import { NutritionScreen } from "../screens/NutritionScreen";
import { FoodSearchScreen } from "../screens/FoodSearchScreen";
import { FoodPortionScreen } from "../screens/FoodPortionScreen";
import { NutritionGoalsScreen } from "../screens/NutritionGoalsScreen";
import { MealCopyScreen } from "../screens/MealCopyScreen";
import { CustomFoodScreen } from "../screens/CustomFoodScreen";
import { ProgressScreen } from "../screens/ProgressScreen";
import { MeasurementEditorScreen } from "../screens/MeasurementEditorScreen";
import { MeasurementHistoryScreen } from "../screens/MeasurementHistoryScreen";
import { StrengthLibraryScreen } from "../screens/StrengthLibraryScreen";
import { ExerciseStrengthScreen } from "../screens/ExerciseStrengthScreen";
import { StrengthHistoryScreen } from "../screens/StrengthHistoryScreen";
import type { StrengthGroup } from "../features/progress/strengthApi";
import type { Entry, Food, Goals, Meal } from "../features/nutrition/api";

export type RootStackParams = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<TabParams> | undefined;
  ActiveWorkout: undefined;
  History: undefined;
  WorkoutSummary: { id: string };
  FoodSearch: { date: string; meal: Meal };
  FoodPortion: { date: string; meal: Meal; food: Food; entry?: Entry };
  NutritionGoals: { goals: Goals };
  MealCopy: { date: string; meal: Meal };
  CustomFood: { date: string; meal: Meal };
  MeasurementEditor: { date: string; today: string };
  MeasurementHistory: { today: string };
  StrengthLibrary: undefined;
  ExerciseStrength: { id: string };
  StrengthHistory: { id: string; name: string; group: StrengthGroup };
};
export type TabParams = {
  Home: undefined;
  Workout: undefined;
  Nutrition: undefined;
  Progress: undefined;
  Profile: undefined;
};
const Stack = createNativeStackNavigator<RootStackParams>();
const Tabs = createBottomTabNavigator<TabParams>();
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: theme.colors.accent,
    background: theme.colors.background,
    card: theme.colors.surface,
    border: theme.colors.border,
    text: theme.colors.text,
  },
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={
              route.name === "Home"
                ? "home-outline"
                : route.name === "Workout"
                  ? "barbell-outline"
                  : route.name === "Progress"
                    ? "trending-up-outline"
                    : route.name === "Nutrition"
                      ? "nutrition-outline"
                      : "person-outline"
            }
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Início" }}
      />
      <Tabs.Screen
        name="Workout"
        component={WorkoutNavigator}
        options={{ title: "Workout" }}
      />
      <Tabs.Screen
        name="Progress"
        component={ProgressScreen}
        options={{ title: "Progresso" }}
      />
      <Tabs.Screen
        name="Nutrition"
        component={NutritionScreen}
        options={{ title: "Nutrição" }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "Perfil" }}
      />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { phase, message, session } = useAuth();
  if (phase === "loading")
    return (
      <Screen>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text>A recuperar a tua sessão…</Text>
      </Screen>
    );
  if (phase === "recovery")
    return (
      <Screen>
        <Text variant="title">Vamos voltar a ligar.</Text>
        <Text muted>{message}</Text>
        <Button
          label="Tentar novamente"
          onPress={() => void session.restore()}
        />
      </Screen>
    );
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {phase === "signedIn" ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="StrengthLibrary"
              component={StrengthLibraryScreen}
              options={{ headerShown: true, title: "Evolução da força" }}
            />
            <Stack.Screen
              name="ExerciseStrength"
              component={ExerciseStrengthScreen}
              options={{ headerShown: true, title: "Evolução do exercício" }}
            />
            <Stack.Screen
              name="StrengthHistory"
              component={StrengthHistoryScreen}
              options={{ headerShown: true, title: "Sessões do exercício" }}
            />
            <Stack.Screen
              name="MeasurementEditor"
              component={MeasurementEditorScreen}
              options={{ headerShown: true, title: "Peso e medidas" }}
            />
            <Stack.Screen
              name="MeasurementHistory"
              component={MeasurementHistoryScreen}
              options={{ headerShown: true, title: "Histórico corporal" }}
            />
            <Stack.Screen
              name="FoodSearch"
              component={FoodSearchScreen}
              options={{ headerShown: true, title: "Adicionar alimento" }}
            />
            <Stack.Screen
              name="FoodPortion"
              component={FoodPortionScreen}
              options={{ headerShown: true, title: "Porção" }}
            />
            <Stack.Screen
              name="NutritionGoals"
              component={NutritionGoalsScreen}
              options={{ headerShown: true, title: "Objetivos diários" }}
            />
            <Stack.Screen
              name="MealCopy"
              component={MealCopyScreen}
              options={{ headerShown: true, title: "Repetir refeição" }}
            />
            <Stack.Screen
              name="CustomFood"
              component={CustomFoodScreen}
              options={{ headerShown: true, title: "Novo alimento" }}
            />
            <Stack.Screen
              name="History"
              component={HistoryScreen}
              options={{ headerShown: true, title: "Histórico" }}
            />
            <Stack.Screen
              name="WorkoutSummary"
              component={WorkoutSummaryScreen}
              options={{ headerShown: true, title: "Resumo do treino" }}
            />
            <Stack.Screen
              name="ActiveWorkout"
              component={ActiveWorkoutScreen}
              options={{ headerShown: true, title: "Treino" }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={AuthScreen} />
            <Stack.Screen name="Register" component={AuthScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
