import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { validateReleaseUrl } = require("../scripts/release-config.cjs");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("release configuration", () => {
  it("requires the public HTTPS API and rejects local/example URLs and embedded credentials", () => {
    for (const value of [
      undefined,
      "",
      "http://api.onrender.com/api/v1",
      "https://localhost/api/v1",
      "https://127.0.0.1/api/v1",
      "https://192.168.1.4/api/v1",
      "https://172.20.1.4/api/v1",
      "https://10.0.2.2/api/v1",
      "https://example.com/api/v1",
      "https://api.onrender.com/",
      "https://user:pass@api.onrender.com/api/v1",
      "https://api.onrender.com/api/v1?token=secret",
    ])
      expect(() => validateReleaseUrl(value)).toThrow();
    expect(
      validateReleaseUrl("https://fitness-tracker-api.onrender.com/api/v1/"),
    ).toBe("https://fitness-tracker-api.onrender.com/api/v1");
  });
  it("validates the release profile without breaking Expo Go development", () => {
    const configure = require("../app.config.js");
    const config = {
      name: "Fitness",
      android: { package: "com.nerifilipe.fitnesstracker" },
    };
    vi.stubEnv("APP_VARIANT", "");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "http://localhost:8000/api/v1");
    expect(configure({ config })).toBe(config);
    vi.stubEnv("APP_VARIANT", "release");
    expect(configure({ config })).toBe(config);
    vi.stubEnv("EAS_BUILD", "true");
    expect(() => configure({ config })).toThrow();
  });
});

async function transport(timeout: string) {
  vi.useFakeTimers();
  vi.stubEnv(
    "EXPO_PUBLIC_API_URL",
    "https://fitness-tracker-api.onrender.com/api/v1",
  );
  vi.stubEnv("EXPO_PUBLIC_API_TIMEOUT_MS", timeout);
  const fetcher = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal!.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const { request } = await import("../src/services/api/http");
  return { request, fetcher };
}

describe("free hosting transport", () => {
  it("allows a cold start, times out once and never repeats a write automatically", async () => {
    const { request, fetcher } = await transport("90000");
    let settled = false;
    const result = request("/auth/login", { method: "POST", body: "{}" }).catch(
      (e) => {
        settled = true;
        return e;
      },
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(80000);
    expect(await result).toMatchObject({
      message: expect.stringContaining("serviço pode estar a iniciar"),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("still aborts immediately when the screen cancels its request", async () => {
    const { request } = await transport("90000");
    const cancel = new AbortController();
    const result = request("/progress/strength/exercises", {
      signal: cancel.signal,
    }).catch((e) => e);
    cancel.abort();
    expect(await result).toMatchObject({ status: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["", "invalid", "9999999", "0"])(
    "retains the 10-second fallback for invalid configuration %s",
    async (value) => {
      const { request } = await transport(value);
      const result = request("/health").catch((e) => e);
      await vi.advanceTimersByTimeAsync(10000);
      expect(await result).toMatchObject({ status: 0 });
    },
  );
});
