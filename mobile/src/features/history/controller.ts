import {
  validateDates,
  type Dates,
  type HistoryPage,
  type reportsApi,
} from "./api";

export class HistoryController {
  private state = {
    page: null as HistoryPage | null,
    loading: false,
    error: "",
  };
  private listeners = new Set<() => void>();
  private pending: AbortController | null = null;
  private dates: Dates = { from: "", to: "" };
  constructor(private api: Pick<ReturnType<typeof reportsApi>, "history">) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(value: Partial<typeof this.state>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach((listener) => listener());
  }
  cancel() {
    this.pending?.abort();
    this.pending = null;
  }
  async refresh(dates = this.dates) {
    try {
      validateDates(dates);
    } catch (error) {
      this.publish({ error: (error as Error).message });
      return;
    }
    this.dates = { ...dates };
    await this.load(null);
  }
  async more() {
    if (this.pending || !this.state.page?.next_cursor) return;
    await this.load(this.state.page.next_cursor);
  }
  private async load(cursor: string | null) {
    this.cancel();
    const request = new AbortController();
    this.pending = request;
    this.publish({
      loading: true,
      error: "",
      ...(cursor ? {} : { page: null }),
    });
    try {
      const result = await this.api.history(this.dates, cursor, request.signal);
      if (request.signal.aborted) return;
      const items = cursor
        ? [...(this.state.page?.items ?? []), ...result.items]
        : result.items;
      this.publish({
        page: {
          ...result,
          items: [...new Map(items.map((item) => [item.id, item])).values()],
        },
      });
    } catch (error) {
      if (!request.signal.aborted)
        this.publish({
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o histórico.",
        });
    } finally {
      if (!request.signal.aborted) {
        this.pending = null;
        this.publish({ loading: false });
      }
    }
  }
}
