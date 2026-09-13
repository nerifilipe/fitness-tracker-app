import { describe, expect, it, vi } from "vitest";
import { ExerciseLibrary } from "../src/features/exercises/library";
import {
  emptyFilters,
  type Exercise,
  type ExercisePage,
} from "../src/features/exercises/api";

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const exercise = (id: string): Exercise => ({
  id,
  name: id,
  equipment: "dumbbell",
  load_type: "external",
  load_convention: "per_hand",
  primary_muscle: { id: "chest", slug: "chest", name: "Peito" },
  secondary_muscles: [],
  is_custom: false,
  is_favorite: false,
  instructions: null,
  created_at: "",
  updated_at: "",
});

describe("exercise library requests", () => {
  it("ignores a late response after changing search filters", async () => {
    const old = pending<ExercisePage>();
    const list = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ items: [exercise("new")], next_cursor: null });
    const library = new ExerciseLibrary({ list });
    const first = library.load({ ...emptyFilters, q: "old" });
    await library.load({ ...emptyFilters, q: "new" });
    old.resolve({ items: [exercise("old")], next_cursor: "old-cursor" });
    await first;
    expect(library.getSnapshot().items.map((item) => item.id)).toEqual(["new"]);
    expect(library.getSnapshot().cursor).toBeNull();
    expect(list.mock.calls[0][2].aborted).toBe(true);
  });

  it("prevents concurrent page loads and keeps unique IDs", async () => {
    const next = pending<ExercisePage>();
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [exercise("a")], next_cursor: "page2" })
      .mockReturnValueOnce(next.promise);
    const library = new ExerciseLibrary({ list });
    await library.load();
    const one = library.load(emptyFilters, true);
    await library.load(emptyFilters, true);
    expect(list).toHaveBeenCalledTimes(2);
    next.resolve({ items: [exercise("a"), exercise("b")], next_cursor: null });
    await one;
    expect(library.getSnapshot().items.map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    await library.load(emptyFilters, true);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("preserves the current page and cursor if loading more fails", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [exercise("a")], next_cursor: "page2" })
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ items: [exercise("b")], next_cursor: null });
    const library = new ExerciseLibrary({ list });
    await library.load();
    await library.load(emptyFilters, true);
    expect(library.getSnapshot()).toMatchObject({
      items: [exercise("a")],
      cursor: "page2",
      error: "Offline",
      loadingMore: false,
    });
    await library.load(emptyFilters, true);
    expect(library.getSnapshot().items.map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(list.mock.calls[2][1]).toBe("page2");
  });

  it("does not publish results after navigating away or signing out", async () => {
    const request = pending<ExercisePage>();
    const library = new ExerciseLibrary({ list: () => request.promise });
    const changes = vi.fn();
    library.subscribe(changes);
    const loading = library.load();
    library.cancel();
    changes.mockClear();
    request.resolve({ items: [exercise("private")], next_cursor: null });
    await loading;
    expect(changes).not.toHaveBeenCalled();
    expect(library.getSnapshot().items).toEqual([]);
  });
});
