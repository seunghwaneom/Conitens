import type { FormEvent, ReactNode } from "react";
import styles from "./CoreRouteScaffold.module.css";
import { useUiStore } from "../store/ui-store.js";
import { pickText } from "../i18n.js";

interface BridgeDraftConfig {
  apiRoot: string;
  token: string;
}

interface CoreRouteScaffoldProps {
  eyebrow: string;
  title: string;
  description: string;
  bridgeLabel: string;
  isDemo: boolean;
  draftConfig: BridgeDraftConfig;
  showConnectForm: boolean;
  onToggleConnectForm: () => void;
  onDraftConfigChange: (next: BridgeDraftConfig) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

export function CoreRouteScaffold({
  eyebrow,
  title,
  description,
  bridgeLabel,
  isDemo,
  draftConfig,
  showConnectForm,
  onToggleConnectForm,
  onDraftConfigChange,
  onSubmit,
  children,
}: CoreRouteScaffoldProps) {
  const locale = useUiStore((state) => state.locale);

  return (
    <section className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2>{title}</h2>
          <p className={styles.description}>{description}</p>
        </div>
      </header>

      <section className={styles.bridgeTray}>
        <div className={styles.bridgeSummary}>
          <span className={`${styles.bridgeState} ${isDemo ? styles.bridgeStateDemo : styles.bridgeStateLive}`}>
            {bridgeLabel}
          </span>
          <p className={styles.bridgeCopy}>
            {isDemo
              ? pickText(locale, {
                  ko: "라이브 브리지가 연결되지 않았습니다. core route는 demo chrome이 아니라 실제 작업면 중심으로 유지됩니다.",
                  en: "No live bridge is connected. Core routes stay focused on the working surface instead of demo chrome.",
                })
              : pickText(locale, {
                  ko: "라이브 브리지가 연결되어 있습니다. 연결 설정은 필요할 때만 펼쳐 수정합니다.",
                  en: "Live bridge is connected. Keep the settings collapsed unless you need to edit the connection.",
                })}
          </p>
        </div>
        <button type="button" className={styles.bridgeButton} onClick={onToggleConnectForm}>
          {showConnectForm
            ? pickText(locale, { ko: "연결 숨기기", en: "Hide connection" })
            : isDemo
              ? pickText(locale, { ko: "라이브 브리지 연결", en: "Connect live bridge" })
              : pickText(locale, { ko: "연결 수정", en: "Edit connection" })}
        </button>
      </section>

      {showConnectForm ? (
        <form className={styles.bridgeForm} onSubmit={onSubmit}>
          <label>
            <span>{pickText(locale, { ko: "API 루트", en: "API root" })}</span>
            <input
              autoComplete="off"
              required
              value={draftConfig.apiRoot}
              onChange={(event) =>
                onDraftConfigChange({ ...draftConfig, apiRoot: event.target.value })
              }
              placeholder="http://127.0.0.1:8785/api"
            />
          </label>
          <label>
            <span>{pickText(locale, { ko: "베어러 토큰", en: "Bearer token" })}</span>
            <input
              type="password"
              autoComplete="off"
              required
              value={draftConfig.token}
              onChange={(event) =>
                onDraftConfigChange({ ...draftConfig, token: event.target.value })
              }
              placeholder="Paste token from `ensemble forward serve`"
            />
          </label>
          <button type="submit">{pickText(locale, { ko: "연결", en: "Connect" })}</button>
        </form>
      ) : null}

      <div className={styles.content}>{children}</div>
    </section>
  );
}
