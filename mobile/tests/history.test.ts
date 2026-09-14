import { describe, expect, it, vi } from "vitest";
import { HistoryController } from "../src/features/history/controller";
import {
  validateDates,
  type HistoryPage,
  type reportsApi,
} from "../src/features/history/api";

function page(ids: string[], cursor: string | null = null): HistoryPage {
  return {
    timezone: "Europe/Lisbon",
    next_cursor: cursor,
    items: ids.map((id) => ({
      id,
      name: "Push",
      started_at: "2026-09-14T12:00:00Z",
      finished_at: "2026-09-14T13:00:00Z",
      active_seconds: 3500,
      completed_sets: 3,
      skipped_sets: 1,
      exercise_count: 1,
      volume_kg: "480",
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
function setup() {
  const api = {
    history: vi
      .fn<ReturnType<typeof reportsApi>["history"]>()
      .mockResolvedValue(page([])),
  };
  return { api, controller: new HistoryController(api) };
}

describe("history pagination", () => {
  it("ignores a late page from previous date filters", async () => {
    const { api, controller } = setup();
    api.history.mockResolvedValueOnce(page(["a"], "cursor-a"));
    await controller.refresh();
    const pending = deferred<HistoryPage>();
    api.history.mockReturnValueOnce(pending.promise);
    const old = controller.more();
    api.history.mockResolvedValueOnce(page(["new"]));
    await controller.refresh({ from: "2026-09-01", to: "2026-09-30" });
    pending.resolve(page(["old"]));
    await old;
    expect(controller.getSnapshot().page?.items.map((r) => r.id)).toEqual([
      "new",
    ]);
    expect(api.history.mock.calls[2][0]).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });
  it("coalesces pagination, deduplicates rows and retains pages for retry", async () => {
    const { api, controller } = setup();
    api.history.mockResolvedValueOnce(page(["a"], "cursor-a"));
    await controller.refresh();
    const pending = deferred<HistoryPage>();
    api.history.mockReturnValueOnce(pending.promise);
    const more = controller.more();
    await controller.more();
    expect(api.history).toHaveBeenCalledTimes(2);
    pending.reject(new Error("Offline"));
    await more;
    expect(controller.getSnapshot().page?.items).toHaveLength(1);
    expect(controller.getSnapshot().error).toBe("Offline");
    api.history.mockResolvedValueOnce(page(["a", "b"]));
    await controller.more();
    expect(api.history.mock.calls[2][1]).toBe("cursor-a");
    expect(controller.getSnapshot().page?.items.map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
    await controller.more();
    expect(api.history).toHaveBeenCalledTimes(3);
  });
  it("does not publish a response after leaving the screen or account", async () => {
    const { api, controller } = setup();
    const pending = deferred<HistoryPage>();
    api.history.mockReturnValueOnce(pending.promise);
    const run = controller.refresh();
    const before = controller.getSnapshot();
    controller.cancel();
    pending.resolve(page(["private"]));
    await run;
    expect(controller.getSnapshot()).toBe(before);
    expect(api.history.mock.calls[0][2]?.aborted).toBe(true);
  });
  it("rejects invalid dates before issuing a request", async () => {
    const { api, controller } = setup();
    await controller.refresh({ from: "2026-02-30", to: "" });
    expect(api.history).not.toHaveBeenCalled();
    expect(controller.getSnapshot().error).toMatch(/datas válidas/);
    for (const dates of [
      { from: "2026-04-01", to: "2026-03-01" },
      { from: "0001-01-01", to: "" },
      { from: "", to: "9999-12-31" },
    ])
      expect(() => validateDates(dates)).toThrow();
    expect(() =>
      validateDates({ from: "2024-02-29", to: "2024-02-29" }),
    ).not.toThrow();
  });
});
