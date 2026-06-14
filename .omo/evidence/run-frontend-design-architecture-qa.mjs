import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_URL = "http://127.0.0.1:3004/#/office-preview";
const DEFAULT_OUT_DIR = "output/playwright";

const args = new Map(
  process.argv.slice(2).flatMap((entry, index, all) => {
    if (!entry.startsWith("--")) return [];
    const next = all[index + 1];
    if (!next || next.startsWith("--")) return [[entry.slice(2), "true"]];
    return [[entry.slice(2), next]];
  }),
);

const targetUrl = args.get("url") ?? DEFAULT_URL;
const outDir = args.get("out-dir") ?? DEFAULT_OUT_DIR;
const debugPort = Number(args.get("debug-port") ?? "9224");
const artifactName = args.get("artifact-name") ?? "frontend-design-architecture-improvement";
const screenshotDirName = args.get("screenshot-dir-name") ?? artifactName;
const screenshots = path.join(outDir, screenshotDirName);
const useExistingBrowser = args.get("use-existing-browser") === "true";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
        return;
      }
      pending.resolve(message.result ?? {});
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = sessionId
      ? { id, method, params, sessionId }
      : { id, method, params };
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify(payload));
    return promise;
  }

  close() {
    this.socket.close();
  }
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    path.join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.PROGRAMFILES ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error("Chrome or Edge executable was not found");
  }
  return executable;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function waitForDevTools(port) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      if (error instanceof TypeError || error instanceof Error) {
        await sleep(250);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Timed out waiting for browser debug port ${port}`);
}

async function connectToBrowser(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const cdp = new CdpClient(socket);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  return { cdp, sessionId };
}

async function waitForExpression(cdp, sessionId, expression, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await cdp.send(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      sessionId,
    );
    if (result.result?.value === true) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    {
      expression,
      returnByValue: true,
      awaitPromise: true,
    },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function setViewport(cdp, sessionId, width, height) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    },
    sessionId,
  );
}

async function navigate(cdp, sessionId, url) {
  await cdp.send("Page.navigate", { url }, sessionId);
  await waitForExpression(
    cdp,
    sessionId,
    "document.readyState === 'complete' && Boolean(document.querySelector('[data-office-preview-shell]'))",
  );
}

async function selectStageMode(cdp, sessionId, label) {
  const clicked = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const tab = tabs.find((node) => node.textContent.trim() === ${JSON.stringify(label)});
      if (!tab) return false;
      tab.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error(`Stage tab not found: ${label}`);
  await waitForExpression(
    cdp,
    sessionId,
    `Boolean(Array.from(document.querySelectorAll('[role="tab"]')).find((node) => node.textContent.trim() === ${JSON.stringify(label)} && node.getAttribute('aria-selected') === 'true'))`,
  );
}

async function exerciseKeyboardTabs(cdp, sessionId) {
  await selectStageMode(cdp, sessionId, "Focused");
  return evaluate(
    cdp,
    sessionId,
    `(async () => {
      const selectedLabel = () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '';
      const focusedLabel = () => document.activeElement?.getAttribute('role') === 'tab'
        ? document.activeElement.textContent.trim()
        : '';
      const press = async (key) => {
        const tab = document.querySelector('[role="tab"][aria-selected="true"]');
        tab.focus();
        tab.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 80));
      };
      await press('ArrowRight');
      const rightSelected = selectedLabel();
      const rightFocused = focusedLabel();
      await press('ArrowLeft');
      const leftSelected = selectedLabel();
      const leftFocused = focusedLabel();
      return { rightSelected, rightFocused, leftSelected, leftFocused };
    })()`,
  );
}

function collectScenarioExpression() {
  return `(() => {
    const count = (selector) => document.querySelectorAll(selector).length;
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height)
      };
    };
    const displayStates = (selector) =>
      Array.from(document.querySelectorAll(selector)).map((node) => getComputedStyle(node).display);
    const roomPlacements = Array.from(document.querySelectorAll('[data-room-id]')).map((node) => {
      const style = node instanceof HTMLElement ? node.style : null;
      const box = node.getBoundingClientRect();
      return {
        id: node.getAttribute('data-room-id') ?? '',
        left: style?.left ?? '',
        top: style?.top ?? '',
        width: style?.width ?? '',
        height: style?.height ?? '',
        rect: {
          left: Math.round(box.left),
          right: Math.round(box.right),
          top: Math.round(box.top),
          bottom: Math.round(box.bottom),
          width: Math.round(box.width),
          height: Math.round(box.height)
        }
      };
    });
    const navTops = Array.from(document.querySelectorAll('.forward-chip-row-nav .forward-chip-link'))
      .map((node) => Math.round(node.getBoundingClientRect().top));
    const cta = document.querySelector('[data-next-action-kind]');
    const selectedTab = document.querySelector('[role="tab"][aria-selected="true"]');
    return {
      selectedTab: selectedTab?.textContent?.trim() ?? '',
      tablistCount: count('[role="tablist"]'),
      tabCount: count('[role="tab"]'),
      tabpanelCount: count('[role="tabpanel"]'),
      activeTabpanelCount: count('[role="tabpanel"]:not([hidden])'),
      tabsControlExistingPanels: Array.from(document.querySelectorAll('[role="tab"]')).every((tab) => {
        const panelId = tab.getAttribute('aria-controls');
        const panel = panelId ? document.getElementById(panelId) : null;
        return Boolean(panel && panel.getAttribute('role') === 'tabpanel');
      }),
      workbenchCount: count('[data-active-handoff-workbench="true"]'),
      focusedViewCount: count('[data-focused-handoff-view="true"]'),
      floorCount: count('[data-spatial-lens-floor="static"]'),
      minimapCount: count('[data-minimap-dock], [data-agent-offscreen-rail]'),
      focusedTargetEdgeCount: count('[data-focused-route-target-edge], [data-focused-corridor-continuity]'),
      stepCount: count('[data-workbench-step]'),
      blockedStepCount: count('[data-workbench-step="blocked"]'),
      contextThumbCount: count('[data-context-thumbnail]'),
      nextActionKind: cta?.getAttribute('data-next-action-kind') ?? '',
      nextActionText: cta?.textContent?.trim() ?? '',
      nextActionHref: cta?.getAttribute('href') ?? '',
      activeElementTab: document.activeElement?.getAttribute('role') === 'tab'
        ? document.activeElement.textContent.trim()
        : '',
      shellMode: document.querySelector('[data-office-preview-shell]')?.getAttribute('data-office-preview-shell') ?? '',
      stageMode: document.querySelector('[data-office-stage-mode]')?.getAttribute('data-office-stage-mode') ?? '',
      sidebarMode: document.querySelector('[data-office-sidebar-mode]')?.getAttribute('data-office-sidebar-mode') ?? '',
      sidebarFocusPill: document.querySelector('[class*="office-focus-pill"]')?.textContent?.trim() ?? '',
      viewportMode: document.querySelector('[data-spatial-lens-floor="static"]')?.getAttribute('data-viewport-mode') ?? '',
      overviewRole: document.querySelector('[data-spatial-lens-floor="static"]')?.getAttribute('data-overview-role') ?? '',
      mapTaskTreatment: document.querySelector('[data-spatial-lens-floor="static"]')?.getAttribute('data-map-task-treatment') ?? '',
      hiddenRoomDressingDisplays: displayStates('[class*="room-dressing-layer"], [class*="workstation-layer"], [class*="wall-detail-layer"]'),
      navRows: new Set(navTops).size,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      summaryRect: rect('[class*="office-summary-band"]'),
      stageHeaderRect: rect('[class*="office-stage-header"]'),
      stagePanelRect: rect('[class*="office-stage-panel"]'),
      floorRect: rect('[data-spatial-lens-floor="static"]'),
      sidebarRect: rect('[data-office-sidebar-mode]'),
      workbenchRect: rect('[data-focused-view-layer="workbench"]'),
      contextRect: rect('[data-focused-view-layer="spatial-context"]'),
      roomPlacements,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  })()`;
}

function assertScenario(name, data) {
  const errors = [];
  if (data.tablistCount !== 1) errors.push("expected one stage tablist");
  if (data.tabCount !== 3) errors.push("expected three stage tabs");
  if (data.tabpanelCount !== 3) errors.push("expected three controlled stage tabpanels");
  if (data.activeTabpanelCount !== 1) errors.push("expected exactly one active stage tabpanel");
  if (!data.tabsControlExistingPanels) errors.push("each tab aria-controls should resolve to a tabpanel");
  if (data.overflowX) errors.push("horizontal overflow detected");

  if (name.startsWith("focused")) {
    if (data.workbenchCount !== 1) errors.push("Focused should render one workbench");
    if (data.focusedViewCount !== 1) errors.push("Focused should render one FocusedHandoffView");
    if (data.floorCount !== 0) errors.push("Focused should not mount the floor viewport");
    if (data.minimapCount !== 0) errors.push("Focused should not mount minimap/offscreen rail");
    if (data.focusedTargetEdgeCount !== 0) errors.push("Focused should not mount legacy target edges");
    if (data.stepCount !== 4) errors.push("Focused should expose four workbench steps");
    if (data.blockedStepCount < 1) errors.push("Focused should expose an explicit blocked step");
    if (data.contextThumbCount < 2) errors.push("Focused should keep muted spatial context");
    if (data.nextActionKind !== "owner-approval") errors.push("Focused CTA kind should be model-owned owner-approval");
    if (!data.nextActionHref.includes("#/approvals")) errors.push("Focused CTA should route to approvals");
    if (!data.nextActionText.includes("Open approvals")) errors.push("Focused CTA label should be model-owned");
    if (data.viewport.width === 1220 && data.navRows !== 1) errors.push("1220px shell nav should stay on one row");
    if (data.contextRect && data.contextRect.top > data.viewport.height) {
      errors.push("spatial context should be visible in first viewport");
    }
    if (name === "focused-1220") {
      if (data.keyboard?.rightSelected !== "Floor Overview") errors.push("ArrowRight should select Floor Overview");
      if (data.keyboard?.rightFocused !== "Floor Overview") errors.push("ArrowRight should focus Floor Overview");
      if (data.keyboard?.leftSelected !== "Focused") errors.push("ArrowLeft should select Focused");
      if (data.keyboard?.leftFocused !== "Focused") errors.push("ArrowLeft should focus Focused");
    }
  }

  if (name.startsWith("overview")) {
    if (data.workbenchCount !== 0) errors.push("Overview should not render Focused workbench");
    if (data.floorCount !== 1) errors.push("Overview should render one floor viewport");
    if (data.shellMode !== "floor-command-center") errors.push("Overview should use floor-command-center shell");
    if (data.stageMode !== "overview") errors.push("Overview should declare overview stage mode");
    if (data.sidebarMode !== "overview") errors.push("Overview should use overview sidebar mode");
    if (data.sidebarFocusPill !== "overview inspector") errors.push("Overview sidebar should declare inspector role");
    if (data.viewportMode !== "overview") errors.push("Overview floor should use overview camera mode");
    if (data.overviewRole !== "topology") errors.push("Overview floor should declare topology role");
    if (data.mapTaskTreatment !== "room-nodes") errors.push("Overview should keep room-node task treatment");
    if (!data.summaryRect || !data.stageHeaderRect || !data.floorRect || !data.sidebarRect) {
      errors.push("Overview should expose summary, stage header, floor, and sidebar rectangles");
    } else {
      if (data.summaryRect.bottom > data.stageHeaderRect.top + 4) {
        errors.push("Overview summary should sit above the stage header");
      }
      if (data.stageHeaderRect.bottom > data.floorRect.top + 4) {
        errors.push("Overview stage header should sit above the floor map");
      }
      if (data.floorRect.right > data.sidebarRect.left + 4) {
        errors.push("Overview floor map should not overlap the inspector rail");
      }
      if (data.floorRect.width <= data.sidebarRect.width) {
        errors.push("Overview floor map should remain wider than the inspector rail");
      }
      if (
        name === "overview-1220" &&
        (data.sidebarRect.top > data.floorRect.top || data.sidebarRect.bottom < data.floorRect.bottom - 8)
      ) {
        errors.push("Overview 1220 inspector should remain vertically adjacent to the floor map");
      }
    }
    const visibleDressing = data.hiddenRoomDressingDisplays.filter((value) => value !== "none");
    if (visibleDressing.length > 0) errors.push("Overview dense room dressing should remain hidden");
    const roomsById = new Map(data.roomPlacements.map((room) => [room.id, room]));
    const expectedPlacements = new Map([
      ["ops-control", ["3%", "3%", "30%", "20%"]],
      ["impl-office", ["3%", "27%", "30%", "31%"]],
      ["validation-office", ["61%", "3%", "30%", "22%"]],
      ["review-office", ["61%", "29%", "30%", "23%"]],
      ["research-lab", ["61%", "58%", "30%", "22%"]],
      ["project-main", ["34%", "60%", "24%", "32%"]],
    ]);
    for (const [roomId, expected] of expectedPlacements) {
      const room = roomsById.get(roomId);
      if (!room) {
        errors.push(`Overview should render ${roomId}`);
        continue;
      }
      const actual = [room.left, room.top, room.width, room.height];
      if (actual.join(",") !== expected.join(",")) {
        errors.push(`${roomId} placement should be ${expected.join(",")} but was ${actual.join(",")}`);
      }
    }
    const validation = roomsById.get("validation-office");
    const review = roomsById.get("review-office");
    const research = roomsById.get("research-lab");
    if (validation && review && research) {
      if (!(validation.rect.top < review.rect.top && review.rect.top < research.rect.top)) {
        errors.push("right-side operator offices should stack validation, review, then research");
      }
    }
  }

  if (name === "classic-1440") {
    if (data.workbenchCount !== 0) errors.push("Classic should not render Focused workbench");
    if (data.floorCount !== 0) errors.push("Classic should not render Spatial Lens floor");
  }

  return errors;
}

async function captureScreenshot(cdp, sessionId, name) {
  const result = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false },
    sessionId,
  );
  const file = path.join(screenshots, `${name}.png`);
  await writeFile(file, Buffer.from(result.data, "base64"));
  return file;
}

async function runScenario(cdp, sessionId, scenario) {
  await setViewport(cdp, sessionId, scenario.width, scenario.height);
  await navigate(cdp, sessionId, targetUrl);
  await selectStageMode(cdp, sessionId, scenario.tab);
  const keyboard = scenario.name === "focused-1220"
    ? await exerciseKeyboardTabs(cdp, sessionId)
    : null;
  await sleep(350);
  const collectedData = await evaluate(cdp, sessionId, collectScenarioExpression());
  const data = { ...collectedData, keyboard };
  const screenshot = await captureScreenshot(cdp, sessionId, scenario.name);
  const errors = assertScenario(scenario.name, data);
  return { ...scenario, status: errors.length === 0 ? "PASS" : "FAIL", errors, data, screenshot };
}

async function main() {
  await mkdir(screenshots, { recursive: true });
  const userDataDir = path.join(outDir, `.frontend-design-qa-chrome-${process.pid}`);
  let browser = null;
  if (!useExistingBrowser) {
    rmSync(userDataDir, { recursive: true, force: true });
    browser = spawn(findBrowserExecutable(), [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ]);
  }

  let cdp = null;
  try {
    const version = await waitForDevTools(debugPort);
    const connected = await connectToBrowser(version.webSocketDebuggerUrl);
    cdp = connected.cdp;
    const scenarios = [
      { name: "focused-1220", tab: "Focused", width: 1220, height: 900 },
      { name: "focused-1440", tab: "Focused", width: 1440, height: 900 },
      { name: "overview-1440", tab: "Floor Overview", width: 1440, height: 900 },
      { name: "overview-1220", tab: "Floor Overview", width: 1220, height: 900 },
      { name: "classic-1440", tab: "Classic", width: 1440, height: 900 },
      { name: "classic-1220", tab: "Classic", width: 1220, height: 900 },
    ];
    const results = [];
    for (const scenario of scenarios) {
      results.push(await runScenario(cdp, connected.sessionId, scenario));
    }
    const failed = results.filter((result) => result.status === "FAIL");
    const report = {
      status: failed.length === 0 ? "PASS" : "FAIL",
      targetUrl,
      generatedAt: new Date().toISOString(),
      results,
    };
    const reportPath = path.join(outDir, `${artifactName}-results.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${report.status} ${reportPath}`);
    if (failed.length > 0) {
      for (const result of failed) {
        console.error(`${result.name}: ${result.errors.join("; ")}`);
      }
      process.exitCode = 1;
    }
  } finally {
    if (cdp) cdp.close();
    if (browser) {
      browser.kill();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
