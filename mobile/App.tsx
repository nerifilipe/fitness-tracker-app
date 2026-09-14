import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/features/auth/AuthProvider";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { WorkoutProvider } from "./src/features/workouts/WorkoutProvider";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <WorkoutProvider>
          <RootNavigator />
        </WorkoutProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
