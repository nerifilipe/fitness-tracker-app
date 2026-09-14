import { describe, expect, it, vi } from "vitest";
import { AuthSession, type TokenStorage } from "../src/features/auth/session";
import { ApiError, type Transport } from "../src/services/api/http";
import type { Tokens } from "../src/features/auth/types";
import { decodeCredentials } from "../src/features/auth/credentials";

const user = {
  id: "user-a",
  email: "a@example.com",
  display_name: "A",
  timezone: "Europe/Lisbon",
  unit_system: "metric" as const,
  weekly_workout_target: 4,
  created_at: "2026-09-13T00:00:00Z",
};
const tokens = (suffix = "old"): Tokens => ({
  access_token: `access-${suffix}`,
  refresh_token: `refresh-${suffix}`,
  token_type: "bearer",
  expires_in: 600,
  user,
});
const credentials = {
  email: "a@example.com",
  password: "a strong test password",
};
function storage(token: string | null = null) {
  let saved = token;
  return {
    read: vi.fn(async () => saved),
    write: vi.fn(async (next: string) => {
      saved = next;
    }),
    clear: vi.fn(async () => {
      saved = null;
    }),
  } satisfies TokenStorage;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function transport(
  handler: (path: string, options?: RequestInit) => Promise<unknown>,
) {
  return vi.fn(handler) as unknown as Transport;
}

describe("session lifecycle", () => {
  it("restores the cached account offline and refreshes before its next server request", async () => {
    const store = { ...storage("refresh-old"), readUser: async () => user };
    let online = false;
    const api = transport(async (path, options) => {
      if (!online) throw new ApiError("Offline");
      if (path === "/auth/refresh") return tokens("online");
      expect((options?.headers as Record<string, string>).Authorization).toBe(
        "Bearer access-online",
      );
      return user;
    });
    const session = new AuthSession(store, api);
    await session.restore();
    expect(session.getSnapshot()).toMatchObject({
      phase: "signedIn",
      offline: true,
      user,
    });
    online = true;
    expect(await session.authorized("/users/me")).toEqual(user);
    expect(session.getSnapshot().offline).toBeUndefined();
  });

  it("does not unlock a revoked session using cached identity", async () => {
    const store = { ...storage("refresh-old"), readUser: async () => user };
    const session = new AuthSession(
      store,
      transport(async () => {
        throw new ApiError("Revoked", 401);
      }),
    );
    await session.restore();
    expect(session.getSnapshot().phase).toBe("signedOut");
    expect(session.getSnapshot().user).toBeNull();
    expect(await store.read()).toBeNull();
  });

  it("recovers local access during server downtime but not credential-storage failure", async () => {
    const store = { ...storage("refresh-old"), readUser: async () => user };
    const session = new AuthSession(
      store,
      transport(async () => {
        throw new ApiError("Unavailable", 503);
      }),
    );
    await session.restore();
    expect(session.getSnapshot().offline).toBe(true);
    const broken = new AuthSession(
      {
        ...store,
        write: async () => {
          throw new Error("Storage failed");
        },
      },
      transport(async () => tokens()),
    );
    await broken.restore();
    expect(broken.getSnapshot().phase).toBe("recovery");
  });

  it("reads legacy credentials and binds cached identities to the same secure envelope", () => {
    expect(decodeCredentials("legacy-refresh")).toEqual({
      token: "legacy-refresh",
      user: null,
    });
    expect(
      decodeCredentials(JSON.stringify({ version: 1, token: "refresh", user })),
    ).toEqual({ token: "refresh", user });
    expect(() => decodeCredentials('{"version":2}')).toThrow();
    expect(decodeCredentials(null)).toEqual({ token: null, user: null });
  });
  it("does not clear a new account when an old retried request returns 401 late", async () => {
    const delayed = deferred<unknown>();
    let retried = false;
    let loginCount = 0;
    const store = storage();
    const session = new AuthSession(
      store,
      transport(async (path, options) => {
        if (path === "/auth/login")
          return tokens(++loginCount === 1 ? "old" : "another-account");
        if (path === "/auth/refresh") return tokens("new");
        if (path === "/auth/logout") return;
        if (
          (options?.headers as Record<string, string>).Authorization ===
          "Bearer access-old"
        )
          throw new ApiError("Expired", 401);
        retried = true;
        return delayed.promise;
      }),
    );
    await session.restore();
    await session.signIn(credentials);
    const pending = session.authorized("/users/me").catch(() => {});
    await vi.waitFor(() => expect(retried).toBe(true));
    await session.signOut();
    await session.signIn(credentials);
    delayed.reject(new ApiError("Old session revoked", 401));
    await pending;
    expect(session.getSnapshot().phase).toBe("signedIn");
    expect(await store.read()).toBe("refresh-another-account");
  });
  it("stores refresh credentials with cached identity without persisting access tokens", async () => {
    const store = storage();
    const api = transport(async () => tokens());
    const session = new AuthSession(store, api);
    await session.restore();
    expect(session.getSnapshot().phase).toBe("signedOut");
    await session.signIn(credentials);
    expect(store.write).toHaveBeenCalledWith("refresh-old", user);
    const restored = new AuthSession(
      store,
      transport(async () => tokens("new")),
    );
    expect(restored.getSnapshot().user).toBeNull();
    await restored.restore();
    expect(restored.getSnapshot().phase).toBe("signedIn");
    expect(await store.read()).toBe("refresh-new");
  });

  it("keeps the saved token on network failure and clears a revoked session", async () => {
    const store = storage("refresh-old");
    const session = new AuthSession(
      store,
      transport(async () => {
        throw new ApiError("Offline");
      }),
    );
    await session.restore();
    expect(session.getSnapshot().phase).toBe("recovery");
    expect(await store.read()).toBe("refresh-old");
    const revoked = new AuthSession(
      store,
      transport(async () => {
        throw new ApiError("Expired", 401);
      }),
    );
    await revoked.restore();
    expect(revoked.getSnapshot().phase).toBe("signedOut");
    expect(await store.read()).toBeNull();
  });

  it("performs one rotation for simultaneous 401 responses", async () => {
    const rotation = deferred<Tokens>();
    let rotations = 0;
    const session = new AuthSession(
      storage(),
      transport(async (path, options) => {
        if (path === "/auth/login") return tokens();
        if (path === "/auth/refresh") {
          rotations++;
          return rotation.promise;
        }
        if (
          (options?.headers as Record<string, string>).Authorization ===
          "Bearer access-old"
        )
          throw new ApiError("Expired", 401);
        return user;
      }),
    );
    await session.restore();
    await session.signIn(credentials);
    const a = session.authorized("/users/me");
    const b = session.authorized("/users/me");
    await vi.waitFor(() => expect(rotations).toBe(1));
    rotation.resolve(tokens("new"));
    expect(await Promise.all([a, b])).toEqual([user, user]);
    expect(rotations).toBe(1);
  });

  it("waits for rotation before logout and cannot restore the logged-out session", async () => {
    const rotation = deferred<Tokens>();
    let rotating = false;
    let revoked = "";
    const store = storage();
    const session = new AuthSession(
      store,
      transport(async (path, options) => {
        if (path === "/auth/login") return tokens();
        if (path === "/auth/refresh") {
          rotating = true;
          return rotation.promise;
        }
        if (path === "/auth/logout") {
          revoked = JSON.parse(String(options?.body)).refresh_token;
          return;
        }
        if (
          (options?.headers as Record<string, string>).Authorization ===
          "Bearer access-old"
        )
          throw new ApiError("Expired", 401);
        return user;
      }),
    );
    await session.restore();
    await session.signIn(credentials);
    const request = session.authorized("/users/me").catch(() => {});
    await vi.waitFor(() => expect(rotating).toBe(true));
    const logout = session.signOut();
    rotation.resolve(tokens("new"));
    await Promise.all([request, logout]);
    expect(revoked).toBe("refresh-new");
    expect(session.getSnapshot()).toMatchObject({
      phase: "signedOut",
      user: null,
    });
    expect(await store.read()).toBeNull();
  });

  it("never replays a profile mutation on a network error", async () => {
    let mutations = 0;
    const session = new AuthSession(
      storage(),
      transport(async (path) => {
        if (path === "/auth/login") return tokens();
        mutations++;
        throw new ApiError("Timeout");
      }),
    );
    await session.restore();
    await session.signIn(credentials);
    await expect(
      session.updateProfile({
        display_name: "B",
        timezone: "Europe/Lisbon",
        unit_system: "metric",
        weekly_workout_target: 3,
      }),
    ).rejects.toThrow("Timeout");
    expect(mutations).toBe(1);
  });

  it("does not expose login if secure persistence fails and revokes the issued token", async () => {
    const store = storage();
    store.write.mockRejectedValue(new Error("Keychain unavailable"));
    const api = transport(async (path) =>
      path === "/auth/login" ? tokens() : undefined,
    );
    const session = new AuthSession(store, api);
    await session.restore();
    await expect(session.signIn(credentials)).rejects.toThrow("segurança");
    expect(session.getSnapshot().phase).toBe("signedOut");
    expect(api).toHaveBeenCalledWith("/auth/logout", expect.anything());
  });

  it("keeps the session when logout cannot reach the server", async () => {
    const store = storage();
    const session = new AuthSession(
      store,
      transport(async (path) => {
        if (path === "/auth/logout") throw new ApiError("Offline");
        return tokens();
      }),
    );
    await session.restore();
    await session.signIn(credentials);
    await expect(session.signOut()).rejects.toThrow("Offline");
    expect(session.getSnapshot().phase).toBe("signedIn");
    expect(await store.read()).toBe("refresh-old");
  });
});
