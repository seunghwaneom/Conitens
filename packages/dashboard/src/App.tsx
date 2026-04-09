import React, { useMemo } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { AppRouter } from "./screens/AppRouter.js";
import { useUiStore } from "./store/ui-store.js";
import { useDashboardStore } from "./store/dashboard-store.js";
import { pickText } from "./i18n.js";

const SHELL_COPY: Record<string, { eyebrow: { ko: string; en: string } } | undefined> = {
  "office-preview": { eyebrow: { ko: "공간 렌즈", en: "Spatial lens" } },
  agents: { eyebrow: { ko: "에이전트 플릿", en: "Agent fleet" } },
  "agent-detail": { eyebrow: { ko: "에이전트 플릿", en: "Agent fleet" } },
  threads: { eyebrow: { ko: "커뮤니케이션 레저", en: "Communication ledger" } },
  "thread-detail": { eyebrow: { ko: "커뮤니케이션 레저", en: "Communication ledger" } },
  approvals: { eyebrow: { ko: "승인 센터", en: "Approval center" } },
  "bg-cli": { eyebrow: { ko: "백그라운드 CLI", en: "Background CLI" } },
  tokens: { eyebrow: { ko: "토큰 예산", en: "Token budget" } },
  "weekly-report": { eyebrow: { ko: "주간 리포트", en: "Weekly report" } },
  "run-detail": { eyebrow: { ko: "런 상세", en: "Run detail" } },
  inbox: { eyebrow: { ko: "운영자 인박스", en: "Operator inbox" } },
};

function resolveEyebrow(screen: string, locale: "ko" | "en"): string {
  if (screen === "tasks" || screen === "task-detail") {
    return pickText(locale, { ko: "운영자 작업", en: "Operator tasks" });
  }
  if (screen === "workspaces" || screen === "workspace-detail") {
    return pickText(locale, { ko: "운영자 워크스페이스", en: "Operator workspaces" });
  }
  if (screen === "runs") return pickText(locale, { ko: "실행 트레이스", en: "Execution traces" });
  const entry = SHELL_COPY[screen];
  return entry ? pickText(locale, entry.eyebrow) : pickText(locale, { ko: "운영 개요", en: "Operator overview" });
}

interface NavItem {
  href: string;
  label: { ko: string; en: string };
  screens: string[];
  group: "primary" | "secondary" | "utility";
}

const NAV_ITEMS: NavItem[] = [
  { href: "#/overview", label: { ko: "개요", en: "Overview" }, screens: ["overview"], group: "primary" },
  { href: "#/inbox", label: { ko: "인박스", en: "Inbox" }, screens: ["inbox"], group: "primary" },
  { href: "#/tasks", label: { ko: "작업", en: "Tasks" }, screens: ["tasks", "task-detail"], group: "primary" },
  { href: "#/runs", label: { ko: "런", en: "Runs" }, screens: ["runs", "run-detail"], group: "primary" },
  { href: "#/workspaces", label: { ko: "워크스페이스", en: "Workspaces" }, screens: ["workspaces", "workspace-detail"], group: "secondary" },
  { href: "#/office-preview", label: { ko: "공간 렌즈", en: "Spatial Lens" }, screens: ["office-preview"], group: "secondary" },
  { href: "#/agents", label: { ko: "에이전트", en: "Agents" }, screens: ["agents", "agent-detail"], group: "secondary" },
  { href: "#/threads", label: { ko: "스레드", en: "Threads" }, screens: ["threads", "thread-detail"], group: "secondary" },
  { href: "#/approvals", label: { ko: "승인", en: "Approvals" }, screens: ["approvals"], group: "secondary" },
  { href: "#/bg-cli", label: { ko: "백그라운드 CLI", en: "BG CLI" }, screens: ["bg-cli"], group: "utility" },
  { href: "#/tokens", label: { ko: "토큰", en: "Tokens" }, screens: ["tokens"], group: "utility" },
  { href: "#/weekly-report", label: { ko: "주간", en: "Weekly" }, screens: ["weekly-report"], group: "utility" },
];

export function App() {
  const route = useUiStore((s) => s.route);
  const locale = useUiStore((s) => s.locale);
  const toggleLocale = useUiStore((s) => s.toggleLocale);
  const config = useDashboardStore((s) => s.config);
  const isOfficePreview = route.screen === "office-preview";

  const primaryNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => item.group === "primary"),
    [],
  );
  const secondaryNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => item.group === "secondary"),
    [],
  );
  const utilityNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => item.group === "utility"),
    [],
  );

  const activeSecondaryItem = useMemo(
    () => secondaryNavItems.find((item) => item.screens.includes(route.screen)) ?? null,
    [route.screen, secondaryNavItems],
  );
  const activeUtilityItem = useMemo(
    () => utilityNavItems.find((item) => item.screens.includes(route.screen)) ?? null,
    [route.screen, utilityNavItems],
  );

  const currentSectionLabel =
    (activeSecondaryItem ? pickText(locale, activeSecondaryItem.label) : null) ??
    (activeUtilityItem ? pickText(locale, activeUtilityItem.label) : null) ??
    resolveEyebrow(route.screen, locale);

  const connectionLabel = isOfficePreview
    ? pickText(locale, { ko: "프리뷰 데이터", en: "Preview data" })
    : config.token
      ? pickText(locale, { ko: "라이브 브리지", en: "Live bridge" })
      : pickText(locale, { ko: "데모 모드", en: "Demo mode" });

  return (
    <div className={`forward-shell${isOfficePreview ? " forward-shell-preview" : ""}`}>
      <header className="forward-header forward-header-compact">
        <div className="forward-brand-block">
          <p className="forward-shell-caption">{currentSectionLabel}</p>
          <a className="forward-brand-link" href="#/overview">
            Conitens
          </a>
        </div>

        <nav className="forward-primary-nav" aria-label="Primary dashboard sections">
          <div className="forward-chip-group">
            {primaryNavItems.map((item) => {
              const isActive = item.screens.includes(route.screen);
              return (
                <a
                  key={item.href}
                  className={`forward-chip forward-chip-link${isActive ? " active" : ""}`}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  {pickText(locale, item.label)}
                </a>
              );
            })}
          </div>
        </nav>

        <div className="forward-shell-controls">
          <button type="button" className="forward-chip forward-chip-link" onClick={toggleLocale}>
            {locale === "ko" ? "EN" : "KO"}
          </button>
          <details className="forward-menu">
            <summary className="forward-chip forward-chip-link">
              {(activeSecondaryItem ? pickText(locale, activeSecondaryItem.label) : null) ??
                (activeUtilityItem ? pickText(locale, activeUtilityItem.label) : null) ??
                pickText(locale, { ko: "더보기", en: "More" })}
            </summary>
            <div className="forward-menu-panel">
              <div className="forward-menu-group">
                <p className="forward-menu-label">{pickText(locale, { ko: "보조", en: "Secondary" })}</p>
                {secondaryNavItems.map((item) => {
                  const isActive = item.screens.includes(route.screen);
                  return (
                    <a
                      key={item.href}
                      className={`forward-menu-link${isActive ? " active" : ""}`}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {pickText(locale, item.label)}
                    </a>
                  );
                })}
              </div>
              <div className="forward-menu-group">
                <p className="forward-menu-label">{pickText(locale, { ko: "유틸리티", en: "Utilities" })}</p>
                {utilityNavItems.map((item) => {
                  const isActive = item.screens.includes(route.screen);
                  return (
                    <a
                      key={item.href}
                      className={`forward-menu-link${isActive ? " active" : ""}`}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {pickText(locale, item.label)}
                    </a>
                  );
                })}
              </div>
            </div>
          </details>

          <div className="forward-shell-meta">
            <span className="forward-chip">{connectionLabel}</span>
            {!isOfficePreview ? (
              <span className="forward-shell-endpoint">{config.apiRoot}</span>
            ) : null}
          </div>
        </div>
      </header>

      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </div>
  );
}
