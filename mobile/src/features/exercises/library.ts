import type { Exercise, ExerciseApi, Filters } from "./api";
import { emptyFilters } from "./api";

type State = {
  items: Exercise[];
  cursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string;
};

// A late search/page response must never replace the user's newer filter selection.
export class ExerciseLibrary {
  private state: State = {
    items: [],
    cursor: null,
    loading: false,
    loadingMore: false,
    error: "",
  };
  private filters = emptyFilters;
  private generation = 0;
  private pending: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private api: Pick<ExerciseApi, "list">) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(state: State) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  cancel = () => {
    this.generation++;
    this.pending?.abort();
    this.pending = null;
  };

  async load(filters: Filters = this.filters, more = false) {
    if (
      more &&
      (this.state.loading || this.state.loadingMore || !this.state.cursor)
    )
      return;
    this.cancel();
    this.filters = { ...filters };
    const generation = this.generation;
    const controller = new AbortController();
    this.pending = controller;
    const previous = more ? this.state.items : [];
    const cursor = more ? this.state.cursor : null;
    this.publish({
      items: previous,
      cursor,
      loading: !more,
      loadingMore: more,
      error: "",
    });
    try {
      const page = await this.api.list(filters, cursor, controller.signal);
      if (generation !== this.generation) return;
      const items = [
        ...new Map(
          [...previous, ...page.items].map((item) => [item.id, item]),
        ).values(),
      ];
      this.publish({
        items,
        cursor: page.next_cursor,
        loading: false,
        loadingMore: false,
        error: "",
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.publish({
        items: previous,
        cursor,
        loading: false,
        loadingMore: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os exercícios.",
      });
    } finally {
      if (generation === this.generation) this.pending = null;
    }
  }
}
