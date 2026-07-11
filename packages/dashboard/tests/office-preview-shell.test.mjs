import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_SRC = path.resolve(TEST_DIR, "../src");

test("office preview shell keeps the handoff workbench primary and the character cast secondary", () => {
  const pixelOfficeSource = readDashboardSource("components/PixelOffice.tsx");
  const officeStageSource = readDashboardSource("components/OfficeStage.tsx");
  const characterStageSource = readDashboardSource("components/AgentCharacterStage.tsx");
  const officeAvatarSource = readDashboardSource("components/OfficeAvatar.tsx");
  const officeCssSource = readDashboardSource("office.module.css");
  const stageCssSource = readDashboardSource("office-stage.module.css");

  assert.match(pixelOfficeSource, /data-office-preview-shell=\{getOfficePreviewShellMode\(stageMode\)\}/);
  assert.match(pixelOfficeSource, /if \(stageMode === "focused"\) return "workbench-dominant";/);
  assert.match(
    officeCssSource,
    /\.office-frame\[data-office-preview-shell="workbench-dominant"\]/,
  );
  assert.match(
    officeCssSource,
    /\.office-layout\[data-stage-mode="focused"\]/,
  );
  assert.match(officeStageSource, /<FocusedHandoffView/);
  assert.match(officeStageSource, /<AgentCharacterStage/);
  assert.ok(
    officeStageSource.indexOf("<FocusedHandoffView") <
      officeStageSource.indexOf("<AgentCharacterStage"),
    "FocusedHandoffView must render before the secondary character stage",
  );
  assert.match(characterStageSource, /data-agent-character-stage="true"/);
  assert.match(characterStageSource, /data-agent-character-card/);
  assert.match(characterStageSource, /data-motion-profile/);
  assert.match(officeAvatarSource, /data-agent-avatar-source="sprite-gen"/);
  assert.match(stageCssSource, /\.agent-character-card\[data-motion-profile="command-pulse"\]/);
  assert.match(stageCssSource, /\.agent-character-card\[data-motion-profile="build-shift"\]/);
  assert.match(stageCssSource, /\.agent-character-card\[data-motion-profile="verify-brace"\]/);
  assert.match(officeStageSource, /viewMode="overview"/);
  assert.doesNotMatch(officeStageSource, /viewMode=\{stageMode\}/);
  assert.match(officeStageSource, /role="tablist"/);
  assert.match(officeStageSource, /role="tab"/);
  assert.match(officeStageSource, /aria-selected=\{isSelected\}/);
  assert.match(officeStageSource, /aria-controls=\{getStagePanelId\(entry\.mode\)\}/);
  assert.match(officeStageSource, /role="tabpanel"/);
  assert.match(officeStageSource, /aria-labelledby=\{getStageTabId\(entry\.mode\)\}/);
  assert.match(officeStageSource, /id=\{getStageTabId\(entry\.mode\)\}/);
  assert.match(officeStageSource, /id=\{getStagePanelId\(entry\.mode\)\}/);
  assert.match(officeStageSource, /hidden=\{!isSelected\}/);
  assert.match(officeStageSource, /tabRefs\.current\[stageMode\]\?\.focus\(\)/);
  assert.match(officeStageSource, /ArrowRight/);
  assert.match(officeStageSource, /ArrowLeft/);
  assert.doesNotMatch(officeStageSource, /aria-pressed/);
});

test("office preview shell gives Floor Overview a map plus inspector command center", () => {
  const pixelOfficeSource = readDashboardSource("components/PixelOffice.tsx");
  const officeSidebarSource = readDashboardSource("components/OfficeSidebar.tsx");
  const officeCssSource = readDashboardSource("office.module.css");
  const sidebarCssSource = readDashboardSource("office-sidebar.module.css");

  assert.match(pixelOfficeSource, /floor-command-center/);
  assert.match(pixelOfficeSource, /getOfficePreviewShellMode\(stageMode\)/);
  assert.match(pixelOfficeSource, /getOfficeSidebarMode\(stageMode\)/);
  assert.match(officeSidebarSource, /mode\?: "full" \| "focused" \| "overview"/);
  assert.match(officeSidebarSource, /overview inspector/);
  assert.match(officeCssSource, /\.office-frame\[data-office-preview-shell="floor-command-center"\]/);
  assert.match(officeCssSource, /\.office-layout\[data-stage-mode="overview"\]/);
  assert.match(officeCssSource, /grid-template-columns: minmax\(0, 1fr\) minmax\(260px, 292px\);/);
  assert.match(officeCssSource, /grid-template-columns: minmax\(0, 1fr\) minmax\(236px, 260px\);/);
  assert.match(sidebarCssSource, /\.office-rail\[data-office-sidebar-mode="overview"\]/);
  assert.match(sidebarCssSource, /max-height: calc\(100vh - 170px\);/);
  assert.match(sidebarCssSource, /overflow: auto;/);
  assert.match(sidebarCssSource, /:global\(\.muted\)/);
  assert.match(sidebarCssSource, /max-width: 18ch;/);
  assert.match(sidebarCssSource, /\.office-rail\[data-office-sidebar-mode="overview"\] \.queue \{\s+order: 2;/);
  assert.match(sidebarCssSource, /\.office-rail\[data-office-sidebar-mode="overview"\] \.agents \{\s+order: 3;/);
});

test("forward shell nav keeps shortened one-row labels before mobile", () => {
  const appSource = readDashboardSource("App.tsx");
  const shellCssSource = readDashboardSource("styles/shell.css");

  assert.match(appSource, />Approve<\/a>/);
  assert.match(appSource, />Workspace<\/a>/);
  assert.match(appSource, />Spatial<\/a>/);
  assert.match(shellCssSource, /\.forward-chip-row-nav \{\s+flex-wrap: nowrap;/);
  assert.match(shellCssSource, /@media \(max-width: 900px\)[\s\S]*\.forward-chip-row-nav \{\s+flex-wrap: wrap;/);
});

function readDashboardSource(relativePath) {
  return readFileSync(path.join(DASHBOARD_SRC, relativePath), "utf8");
}
