import { useEffect, useRef, useState } from 'react';
import { checkReadiness } from '../services/api/client';

type Connection = { status: 'idle' | 'loading' | 'success' | 'error'; message: string };

export function useConnection() {
  const [connection, setConnection] = useState<Connection>({ status: 'idle', message: '' });
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function check() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setConnection({ status: 'loading', message: 'A verificar ligação…' });
    try {
      await checkReadiness(controller.signal);
      if (!controller.signal.aborted) setConnection({ status: 'success', message: 'Ligação estabelecida.' });
    } catch (error) {
      if (!controller.signal.aborted) {
        setConnection({ status: 'error', message: error instanceof Error ? error.message : 'Erro inesperado.' });
      }
    } finally {
      pending.current = null;
    }
  }

  return { connection, check };
}
