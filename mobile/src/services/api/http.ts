const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "network_error",
  ) {
    super(message);
  }
}

export type Transport = <T>(path: string, options?: RequestInit) => Promise<T>;

export const request: Transport = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  if (!baseUrl)
    throw new ApiError(
      "Configura o endereço do serviço para este dispositivo.",
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ApiError(
        typeof data?.error?.message === "string"
          ? data.error.message
          : "O serviço está indisponível. Tenta novamente.",
        response.status,
        typeof data?.error?.code === "string"
          ? data.error.code
          : "service_error",
      );
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? "A ligação demorou demasiado. Verifica a rede e tenta novamente."
        : "Não foi possível ligar ao serviço. Verifica a tua rede.",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
};
