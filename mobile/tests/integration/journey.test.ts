/// <reference types="node" />
import { expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  AuthSession,
  type TokenStorage,
} from "../../src/features/auth/session";
import type { User } from "../../src/features/auth/types";
import { request, ApiError, type Transport } from "../../src/services/api/http";
import { exerciseApi, emptyFilters } from "../../src/features/exercises/api";
import { templateApi } from "../../src/features/templates/api";
import { workoutApi } from "../../src/features/workouts/api";
import { WorkoutController } from "../../src/features/workouts/controller";
import {
  finishWorkout,
  toggleSet,
  togglePause,
  cancelWorkout,
} from "../../src/features/workouts/draft";
import { reportsApi } from "../../src/features/history/api";

// Only the pytest harness enables this test and supplies its isolated HTTP server.
it.skipIf(process.env.FITNESS_INTEGRATION !== "1")(
  "completes the real mobile/API journey with SQLite reopen, lost ACK and account isolation",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "fitness-journey-"));
    const connections: DatabaseSync[] = [];
    const controllers: WorkoutController[] = [];
    let online = true;
    let loseNextWriteResponse = false;
    const sent: string[] = [];
    const transport: Transport = async <T>(
      path: string,
      options?: RequestInit,
    ) => {
      if (!online) throw new ApiError("Simulated disconnected network");
      const isWrite =
        options?.method === "PUT" && path.startsWith("/workouts/");
      if (isWrite) sent.push(String(options.body));
      const result = await request<T>(path, options);
      if (isWrite && loseNextWriteResponse) {
        loseNextWriteResponse = false;
        throw new ApiError("Simulated lost response after server commit");
      }
      return result;
    };
    function credentials() {
      let token: string | null = null;
      let user: User | null = null;
      return {
        read: async () => token,
        readUser: async () => user,
        write: async (next, profile) => {
          token = next;
          user = profile ?? null;
        },
        clear: async () => {
          token = null;
          user = null;
        },
      } satisfies TokenStorage;
    }
    function sqliteAdapter() {
      vi.doMock("expo-sqlite", () => ({
        openDatabaseSync() {
          const db = new DatabaseSync(join(directory, "workouts.db"));
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
    const store = credentials();
    const session = new AuthSession(store, transport);
    try {
      await session.restore();
      await session.signIn(
        {
          email: `${randomUUID()}@example.com`,
          password: "integration password for tests",
          display_name: "Journey tester",
        },
        true,
      );
      expect(session.getSnapshot().phase).toBe("signedIn");
      const userId = session.getSnapshot().user!.id;
      await session.updateProfile({
        display_name: "Updated tester",
        timezone: "Europe/Lisbon",
        unit_system: "metric",
        weekly_workout_target: 2,
      });
      const exercises = await exerciseApi(session).list(emptyFilters, null);
      const exercise = exercises.items.find(
        (item) => item.load_type === "external",
      )!;
      expect(exercise).toBeDefined();
      const plans = templateApi(session);
      const plan = await plans.create({
        name: "Integration Push",
        exercises: [
          {
            exercise_id: exercise.id,
            rest_seconds: 90,
            sets: [
              {
                set_type: "working",
                target_weight_kg: "20.125",
                target_reps_min: 8,
                target_reps_max: 10,
                target_rir: 2,
              },
              {
                set_type: "warmup",
                target_weight_kg: "10",
                target_reps_min: 8,
                target_reps_max: 10,
              },
              {
                set_type: "working",
                target_weight_kg: "20",
                target_reps_min: 8,
                target_reps_max: 10,
              },
            ],
          },
        ],
      });
      expect((await plans.detail(plan.id)).exercises[0].sets).toHaveLength(3);
      sqliteAdapter();
      const firstStorage = (await import("../../src/features/workouts/storage"))
        .workoutStorage;
      const controller = new WorkoutController(
        userId,
        firstStorage,
        workoutApi(session),
        randomUUID,
      );
      controllers.push(controller);
      controller.initialize();
      await controller.sync();
      await controller.begin(plan.id, plan.version);
      const started = controller.getSnapshot().local!.workout!;
      expect(started.status).toBe("active");
      // The plan can change without rewriting the workout snapshot.
      await plans.update(plan.id, plan.version, {
        name: "Renamed plan",
        exercises: [],
      });
      online = false;
      for (const set of started.exercises[0].sets.slice(0, 2))
        expect(
          controller.edit((w) =>
            toggleSet(w, w.exercises[0].id, set.id, Date.now()),
          ),
        ).toBe(true);
      expect(controller.edit((w) => togglePause(w, Date.now()))).toBe(true);
      expect(controller.edit((w) => finishWorkout(w, Date.now()))).toBe(true);
      await controller.sync();
      const pending = structuredClone(
        firstStorage.load(userId)!.pending!.request,
      );
      expect(pending.status).toBe("completed");
      expect(pending.rest_deadline).toBeNull();
      controller.dispose();
      connections.splice(0).forEach((db) => db.close());
      vi.resetModules();
      sqliteAdapter();
      const secondStorage = (
        await import("../../src/features/workouts/storage")
      ).workoutStorage;
      const restored = new AuthSession(store, transport);
      await restored.restore();
      expect(restored.getSnapshot().offline).toBe(true);
      expect(restored.getSnapshot().user?.weekly_workout_target).toBe(2);
      const resumed = new WorkoutController(
        userId,
        secondStorage,
        workoutApi(restored),
        randomUUID,
      );
      controllers.push(resumed);
      resumed.initialize();
      await resumed.sync();
      expect(resumed.getSnapshot().local?.workout?.status).toBe("completed");
      online = true;
      loseNextWriteResponse = true;
      await resumed.sync();
      expect(secondStorage.load(userId)?.pending?.request).toEqual(pending);
      await resumed.sync();
      expect(sent).toHaveLength(2);
      expect(sent[0]).toBe(sent[1]);
      expect(secondStorage.load(userId)?.pending).toBeNull();
      const reports = reportsApi(restored);
      const summary = await reports.report(started.id);
      expect(summary.summary.name).toBe("Integration Push");
      expect(summary.summary.completed_sets).toBe(2);
      expect(summary.summary.skipped_sets).toBe(1);
      expect(Number(summary.summary.volume_kg)).toBe(161);
      expect(summary.records).toHaveLength(2);
      expect(
        (await reports.history({ from: "", to: "" }, null)).items.map(
          (row) => row.id,
        ),
      ).toEqual([started.id]);
      expect(await reports.dashboard()).toMatchObject({
        completed_workouts: 1,
        completed_sets: 2,
        weekly_target: 2,
      });
      expect(await workoutApi(restored).active()).toBeNull();
      // A cancelled session must not alter history or the weekly total.
      const copy = await templateApi(restored).create({
        name: "Cancellation",
        exercises: [
          {
            exercise_id: exercise.id,
            rest_seconds: 0,
            sets: [
              {
                set_type: "working",
                target_reps_min: 8,
                target_reps_max: 8,
                target_weight_kg: "20",
              },
            ],
          },
        ],
      });
      await resumed.begin(copy.id, copy.version);
      expect(resumed.edit((w) => cancelWorkout(w, Date.now()))).toBe(true);
      await resumed.sync();
      expect((await reports.dashboard()).completed_workouts).toBe(1);
      resumed.dispose();
      await restored.signOut();
      const otherStore = credentials();
      const other = new AuthSession(otherStore, transport);
      await other.restore();
      await other.signIn(
        {
          email: `${randomUUID()}@example.com`,
          password: "another integration password",
          display_name: "Other account",
        },
        true,
      );
      expect(secondStorage.load(other.getSnapshot().user!.id)).toBeNull();
      expect(
        (await reportsApi(other).history({ from: "", to: "" }, null)).items,
      ).toEqual([]);
      await expect(reportsApi(other).report(started.id)).rejects.toMatchObject({
        status: 404,
      });
      await other.signOut();
    } finally {
      controllers.forEach((controller) => controller.dispose());
      connections.splice(0).forEach((db) => db.close());
      vi.doUnmock("expo-sqlite");
      vi.resetModules();
      // Remove only the temporary directory created by this test.
      if (dirname(realpathSync(directory)) !== realpathSync(tmpdir()))
        throw new Error("Unexpected test directory");
      rmSync(directory, { recursive: true, force: true });
    }
  },
  60000,
);
