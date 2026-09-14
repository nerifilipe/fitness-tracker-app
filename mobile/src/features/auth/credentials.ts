import type { User } from "./types";

// Legacy installs stored just the token. New writes bind token and cached identity atomically.
export function decodeCredentials(raw: string | null): {
  token: string | null;
  user: User | null;
} {
  if (!raw) return { token: null, user: null };
  if (!raw.startsWith("{")) return { token: raw, user: null };
  const data = JSON.parse(raw);
  if (
    data.version !== 1 ||
    typeof data.token !== "string" ||
    !data.user ||
    typeof data.user.id !== "string" ||
    typeof data.user.email !== "string"
  )
    throw new Error("Não foi possível ler a identidade guardada.");
  return { token: data.token, user: data.user as User };
}
