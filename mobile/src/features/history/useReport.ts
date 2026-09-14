import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

// The caller supplies a stable loader; losing focus invalidates late responses.
export function useReport<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useFocusEffect(
    useCallback(() => {
      const request = new AbortController();
      setLoading(true);
      setError("");
      setData(null);
      void load(request.signal)
        .then((result) => {
          if (!request.signal.aborted) setData(result);
        })
        .catch((err: unknown) => {
          if (!request.signal.aborted)
            setError(
              err instanceof Error
                ? err.message
                : "Não foi possível carregar os resultados.",
            );
        })
        .finally(() => {
          if (!request.signal.aborted) setLoading(false);
        });
      return () => request.abort();
    }, [load, revision]),
  );
  return {
    data,
    loading,
    error,
    reload: () => setRevision((value) => value + 1),
  };
}
