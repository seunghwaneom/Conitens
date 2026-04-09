import { useEffect, useMemo, useState } from "react";
import { forwardGetOperatorInbox, type ForwardBridgeConfig, type ForwardOperatorInboxResponse } from "../forward-bridge.js";
import { toOperatorInboxViewModel } from "../operator-inbox-model.js";

type PanelState = "idle" | "loading" | "ready" | "error";

export function useOperatorInboxData(
  config: ForwardBridgeConfig,
  liveRevision: number,
) {
  const [inbox, setInbox] = useState<ForwardOperatorInboxResponse | null>(null);
  const [state, setState] = useState<PanelState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.token.trim()) {
      setInbox(null);
      setState("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGetOperatorInbox(config)
      .then((payload) => {
        if (cancelled) return;
        setInbox(payload);
        setState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setInbox(null);
        setState("error");
        setError(err.message);
      });

    return () => { cancelled = true; };
  }, [config, liveRevision]);

  const items = useMemo(
    () => (inbox ? toOperatorInboxViewModel(inbox) : []),
    [inbox],
  );

  return {
    inbox,
    items,
    state,
    error,
  };
}
