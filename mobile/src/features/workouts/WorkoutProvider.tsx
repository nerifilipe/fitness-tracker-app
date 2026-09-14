import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import { useAuth } from "../auth/AuthProvider";
import type { AuthSession } from "../auth/session";
import { WorkoutController } from "./controller";
import { workoutApi } from "./api";
import { workoutStorage } from "./storage";
import { Screen } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";

const Context = createContext<WorkoutController | null>(null);
function AccountWorkouts({
  userId,
  session,
  children,
}: PropsWithChildren<{ userId: string; session: AuthSession }>) {
  const [controller, setController] = useState<WorkoutController | null>(null);
  useEffect(() => {
    const current = new WorkoutController(
      userId,
      workoutStorage,
      workoutApi(session),
      Crypto.randomUUID,
    );
    current.initialize();
    setController(current);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void current.sync();
    });
    return () => {
      subscription.remove();
      current.dispose();
    };
  }, [userId, session]);
  if (!controller)
    return (
      <Screen>
        <Text>A recuperar os teus treinos…</Text>
      </Screen>
    );
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function WorkoutProvider({ children }: PropsWithChildren) {
  const { user, session } = useAuth();
  return user ? (
    <AccountWorkouts key={user.id} userId={user.id} session={session}>
      {children}
    </AccountWorkouts>
  ) : (
    children
  );
}
export function useWorkout() {
  const controller = useContext(Context);
  if (!controller) throw new Error("WorkoutProvider is missing");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { ...state, controller };
}
