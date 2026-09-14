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

export type RootStackParams = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<TabParams> | undefined;
  ActiveWorkout: undefined;
  History: undefined;
  WorkoutSummary: { id: string };
};
export type TabParams = {
  Home: undefined;
  Workout: undefined;
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
