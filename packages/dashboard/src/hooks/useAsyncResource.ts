import { useState, useEffect, useCallback, useRef } from "react";
import { type LoadState, toErrorMessage } from "../types/async.js";

export interface AsyncResource<T> {
  data: T | null;
  state: LoadState;
  error: string | null;
  refetch: () => void;
}

export function useAsyncResource<T>(
  fetcher: (() => Promise<T>) | null,
  deps: readonly unknown[] = [],
): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (fetcher === null) {
      setState("idle");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    setError(null);

    fetcher()
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setState("ready");
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(toErrorMessage(err));
          setState("error");
        }
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, ...deps]);

  const refetch = useCallback(() => {
    setTrigger((n) => n + 1);
  }, []);

  return { data, state, error, refetch };
}
