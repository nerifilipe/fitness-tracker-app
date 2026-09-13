import { ApiError, type Transport } from "../../services/api/http";
import type {
  LoginInput,
  ProfileInput,
  RegisterInput,
  Tokens,
  User,
} from "./types";

export interface TokenStorage {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

export type AuthState = {
  phase: "loading" | "signedOut" | "signedIn" | "recovery";
  user: User | null;
  message?: string;
};

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

// Access tokens stay in memory. Only the opaque refresh token reaches native storage.
export class AuthSession {
  private state: AuthState = { phase: "loading", user: null };
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private generation = 0;
  private refreshing: Promise<void> | null = null;
  private restoring: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private signingIn = false;
  private signingOut = false;

  constructor(
    private storage: TokenStorage,
    private transport: Transport,
  ) {}

  getSnapshot = (): AuthState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(state: AuthState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  private async accept(tokens: Tokens) {
    try {
      await this.storage.write(tokens.refresh_token);
    } catch {
      await this.transport(
        "/auth/logout",
        post({ refresh_token: tokens.refresh_token }),
      ).catch(() => {});
      throw new ApiError(
        "Não foi possível guardar a sessão em segurança. Tenta novamente.",
        0,
        "storage_error",
      );
    }
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    this.publish({ phase: "signedIn", user: tokens.user });
  }

  private async clear(message?: string) {
    this.generation++;
    this.accessToken = this.refreshToken = null;
    try {
      await this.storage.clear();
      this.publish({ phase: "signedOut", user: null, message });
    } catch {
      this.publish({
        phase: "recovery",
        user: null,
        message: "Não foi possível limpar a sessão guardada. Tenta novamente.",
      });
    }
  }

  restore = (): Promise<void> => {
    if (this.restoring) return this.restoring;
    this.restoring = this.performRestore().finally(() => {
      this.restoring = null;
    });
    return this.restoring;
  };

  private async performRestore() {
    this.publish({ phase: "loading", user: null });
    try {
      this.refreshToken = await this.storage.read();
      if (!this.refreshToken) {
        this.publish({ phase: "signedOut", user: null });
        return;
      }
      await this.rotate();
    } catch (error) {
      if (this.state.phase !== "signedOut") {
        this.publish({
          phase: "recovery",
          user: null,
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível recuperar a sessão.",
        });
      }
    }
  }

  async signIn(input: LoginInput | RegisterInput, register = false) {
    if (this.state.phase !== "signedOut" || this.signingIn) return;
    this.signingIn = true;
    try {
      const tokens = await this.transport<Tokens>(
        register ? "/auth/register" : "/auth/login",
        post(input),
      );
      await this.accept(tokens);
    } finally {
      this.signingIn = false;
    }
  }

  private rotate(): Promise<void> {
    if (this.signingOut)
      return Promise.reject(new ApiError("A sessão está a terminar.", 401));
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.performRotation().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async performRotation() {
    if (!this.refreshToken)
      throw new ApiError("Volta a entrar na tua conta.", 401);
    try {
      const tokens = await this.transport<Tokens>(
        "/auth/refresh",
        post({ refresh_token: this.refreshToken }),
      );
      await this.accept(tokens);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await this.clear("A sessão terminou. Volta a entrar.");
      }
      // No automatic retry: a lost refresh response may already have consumed the token.
      throw error;
    }
  }

  async authorized<T>(path: string, options: RequestInit = {}): Promise<T> {
    const generation = this.generation;
    const originalToken = this.accessToken;
    if (!originalToken || this.state.phase !== "signedIn" || this.signingOut)
      throw new ApiError("Volta a entrar.", 401);
    const call = () =>
      this.transport<T>(path, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${this.accessToken}`,
        },
      });
    try {
      return await call();
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        generation !== this.generation
      )
        throw error;
      if (originalToken === this.accessToken) await this.rotate();
      if (generation !== this.generation)
        throw new ApiError("A sessão terminou.", 401);
      try {
        return await call();
      } catch (retryError) {
        if (
          retryError instanceof ApiError &&
          retryError.status === 401 &&
          generation === this.generation
        )
          await this.clear("Volta a entrar na tua conta.");
        throw retryError;
      }
    }
  }

  async updateProfile(input: ProfileInput) {
    const generation = this.generation;
    const user = await this.authorized<User>("/users/me", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    if (generation === this.generation && this.state.phase === "signedIn")
      this.publish({ phase: "signedIn", user });
  }

  async signOut() {
    if (this.signingOut) return;
    this.signingOut = true;
    try {
      if (this.refreshing) await this.refreshing.catch(() => {});
      if (this.refreshToken)
        await this.transport(
          "/auth/logout",
          post({ refresh_token: this.refreshToken }),
        );
      await this.clear();
    } finally {
      this.signingOut = false;
    }
  }
}
