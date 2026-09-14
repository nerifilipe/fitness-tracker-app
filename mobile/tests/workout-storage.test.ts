/// <reference types="node" />
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalWorkout } from "../src/features/workouts/controller";

const directory = mkdtempSync(join(tmpdir(), "fitness-sqlite-test-"));
const path = join(directory, "workouts.db");
const connections: DatabaseSync[] = [];
function installAdapter() {
  vi.doMock("expo-sqlite", () => ({
    openDatabaseSync() {
      const db = new DatabaseSync(path);
      connections.push(db);
      return {
        execSync: (sql: string) => db.exec(sql),
        runSync: (sql: string, ...args: SQLInputValue[]) =>
          db.prepare(sql).run(...args),
        getFirstSync: (sql: string, ...args: SQLInputValue[]) =>
          db.prepare(sql).get(...args) ?? null,
      };
    },
  }));
}
afterEach(() => {
  connections.splice(0).forEach((db) => db.close());
  vi.doUnmock("expo-sqlite");
  vi.resetModules();
  rmSync(directory, { recursive: true, force: true });
});

it("persists SQLite data across connections, isolates accounts and retains recovery copies", async () => {
  installAdapter();
  const { workoutStorage, latestRecovery } =
    await import("../src/features/workouts/storage");
  const local: LocalWorkout = {
    schema: 1,
    start: { id: "intent", template_id: "plan", template_version: 1 },
    workout: null,
    serverVersion: 0,
    revision: 0,
    ackRevision: 0,
    pending: null,
    conflict: null,
  };
  workoutStorage.save("user-a", local);
  workoutStorage.backup("user-a", local);
  expect(workoutStorage.load("user-b")).toBeNull();
  expect(latestRecovery("user-b")).toBeNull();
  expect(JSON.parse(latestRecovery("user-a")!)).toEqual(local);
  connections.splice(0).forEach((db) => db.close());
  vi.resetModules();
  installAdapter();
  const reopened = await import("../src/features/workouts/storage");
  expect(reopened.workoutStorage.load("user-a")).toEqual(local);
  expect(connections[0].prepare("PRAGMA synchronous").get()?.synchronous).toBe(
    2,
  );
  reopened.workoutStorage.save("user-b", { ...local, revision: 5 });
  reopened.workoutStorage.save("user-a", null);
  expect(reopened.workoutStorage.load("user-b")?.revision).toBe(5);
  expect(reopened.latestRecovery("user-a")).not.toBeNull();
  connections[0]
    .prepare("UPDATE active_workout_v1 SET payload = ? WHERE user_id = ?")
    .run('{"schema":99}', "user-b");
  expect(() => reopened.workoutStorage.load("user-b")).toThrow();
  expect(
    connections[0]
      .prepare("SELECT payload FROM active_workout_v1 WHERE user_id = ?")
      .get("user-b")?.payload,
  ).toBe('{"schema":99}');
});
