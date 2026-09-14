import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkoutController,
  type LocalWorkout,
  type WorkoutStorage,
} from "../src/features/workouts/controller";
import {
  fromServer,
  togglePause,
  elapsed,
  remaining,
  toggleSet,
  cancelWorkout,
  toSync,
} from "../src/features/workouts/draft";
import type {
  Workout,
  WorkoutApi,
  SyncResult,
  Sync,
} from "../src/features/workouts/api";
import { ApiError } from "../src/services/api/http";

const workout = (): Workout => ({
  id: "workout-a",
  template_id: "plan",
  name_snapshot: "Push A",
  status: "active",
  version: 1,
  started_at: "2026-09-14T12:00:00.000Z",
  paused_at: null,
  paused_seconds: 0,
  finished_at: null,
  rest_deadline: null,
  notes: null,
  exercises: [
    {
      id: "block-a",
      exercise_id: "exercise-a",
      name_snapshot: "Press",
      load_type_snapshot: "external",
      load_convention_snapshot: "total",
      rest_seconds: 90,
      notes: null,
      sets: [
        {
          id: "set-a",
          set_type: "working",
          weight_kg: "20.125",
          reps: 8,
          rir: 2,
          completed_at: null,
        },
      ],
    },
  ],
});
function envelope(w = workout()): LocalWorkout {
  return {
    schema: 1,
    start: null,
    workout: fromServer(w),
    revision: 0,
    ackRevision: 0,
    serverVersion: w.version,
    pending: null,
    conflict: null,
  };
}
function memory(initial: LocalWorkout | null = envelope()) {
  const rows = new Map<string, LocalWorkout | null>([["a", initial]]);
  const backups: LocalWorkout[] = [];
  const storage: WorkoutStorage = {
    load: (id) => structuredClone(rows.get(id) ?? null),
    save: vi.fn((id, value) => {
      rows.set(id, structuredClone(value));
    }),
    backup: vi.fn((_id, value) => {
      backups.push(structuredClone(value));
    }),
  };
  return { storage, rows, backups };
}
function api(): WorkoutApi {
  return {
    start: vi.fn(async () => workout()),
    active: vi.fn(async () => workout()),
    detail: vi.fn(async () => workout()),
    sync: vi.fn(async (_id: string, data: Sync) => ({
      applied_version: data.version + 1,
      workout: {
        ...workout(),
        ...data,
        version: data.version + 1,
        exercises: data.exercises.map((e) => ({
          ...workout().exercises[0],
          ...e,
          sets: e.sets.map((s) => ({
            ...s,
            weight_kg: s.weight_kg == null ? null : String(s.weight_kg),
          })),
        })),
      },
    })),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const controllers: WorkoutController[] = [];
let sequence = 0;
async function setup(store = memory(), remote = api(), user = "a") {
  const controller = new WorkoutController(
    user,
    store.storage,
    remote,
    () => `uuid-${++sequence}`,
  );
  controllers.push(controller);
  controller.initialize();
  await controller.sync();
  return { controller, store, remote };
}
afterEach(() => {
  controllers.splice(0).forEach((c) => c.dispose());
});

describe("durable workout synchronization", () => {
  it("allows correction after a cancellation is definitively rejected, without reopening a synced cancellation", async () => {
    const { controller, remote } = await setup();
    controller.edit((w) => cancelWorkout(w, Date.parse(w.started_at) + 60000));
    vi.mocked(remote.sync).mockRejectedValueOnce(
      new ApiError("Invalid reference", 422),
    );
    await controller.sync();
    controller.correctCancellation();
    expect(controller.getSnapshot().local?.workout?.status).toBe("active");
    expect(controller.getSnapshot().local?.workout?.finished_at).toBeNull();
    controller.edit((w) => cancelWorkout(w, Date.parse(w.started_at) + 120000));
    await controller.sync();
    controller.correctCancellation();
    expect(controller.getSnapshot().local?.workout?.status).toBe("cancelled");
  });
  it("persists each edit before publishing and restores it while offline", async () => {
    const { controller, store, remote } = await setup();
    controller.edit((w) => ({ ...w, notes: "offline note" }));
    expect(store.rows.get("a")?.workout?.notes).toBe("offline note");
    controller.dispose();
    vi.mocked(remote.sync).mockRejectedValue(new ApiError("Offline"));
    const next = await setup(store, remote);
    expect(next.controller.getSnapshot().local?.workout?.notes).toBe(
      "offline note",
    );
    expect(next.controller.getSnapshot().local?.pending).not.toBeNull();
    expect(next.controller.getSnapshot().error).toBe("Offline");
  });

  it("retries the exact persisted request after a lost response and restart", async () => {
    const { controller, store, remote } = await setup();
    controller.edit((w) => ({ ...w, notes: "first" }));
    vi.mocked(remote.sync).mockRejectedValueOnce(new ApiError("Response lost"));
    await controller.sync();
    const sent = structuredClone(store.rows.get("a")!.pending!.request);
    controller.dispose();
    const resumed = await setup(store, remote);
    expect(vi.mocked(remote.sync).mock.calls[1][1]).toEqual(sent);
    expect(resumed.controller.getSnapshot().local?.pending).toBeNull();
    expect(resumed.controller.getSnapshot().local?.serverVersion).toBe(2);
  });

  it("does not overwrite an edit made while the previous request is in flight", async () => {
    const { controller, remote } = await setup();
    const pending = deferred<SyncResult>();
    vi.mocked(remote.sync).mockReturnValueOnce(pending.promise);
    controller.edit((w) => ({ ...w, notes: "sent" }));
    const run = controller.sync();
    controller.edit((w) => ({ ...w, notes: "newer edit" }));
    pending.resolve({
      workout: { ...workout(), notes: "sent", version: 2 },
      applied_version: 2,
    });
    await run;
    expect(controller.getSnapshot().local?.workout?.notes).toBe("newer edit");
    expect(controller.getSnapshot().local?.revision).toBe(2);
    expect(controller.getSnapshot().local?.ackRevision).toBe(1);
    await controller.sync();
    expect(vi.mocked(remote.sync).mock.calls[1][1].notes).toBe("newer edit");
    expect(vi.mocked(remote.sync).mock.calls[1][1].version).toBe(2);
  });

  it("coalesces simultaneous sync calls", async () => {
    const { controller, remote } = await setup();
    const pending = deferred<SyncResult>();
    vi.mocked(remote.sync).mockReturnValueOnce(pending.promise);
    controller.edit((w) => ({ ...w, notes: "once" }));
    const first = controller.sync(),
      second = controller.sync();
    expect(first).toBe(second);
    expect(remote.sync).toHaveBeenCalledTimes(1);
    pending.resolve({
      workout: { ...workout(), version: 2 },
      applied_version: 2,
    });
    await first;
  });

  it("keeps local data on conflict and backs it up before accepting the server", async () => {
    const { controller, store, remote } = await setup();
    controller.edit((w) => ({ ...w, notes: "my local result" }));
    vi.mocked(remote.sync).mockRejectedValueOnce(new ApiError("Conflict", 409));
    vi.mocked(remote.detail).mockResolvedValueOnce({
      ...workout(),
      notes: "remote",
      version: 3,
    });
    await controller.sync();
    expect(controller.getSnapshot().local?.workout?.notes).toBe(
      "my local result",
    );
    expect(controller.getSnapshot().local?.conflict?.version).toBe(3);
    await controller.sync();
    expect(remote.sync).toHaveBeenCalledTimes(1);
    controller.acceptRemote();
    expect(store.backups[0].workout?.notes).toBe("my local result");
    expect(controller.getSnapshot().local?.workout?.notes).toBe("remote");
  });

  it("detects a replay whose applied revision is older than the server", async () => {
    const { controller, remote } = await setup();
    controller.edit((w) => ({ ...w, notes: "local" }));
    vi.mocked(remote.sync).mockResolvedValueOnce({
      workout: { ...workout(), version: 4 },
      applied_version: 2,
    });
    await controller.sync();
    expect(controller.getSnapshot().local?.conflict?.version).toBe(4);
    expect(controller.getSnapshot().local?.workout?.notes).toBe("local");
  });

  it("never announces a local edit as saved if SQLite fails", async () => {
    const { controller, store } = await setup();
    vi.mocked(store.storage.save).mockImplementationOnce(() => {
      throw new Error("Disk full");
    });
    expect(controller.edit((w) => ({ ...w, notes: "lost" }))).toBe(false);
    expect(controller.getSnapshot().local?.workout?.notes).toBeNull();
    expect(controller.getSnapshot().storageError).toBe(true);
    expect(store.rows.get("a")?.workout?.notes).toBeNull();
  });

  it("preserves the pending request if saving its acknowledgement fails", async () => {
    const { controller, store, remote } = await setup();
    controller.edit((w) => ({ ...w, notes: "saved remotely" }));
    vi.mocked(remote.sync).mockImplementationOnce(async () => {
      vi.mocked(store.storage.save).mockImplementationOnce(() => {
        throw new Error("Disk full");
      });
      return { workout: { ...workout(), version: 2 }, applied_version: 2 };
    });
    await controller.sync();
    expect(store.rows.get("a")?.pending).not.toBeNull();
    expect(controller.getSnapshot().storageError).toBe(true);
  });

  it("keeps incomplete text locally and only sends it after validation succeeds", async () => {
    const { controller, remote } = await setup();
    controller.edit((w) => ({
      ...w,
      exercises: w.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, weight: "1," })),
      })),
    }));
    await controller.sync();
    expect(remote.sync).not.toHaveBeenCalled();
    expect(
      controller.getSnapshot().local?.workout?.exercises[0].sets[0].weight,
    ).toBe("1,");
    controller.edit((w) => ({
      ...w,
      exercises: w.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, weight: "1,125" })),
      })),
    }));
    await controller.sync();
    expect(
      vi.mocked(remote.sync).mock.calls[0][1].exercises[0].sets[0].weight_kg,
    ).toBe("1.125");
  });

  it("clears a definitively rejected pending request so corrected data can use a new key", async () => {
    const { controller, remote } = await setup();
    controller.edit((w) => ({ ...w, notes: "bad" }));
    vi.mocked(remote.sync).mockRejectedValueOnce(new ApiError("Invalid", 422));
    await controller.sync();
    expect(controller.getSnapshot().local?.pending).toBeNull();
    controller.edit((w) => ({ ...w, notes: "fixed" }));
    await controller.sync();
    const calls = vi.mocked(remote.sync).mock.calls;
    expect(calls[0][1].mutation_id).not.toBe(calls[1][1].mutation_id);
  });

  it("persists a start intent and retries its UUID after interruption", async () => {
    const store = memory(null),
      remote = api();
    vi.mocked(remote.active).mockResolvedValue(null);
    vi.mocked(remote.start).mockRejectedValueOnce(new ApiError("Lost start"));
    const { controller } = await setup(store, remote);
    await controller.begin("plan", 1);
    const start = store.rows.get("a")!.start;
    controller.dispose();
    await setup(store, remote);
    expect(vi.mocked(remote.start).mock.calls[1][0]).toEqual(start);
    expect(store.rows.get("a")?.start).toBeNull();
  });

  it("ignores a late response after switching accounts", async () => {
    const { controller, store, remote } = await setup();
    const pending = deferred<SyncResult>();
    vi.mocked(remote.sync).mockReturnValueOnce(pending.promise);
    controller.edit((w) => ({ ...w, notes: "account a" }));
    const run = controller.sync();
    controller.dispose();
    const otherApi = api();
    vi.mocked(otherApi.active).mockResolvedValue(null);
    const other = await setup(store, otherApi, "b");
    pending.resolve({
      workout: { ...workout(), version: 2 },
      applied_version: 2,
    });
    await run;
    expect(other.controller.getSnapshot().local).toBeNull();
    expect(store.rows.get("a")?.pending).not.toBeNull();
    expect(store.rows.get("b")).toBeUndefined();
  });

  it("does not overwrite a local edit with a late read response", async () => {
    const { controller, remote } = await setup();
    const pending = deferred<Workout>();
    vi.mocked(remote.detail).mockReturnValueOnce(pending.promise);
    const run = controller.sync();
    controller.edit((w) => ({ ...w, notes: "typed while loading" }));
    pending.resolve({ ...workout(), notes: "old server value" });
    await run;
    expect(controller.getSnapshot().local?.workout?.notes).toBe(
      "typed while loading",
    );
  });
});

describe("workout time and completion", () => {
  const start = Date.parse("2026-09-14T12:00:00.000Z");
  it("derives active time from timestamps across a pause and app restart", () => {
    let live = fromServer(workout());
    live = togglePause(live, start + 60000);
    const restored = JSON.parse(JSON.stringify(live));
    expect(elapsed(restored, start + 3600000)).toBe(60);
    live = togglePause(restored, start + 120000);
    expect(elapsed(live, start + 180000)).toBe(120);
    live = cancelWorkout(live, start + 180000);
    expect(elapsed(live, start + 86400000)).toBe(120);
  });
  it("completes once, starts rest, and lets a set be corrected explicitly", () => {
    const completed = toggleSet(
      fromServer(workout()),
      "block-a",
      "set-a",
      start + 30000,
    );
    expect(remaining(completed.rest_deadline, start + 60000)).toBe(60);
    expect(remaining(completed.rest_deadline, start + 600000)).toBe(0);
    expect(
      toSync(completed, 1, "mutation").exercises[0].sets[0].completed_at,
    ).not.toBeNull();
    const corrected = toggleSet(completed, "block-a", "set-a", start + 31000);
    expect(corrected.exercises[0].sets[0].completed_at).toBeNull();
    expect(corrected.rest_deadline).toBeNull();
  });
  it("requires values before completion and blocks completion during a pause", () => {
    const live = fromServer(workout());
    live.exercises[0].sets[0].weight = "";
    expect(() => toggleSet(live, "block-a", "set-a", start + 10000)).toThrow(
      /Preenche/,
    );
    expect(() =>
      toggleSet(
        togglePause(live, start + 10000),
        "block-a",
        "set-a",
        start + 20000,
      ),
    ).toThrow(/Retoma/);
  });
});
