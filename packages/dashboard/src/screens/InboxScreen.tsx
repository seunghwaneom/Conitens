import { useMemo } from "react";
import { CoreRouteScaffold } from "../components/CoreRouteScaffold.js";
import { OperatorInboxPanel } from "../components/OperatorInboxPanel.js";
import { useBridgeStatus } from "../hooks/useBridgeStatus.js";
import { useOperatorInboxData } from "../hooks/useOperatorInboxData.js";
import { buildForwardRoute } from "../forward-route.js";
import { pickText } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";
import styles from "./CoreRouteWorkspace.module.css";

export function InboxScreen() {
  const locale = useUiStore((state) => state.locale);
  const {
    config,
    draftConfig,
    setDraftConfig,
    showConnectForm,
    toggleConnectForm,
    handleConnect,
    isDemo,
    bridgeLabel,
    liveRevision,
  } = useBridgeStatus();
  const { items, state, error } = useOperatorInboxData(config, liveRevision);
  const demoItems = useMemo(
    () => [
      {
        id: "demo-approval",
        tone: "warning" as const,
        title: pickText(locale, { ko: "런을 재개하기 전에 proposal queue를 검토하세요", en: "Review proposal queue before resuming the run" }),
        detail: pickText(locale, { ko: "데모 proposal queue가 대기 중인 operator approval을 대신합니다.", en: "The demo proposal queue is standing in for pending operator approvals." }),
        meta: "demo-run-001 | review-room",
        actionLabel: pickText(locale, { ko: "런 보기", en: "Inspect run" }),
        targetHash: buildForwardRoute({
          screen: "run-detail",
          runId: "demo-run-001",
          taskId: null,
          workspaceId: null,
          threadId: null,
          agentId: null,
        }),
      },
      {
        id: "demo-validation",
        tone: "danger" as const,
        title: pickText(locale, { ko: "Replay evidence에 validator pass가 필요합니다", en: "Replay evidence needs a validator pass" }),
        detail: pickText(locale, { ko: "데모 shell용 샘플 failure lane입니다. 라이브 브리지를 연결하면 실제 validator output으로 교체됩니다.", en: "Sample failure lane for the demo shell. Connect a live bridge to replace this with real validator output." }),
        meta: "demo-run-001 | iter-1",
        actionLabel: pickText(locale, { ko: "런 보기", en: "Inspect run" }),
        targetHash: buildForwardRoute({
          screen: "run-detail",
          runId: "demo-run-001",
          taskId: null,
          workspaceId: null,
          threadId: null,
          agentId: null,
        }),
      },
    ],
    [locale],
  );

  return (
    <main className="forward-main">
      <CoreRouteScaffold
        eyebrow={pickText(locale, { ko: "운영자 인박스", en: "Operator inbox" })}
        title={pickText(locale, { ko: "인박스", en: "Inbox" })}
        description={pickText(locale, { ko: "승인, validator failure, blocked handoff 같은 operator attention item을 단일 작업면에서 정리합니다.", en: "Keep approvals, validator failures, and blocked handoffs in one action queue." })}
        bridgeLabel={bridgeLabel}
        isDemo={isDemo}
        draftConfig={draftConfig}
        showConnectForm={showConnectForm}
        onToggleConnectForm={toggleConnectForm}
        onDraftConfigChange={setDraftConfig}
        onSubmit={handleConnect}
      >
        <section className={styles.panel}>
          <OperatorInboxPanel items={isDemo ? demoItems : items} state={isDemo ? "ready" : state} error={error} />
        </section>
      </CoreRouteScaffold>
    </main>
  );
}
