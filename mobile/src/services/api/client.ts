// Public configuration only. Never put a secret in an EXPO_PUBLIC_* variable.
const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export async function checkReadiness(signal?: AbortSignal): Promise<void> {
  if (!baseUrl) throw new Error('Ligação ainda não configurada neste dispositivo.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 5000);
  try {
    const response = await fetch(`${baseUrl}/ready`, { signal: controller.signal });
    if (response.status === 503) throw new Error('O serviço está temporariamente indisponível.');
    if (!response.ok) throw new Error('Não foi possível verificar a ligação.');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok') {
      throw new Error('O serviço devolveu uma resposta inesperada.');
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('A ligação demorou demasiado. Tenta novamente.');
    if (error instanceof TypeError) throw new Error('Sem ligação ao serviço. Verifica a tua rede.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
