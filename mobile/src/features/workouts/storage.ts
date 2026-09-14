import * as SQLite from "expo-sqlite";
import type { LocalWorkout, WorkoutStorage } from "./controller";

let database: SQLite.SQLiteDatabase | null = null;
function db() {
  if (!database) {
    const opened = SQLite.openDatabaseSync("fitness-workouts.db");
    opened.execSync(`PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS active_workout_v1 (user_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workout_recovery_v1 (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS recovery_user ON workout_recovery_v1(user_id, id);`);
    database = opened;
  }
  return database;
}
export const workoutStorage: WorkoutStorage = {
  load(userId) {
    const row = db().getFirstSync<{ payload: string }>(
      "SELECT payload FROM active_workout_v1 WHERE user_id = ?",
      userId,
    );
    if (!row) return null;
    const value = JSON.parse(row.payload) as LocalWorkout;
    if (
      value.schema !== 1 ||
      typeof value.revision !== "number" ||
      (value.workout && !Array.isArray(value.workout.exercises))
    )
      throw new Error("Unsupported local workout");
    return value;
  },
  save(userId, value) {
    if (value === null)
      db().runSync("DELETE FROM active_workout_v1 WHERE user_id = ?", userId);
    else
      db().runSync(
        "INSERT INTO active_workout_v1 (user_id, payload) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload",
        userId,
        JSON.stringify(value),
      );
  },
  backup(userId, value) {
    db().runSync(
      "INSERT INTO workout_recovery_v1 (user_id, payload, saved_at) VALUES (?, ?, ?)",
      userId,
      JSON.stringify(value),
      new Date().toISOString(),
    );
  },
};
export function latestRecovery(userId: string): string | null {
  return (
    db().getFirstSync<{ payload: string }>(
      "SELECT payload FROM workout_recovery_v1 WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      userId,
    )?.payload ?? null
  );
}
