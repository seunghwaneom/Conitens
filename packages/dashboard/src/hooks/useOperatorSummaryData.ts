import { useEffect, useMemo, useState } from "react";
import { forwardGetOperatorSummary, type ForwardBridgeConfig, type ForwardOperatorSummaryResponse } from "../forward-bridge.js";
import { toOperatorSummaryViewModel } from "../operator-summary-model.js";

type PanelState = "idle" | "loading" | "ready" | "error";

export function useOperatorSummaryData(
  config: ForwardBridgeConfig,
  liveRevision: number,
) {
  const [summary, setSummary] = useState<ForwardOperatorSummaryResponse | null>(null);
  const [state, setState] = useState<PanelState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.token.trim()) {
      setSummary(null);
      setState("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGetOperatorSummary(config)
      .then((payload) => {
        if (cancelled) return;
        setSummary(payload);
        setState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setSummary(null);
        setState("error");
        setError(err.message);
      });

    return () => { cancelled = true; };
  }, [config, liveRevision]);

  const viewModel = useMemo(
    () => (summary ? toOperatorSummaryViewModel(summary) : null),
    [summary],
  );

  return {
    summary,
    viewModel,
    state,
    error,
  };
}
