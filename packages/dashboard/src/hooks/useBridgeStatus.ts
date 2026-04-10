import { useCallback } from "react";
import { useDashboardStore } from "../store/dashboard-store.js";
import { useUiStore } from "../store/ui-store.js";
import { pickText } from "../i18n.js";

export function useBridgeStatus() {
  const config = useDashboardStore((s) => s.config);
  const draftConfig = useDashboardStore((s) => s.draftConfig);
  const connectionStatus = useDashboardStore((s) => s.connectionStatus);
  const connectionError = useDashboardStore((s) => s.connectionError);
  const liveRevision = useDashboardStore((s) => s.liveRevision);
  const setDraftConfig = useDashboardStore((s) => s.setDraftConfig);
  const connectBridge = useDashboardStore((s) => s.connect);
  const bumpRevision = useDashboardStore((s) => s.bumpRevision);

  const showConnectForm = useUiStore((s) => s.showConnectForm);
  const setShowConnectForm = useUiStore((s) => s.setShowConnectForm);
  const locale = useUiStore((s) => s.locale);

  const isDemo = !config.token.trim();
  const bridgeLabel = isDemo
    ? pickText(locale, { ko: "데모 모드", en: "Demo mode" })
    : connectionStatus === "error"
      ? pickText(locale, { ko: "브리지 오류", en: "Bridge error" })
      : connectionStatus === "connecting"
        ? pickText(locale, { ko: "연결 중", en: "Connecting" })
        : pickText(locale, { ko: "라이브 브리지", en: "Live bridge" });

  const handleConnect = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    connectBridge(draftConfig);
  }, [connectBridge, draftConfig]);

  const toggleConnectForm = useCallback(() => {
    setShowConnectForm(!showConnectForm);
  }, [setShowConnectForm, showConnectForm]);

  return {
    config,
    draftConfig,
    connectionStatus,
    connectionError,
    liveRevision,
    locale,
    isDemo,
    bridgeLabel,
    showConnectForm,
    setDraftConfig,
    setShowConnectForm,
    handleConnect,
    toggleConnectForm,
    bumpRevision,
  };
}
