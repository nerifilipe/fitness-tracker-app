import { ApiError } from "../../services/api/http";
import type { Start, Sync, Workout, WorkoutApi } from "./api";
import { fromServer, toSync, type LiveWorkout } from "./draft";

export type LocalWorkout = {
  schema: 1;
  start: Start | null;
  workout: LiveWorkout | null;
  serverVersion: number;
  revision: number;
  ackRevision: number;
  pending: { request: Sync; revision: number } | null;
  conflict: Workout | null;
};
export interface WorkoutStorage {
  load(userId: string): LocalWorkout | null;
  save(userId: string, value: LocalWorkout | null): void;
  backup(userId: string, value: LocalWorkout): void;
}
type State = {
  local: LocalWorkout | null;
  busy: boolean;
  ready: boolean;
  error: string;
  storageError: boolean;
};
const received = (workout: Workout): LocalWorkout => ({
  schema: 1,
  start: null,
  workout: fromServer(workout),
  serverVersion: workout.version,
  revision: 0,
  ackRevision: 0,
  pending: null,
  conflict: null,
});
const needsSync = (value: LocalWorkout | null) =>
  !!value &&
  (!!value.start || !!value.pending || value.revision !== value.ackRevision);

export class WorkoutController {
  private state: State = {
    local: null,
    busy: false,
    ready: false,
    error: "",
    storageError: false,
  };
  private listeners = new Set<() => void>();
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  constructor(
    private userId: string,
    private storage: WorkoutStorage,
    private api: WorkoutApi,
    private uuid: () => string,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(change: Partial<State>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((fn) => fn());
  }
  private persist(local: LocalWorkout | null) {
    try {
      this.storage.save(this.userId, local);
    } catch {
      this.publish({ storageError: true });
      throw new Error(
        "Não foi possível guardar no telemóvel. A última alteração não foi aplicada. Liberta espaço e tenta novamente.",
      );
    }
    this.publish({ local, storageError: false });
  }
  initialize() {
    try {
      this.publish({
        local: this.storage.load(this.userId),
        ready: true,
        storageError: false,
        error: "",
      });
    } catch {
      this.publish({
        error:
          "Não foi possível abrir o treino guardado. Os dados foram preservados; tenta novamente.",
        storageError: true,
      });
      return;
    }
    void this.sync();
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    if (!this.disposed && !this.state.local?.conflict)
      this.timer = setTimeout(() => void this.sync(), 800);
  }
  edit(change: (workout: LiveWorkout) => LiveWorkout): boolean {
    const local = this.state.local;
    if (
      !local?.workout ||
      this.disposed ||
      !["active", "paused"].includes(local.workout.status)
    )
      return false;
    try {
      this.persist({
        ...local,
        workout: change(local.workout),
        revision: local.revision + 1,
      });
      this.publish({ error: "" });
      this.schedule();
      return true;
    } catch (error) {
      this.publish({
        error:
          error instanceof Error ? error.message : "Não foi possível guardar.",
      });
      return false;
    }
  }
  async begin(templateId: string, version: number) {
    if (!this.state.ready || this.state.storageError)
      throw new Error("O armazenamento do treino ainda não está disponível.");
    const local = this.state.local;
    if (
      needsSync(local) ||
      (local?.workout && ["active", "paused"].includes(local.workout.status))
    )
      throw new Error("Já existe um treino em curso ou por sincronizar.");
    if (local) this.storage.backup(this.userId, local);
    this.persist({
      schema: 1,
      start: {
        id: this.uuid(),
        template_id: templateId,
        template_version: version,
      },
      workout: null,
      serverVersion: 0,
      revision: 0,
      ackRevision: 0,
      pending: null,
      conflict: null,
    });
    await this.sync();
  }
  sync = (): Promise<void> => {
    if (this.running) return this.running;
    if (
      this.disposed ||
      !this.state.ready ||
      this.state.storageError ||
      this.state.local?.conflict
    )
      return Promise.resolve();
    this.running = this.performSync()
      .catch((error) => {
        if (!this.disposed)
          this.publish({
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível sincronizar.",
          });
      })
      .finally(() => {
        this.running = null;
        if (!this.disposed && !this.state.error && needsSync(this.state.local))
          this.schedule();
      });
    return this.running;
  };
  private async performSync() {
    this.publish({ busy: true, error: "" });
    try {
      let local = this.state.local;
      if (local?.start) {
        const result = await this.api.start(local.start);
        if (this.disposed) return;
        this.persist(received(result));
        local = this.state.local;
      }
      if (local?.workout && needsSync(local)) {
        if (!local.pending) {
          const request = toSync(
            local.workout,
            local.serverVersion,
            this.uuid(),
          );
          this.persist({
            ...local,
            pending: { request, revision: local.revision },
          });
          local = this.state.local!;
        }
        const pending = local.pending!;
        const result = await this.api.sync(local.workout!.id, pending.request);
        if (this.disposed) return;
        const latest = this.state.local!;
        if (result.workout.version !== result.applied_version) {
          this.persist({ ...latest, conflict: result.workout });
          throw new Error(
            "Há alterações mais recentes noutro dispositivo. O teu registo local foi preservado.",
          );
        }
        this.persist({
          ...latest,
          serverVersion: result.applied_version,
          ackRevision: pending.revision,
          pending: null,
          workout:
            latest.revision === pending.revision
              ? fromServer(result.workout)
              : latest.workout,
        });
      } else {
        const captured = this.state.local;
        const result =
          captured?.workout &&
          ["active", "paused"].includes(captured.workout.status)
            ? await this.api.detail(captured.workout.id)
            : await this.api.active();
        if (this.disposed || this.state.local !== captured) return;
        if (result) this.persist(received(result));
      }
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof ApiError) {
        const local = this.state.local;
        if (error.status === 409 && local?.workout) {
          try {
            const remote = await this.api.detail(local.workout.id);
            if (!this.disposed)
              this.persist({ ...this.state.local!, conflict: remote });
          } catch {
            /* Keep the pending request and retry conflict lookup when online. */
          }
        } else if (local?.start && [404, 409, 422].includes(error.status)) {
          // A definitive rejection created no workout for this intent.
          this.persist(null);
          if (error.code === "active_workout_exists") {
            const remote = await this.api.active().catch(() => null);
            if (remote && !this.disposed) this.persist(received(remote));
          }
        } else if (error.status === 422 && local?.pending) {
          this.persist({ ...local, pending: null });
        }
      }
      if (!this.disposed)
        this.publish({
          error:
            error instanceof Error
              ? error.message
              : "Sem ligação. O treino continua guardado no telemóvel.",
        });
    } finally {
      if (!this.disposed) this.publish({ busy: false });
    }
  }
  acceptRemote() {
    const local = this.state.local;
    if (!local?.conflict) return;
    try {
      this.storage.backup(this.userId, local);
      this.persist(received(local.conflict));
      this.publish({ error: "" });
    } catch {
      this.publish({
        error:
          "Não foi possível preservar a cópia local. Nenhum dado foi substituído.",
      });
    }
  }
  retryStorage() {
    if (this.disposed) return;
    if (!this.state.ready) this.initialize();
    else {
      try {
        this.persist(this.state.local);
        this.publish({ error: "" });
        void this.sync();
      } catch (error) {
        this.publish({
          error:
            error instanceof Error ? error.message : "Erro no armazenamento.",
        });
      }
    }
  }
  correctCancellation() {
    const local = this.state.local;
    if (
      this.disposed ||
      !local?.workout ||
      local.workout.status !== "cancelled" ||
      local.pending ||
      local.conflict ||
      local.revision === local.ackRevision
    )
      return;
    try {
      this.persist({
        ...local,
        workout: { ...local.workout, status: "active", finished_at: null },
        revision: local.revision + 1,
      });
      this.publish({ error: "" });
      this.schedule();
    } catch (error) {
      this.publish({
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível recuperar a edição.",
      });
    }
  }
}
