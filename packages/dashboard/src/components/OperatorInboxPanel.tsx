import type { OperatorInboxItemViewModel } from "../operator-inbox-model.js";
import { EmptyState, ErrorDisplay, LoadingState, Badge } from "../ds/index.js";
import styles from "./OperatorInboxPanel.module.css";
import { pickText, localizeStatus } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorInboxPanelProps {
  items: OperatorInboxItemViewModel[];
  state: PanelState;
  error: string | null;
}

const TONE_STYLE: Record<string, string> = {
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  info: styles.toneInfo,
  neutral: styles.toneNeutral,
};

export function OperatorInboxPanel({ items, state, error }: OperatorInboxPanelProps) {
  const locale = useUiStore((state) => state.locale);
  if (state === "loading") {
    return <LoadingState message={pickText(locale, { ko: "운영자 인박스 로딩 중…", en: "Loading operator inbox…" })} />;
  }
  if (state === "error") {
    return <ErrorDisplay message={error ?? "Unknown error"} />;
  }
  if (state === "idle") {
    return (
      <div className={styles.placeholder}>
        <h3>{pickText(locale, { ko: "운영자 인박스 플레이스홀더", en: "Operator inbox placeholder" })}</h3>
        <p>{pickText(locale, { ko: "조치 가능한 operator attention item을 보려면 라이브 브리지를 연결하세요.", en: "Connect to a live bridge to load actionable operator attention items." })}</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className={styles.placeholder}>
        <h3>{pickText(locale, { ko: "인박스가 비어 있습니다", en: "Inbox is clear" })}</h3>
        <p>{pickText(locale, { ko: "현재 승인, validator failure, blocked handoff, stale run이 프로젝션되지 않았습니다.", en: "No approvals, validator failures, blocked handoffs, or stale runs are currently projected." })}</p>
      </div>
    );
  }

  return (
    <div className={styles.detailBody}>
      <div className={styles.detailHero}>
        <div>
          <p className={styles.detailLabel}>{pickText(locale, { ko: "운영자 인박스", en: "Operator inbox" })}</p>
          <h3>{pickText(locale, { ko: "액션 큐", en: "Action queue" })}</h3>
          <p>{pickText(locale, { ko: `프로젝션된 attention item ${items.length}개`, en: `${items.length} projected attention item${items.length === 1 ? "" : "s"}` })}</p>
        </div>
        <Badge variant="warning">{pickText(locale, { ko: "주의", en: "attention" })}</Badge>
      </div>
      <div className={styles.runList}>
        {items.map((item) => {
          const toneClass = TONE_STYLE[item.tone] ?? styles.toneNeutral;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.runItem} ${toneClass}`}
              onClick={() => {
                window.location.hash = item.targetHash;
              }}
            >
              <div className={styles.runTopline}>
                <strong>{item.title}</strong>
                <span>{localizeStatus(locale, item.tone)}</span>
              </div>
              <p>{item.detail}</p>
              <div className={styles.metricRow}>
                <span>{item.meta}</span>
                <span>{item.actionLabel}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
