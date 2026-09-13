import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import * as SecureStore from "expo-secure-store";
import { request } from "../../services/api/http";
import { AuthSession } from "./session";

const KEY = "fitness.refresh-token.v1";
const AuthContext = createContext<AuthSession | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session] = useState(
    () =>
      new AuthSession(
        {
          read: () => SecureStore.getItemAsync(KEY),
          write: (token) =>
            SecureStore.setItemAsync(KEY, token, {
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            }),
          clear: () => SecureStore.deleteItemAsync(KEY),
        },
        request,
      ),
  );
  useEffect(() => {
    void session.restore();
  }, [session]);
  return (
    <AuthContext.Provider value={session}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const session = useContext(AuthContext);
  if (!session) throw new Error("AuthProvider is missing");
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  return { ...state, session };
}
