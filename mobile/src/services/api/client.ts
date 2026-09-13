import { ApiError, request } from "./http";

export async function checkReadiness(signal?: AbortSignal): Promise<void> {
  const data: unknown = await request("/ready", { signal });
  if (
    !data ||
    typeof data !== "object" ||
    !("status" in data) ||
    data.status !== "ok"
  ) {
    throw new ApiError("O serviço devolveu uma resposta inesperada.");
  }
}
