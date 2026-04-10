import type { OperatorSummaryViewModel } from "../operator-summary-model.js";
import { LoadingState, ErrorDisplay } from "../ds/index.js";
import styles from "./OperatorSummaryPanel.module.css";
import { pickText, localizeLabel, localizeStatus } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorSummaryPanelProps {
  summary: OperatorSummaryViewModel | null;
  state: PanelState;
  error: string | null;
}

export function OperatorSummaryPanel({ summary, state, error }: OperatorSummaryPanelProps) {
  const locale = useUiStore((state) => state.locale);
  if (state === "loading") {
    return <LoadingState message={pickText(locale, { ko: "운영자 요약 로딩 중…", en: "Loading operator summary…" })} className={styles.empty} />;
  }
  if (state === "error") {
    return <ErrorDisplay message={error ?? "Unknown error"} className={styles.error} />;
  }
  if (state === "idle" || !summary) {
    return (
      <div className={styles.placeholder}>
        <h3>{pickText(locale, { ko: "운영 개요 플레이스홀더", en: "Operator overview placeholder" })}</h3>
        <p>{pickText(locale, { ko: "현재 operator posture를 로드하려면 라이브 브리지를 연결하세요.", en: "Connect to a live bridge to load the current operator posture." })}</p>
      </div>
    );
  }

  return (
    <div className={styles.detailBody}>
      <div className={styles.detailHero}>
        <div>
          <p className={styles.detailLabel}>{pickText(locale, { ko: "운영자 posture", en: "Operator posture" })}</p>
          <h3>{pickText(locale, { ko: "Forward operator overview", en: "Forward operator overview" })}</h3>
          <p>{summary.latestRunLabel}</p>
        </div>
        <span className={styles.statusPill}>{localizeStatus(locale, summary.postureLabel)}</span>
      </div>
      <div className={styles.stats}>
        {summary.metrics.map((item) => (
          <div key={item.id}>
            <span>{localizeLabel(locale, item.label)}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.panelLabel}>{pickText(locale, { ko: "주의", en: "Attention" })}</p>
            <h3>{pickText(locale, { ko: "지금 필요한 조치", en: "What needs action now" })}</h3>
          </div>
        </div>
        <ul className={styles.timeline}>
          {summary.attention.map((item) => (
            <li key={item.id}>
              <div className={styles.timelineTopline}>
                <strong>{item.title}</strong>
                <span>{localizeStatus(locale, item.tone)}</span>
              </div>
              <p>{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
