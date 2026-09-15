import { useEffect, useRef, useState } from "react";

export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run<T>(action: () => Promise<T>, success: (value: T) => void) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (mounted.current) success(result);
    } catch (err) {
      if (mounted.current)
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível guardar. Tenta novamente.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, run };
}
