import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TARGET_URL = process.env.AGENT_CHARACTER_STAGE_URL ?? "http://127.0.0.1:3004/#/office-preview";
const OUT_DIR = "output/playwright/agent-character-stage";
const REPORT_PATH = "output/playwright/agent-character-stage-results.json";
const DEBUG_PORT = Number.parseInt(process.env.AGENT_CHARACTER_STAGE_DEBUG_PORT ?? "9232", 10);

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
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
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
  if (!executable) throw new Error("Chrome or Edge executable was not found");
  return executable;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function waitForDevTools() {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      return await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`Timed out waiting for browser debug port ${DEBUG_PORT}`);
}

async function connectToBrowser(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const cdp = new CdpClient(socket);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  return { cdp, sessionId };
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function waitForExpression(cdp, sessionId, expression, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(cdp, sessionId, expression);
    if (value === true) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function setViewport(cdp, sessionId, width, height, reduceMotion = false) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await cdp.send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: reduceMotion ? "reduce" : "no-preference" }] },
    sessionId,
  );
}

async function navigate(cdp, sessionId) {
  await cdp.send("Page.navigate", { url: TARGET_URL }, sessionId);
  await waitForExpression(
    cdp,
    sessionId,
    "document.readyState === 'complete' && Boolean(document.querySelector('[data-office-preview-shell]'))",
  );
}

async function selectTab(cdp, sessionId, label) {
  const clicked = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((node) => node.textContent.trim() === ${JSON.stringify(label)});
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

async function pressTab(cdp, sessionId) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
}

function collectExpression() {
  return `(() => {
    const count = (selector) => document.querySelectorAll(selector).length;
    const selectedTab = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '';
    const stage = document.querySelector('[data-office-stage-mode]');
    const cards = Array.from(document.querySelectorAll('[data-agent-character-card="true"]'));
    const portraits = Array.from(document.querySelectorAll('[data-agent-character-portrait="true"]'));
    const nextAction = document.querySelector('[data-agent-character-stage="true"] [data-next-action-kind]');
    const portraitSources = portraits.map((node) => node.getAttribute('data-agent-portrait-src') ?? '');
    const portraitSizes = portraits.map((node) => ({
      role: node.getAttribute('data-agent-portrait-role') ?? '',
      width: node.naturalWidth,
      height: node.naturalHeight,
      complete: node.complete,
      source: node.getAttribute('data-agent-avatar-source') ?? ''
    }));
    const portraitClientRects = portraits.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        role: node.getAttribute('data-agent-portrait-role') ?? '',
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
    const avatarAnimations = portraits.map((node) => {
      const style = getComputedStyle(node);
      return {
        role: node.getAttribute('data-agent-portrait-role') ?? '',
        motionProfile: node.getAttribute('data-motion-profile') ?? '',
        animationName: style.animationName,
        animationDuration: style.animationDuration
      };
    });
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height)
      };
    };
    return {
      selectedTab,
      tabLabels: Array.from(document.querySelectorAll('[role="tab"]')).map((node) => node.textContent.trim()),
      tabpanelCount: count('[role="tabpanel"]'),
      activeTabpanelCount: count('[role="tabpanel"]:not([hidden])'),
      stageMode: stage?.getAttribute('data-office-stage-mode') ?? '',
      characterStageCount: count('[data-agent-character-stage="true"]'),
      characterCardCount: cards.length,
      cardRoles: cards.map((node) => node.getAttribute('data-agent-role') ?? ''),
      cardMotionProfiles: cards.map((node) => node.getAttribute('data-motion-profile') ?? ''),
      cardWorkStates: cards.map((node) => node.getAttribute('data-work-state') ?? ''),
      cardPressedStates: cards.map((node) => node.getAttribute('aria-pressed') ?? ''),
      cardTransitions: cards.map((node) => getComputedStyle(node).transitionDuration),
      nextActionKind: nextAction?.getAttribute('data-next-action-kind') ?? '',
      nextActionHref: nextAction?.getAttribute('href') ?? '',
      nextActionText: nextAction?.textContent?.trim() ?? '',
      portraitCount: portraits.length,
      portraitSources,
      portraitSizes,
      portraitClientRects,
      avatarAnimations,
      signalTerms: Array.from(document.querySelectorAll('[data-agent-character-stage="true"] dt')).map((node) => node.textContent.trim()),
      floorCount: count('[data-spatial-lens-floor="static"]'),
      workbenchCount: count('[data-active-handoff-workbench="true"]'),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      navRows: new Set(Array.from(document.querySelectorAll('.forward-chip-row-nav .forward-chip-link')).map((node) => Math.round(node.getBoundingClientRect().top))).size,
      stageRect: rect('[data-agent-character-stage="true"]'),
      firstCardRect: rect('[data-agent-character-card="true"]'),
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  })()`;
}

function assertScenario(scenario, data) {
  const errors = [];
  if (data.overflowX) errors.push("horizontal overflow detected");
  if (data.tabpanelCount !== 3) errors.push("expected three controlled tabpanels");
  if (data.activeTabpanelCount !== 1) errors.push("expected one active tabpanel");
  if (!["Agents", "Topology", "Classic"].every((label) => data.tabLabels.includes(label))) {
    errors.push("stage tabs should be Agents, Topology, and Classic");
  }
  if (scenario.name.startsWith("agents")) {
    const uniqueRoles = new Set(data.cardRoles);
    const uniqueMotionProfiles = new Set(data.cardMotionProfiles);
    if (data.selectedTab !== "Agents") errors.push("Agents tab should be selected");
    if (data.stageMode !== "focused") errors.push("Agents tab should map to focused stage mode");
    if (data.characterStageCount !== 1) errors.push("Agents mode should render one character stage");
    if (data.floorCount !== 0) errors.push("Agents mode should not mount the floor viewport");
    if (data.nextActionKind !== "owner-approval") errors.push("Agents mode should keep owner-approval next action kind");
    if (data.nextActionHref !== "#/approvals") errors.push("Agents mode should link the next action to approvals");
    if (data.nextActionText !== "Open approvals") errors.push("Agents mode should render the actionable approvals CTA");
    if (!data.cardPressedStates.includes("true")) errors.push("selected character card should expose aria-pressed=true");
    if (data.characterCardCount < 4) errors.push("expected at least four agent character cards");
    if (data.portraitCount < 4) errors.push("expected generated portrait avatars on character cards");
    if (!data.portraitSources.every((source) => source.startsWith("/agent-portraits/generated/"))) {
      errors.push("portrait avatars should load generated agent portrait paths");
    }
    if (!data.portraitSizes.every((portrait) => portrait.source === "imagegen-large-pixel-avatar")) {
      errors.push("portrait avatars should expose the imagegen-large-pixel-avatar source");
    }
    if (!data.portraitSizes.every((portrait) => portrait.complete && portrait.width >= 256 && portrait.height >= 512)) {
      errors.push("portrait avatars should load as large 256x512-or-larger images");
    }
    if (!data.portraitClientRects.every((portrait) => portrait.height >= 280 && portrait.width >= 120)) {
      errors.push("portrait avatars should render as full-body figures, not clipped head-only thumbnails");
    }
    if (uniqueRoles.size < 4) errors.push("expected diverse agent roles");
    if (uniqueMotionProfiles.size < 4) errors.push("expected diverse motion profiles");
    if (!data.signalTerms.includes("handoff") || !data.signalTerms.includes("blocked") || !data.signalTerms.includes("next")) {
      errors.push("character stage should expose handoff, blocked, and next signals");
    }
    if (scenario.width === 1220 && data.navRows !== 1) errors.push("1220px shell nav should stay on one row");
    if (scenario.width <= 820 && data.firstCardRect?.width < 300) errors.push("narrow Agents cards should keep readable one-column width");
    if (!Array.isArray(data.focusSequence) || data.focusSequence.length < 5) {
      errors.push("Agents mode should expose a CTA and card keyboard focus sequence");
    } else if (data.focusSequence[0]?.kind !== "A" || data.focusSequence.slice(1).some((entry) => entry.kind !== "BUTTON")) {
      errors.push("Agents focus sequence should move from CTA link into card buttons");
    } else if (!data.focusSequence.every((entry) => entry.outlineWidth !== "0px" && entry.outlineStyle !== "none")) {
      errors.push("Agents CTA and cards should expose visible focus outlines");
    }
    if (!scenario.reduceMotion) {
      const animatedProfiles = new Set(data.avatarAnimations.map((entry) => entry.animationName));
      if (animatedProfiles.size < 4) errors.push("role profiles should resolve to distinct animation names");
      if (!data.avatarAnimations.every((entry) => entry.animationDuration !== "0s")) {
        errors.push("normal motion mode should keep avatar animations active");
      }
    } else if (!data.avatarAnimations.every((entry) => entry.animationName === "none")) {
      errors.push("reduced-motion mode should freeze avatar animations");
    } else if (!data.cardTransitions.every((duration) => duration === "0s")) {
      errors.push("reduced-motion mode should disable character card transitions");
    }
  }
  if (scenario.name.startsWith("topology")) {
    if (data.selectedTab !== "Topology") errors.push("Topology tab should be selected");
    if (data.stageMode !== "overview") errors.push("Topology tab should map to overview stage mode");
    if (data.characterStageCount !== 0) errors.push("Topology should not render the character deck");
    if (data.floorCount !== 1) errors.push("Topology should render one floor viewport");
  }
  return errors;
}

async function collectFocusSequence(cdp, sessionId) {
  await evaluate(
    cdp,
    sessionId,
    `(() => {
      document.querySelector('[data-agent-character-stage="true"]')?.scrollIntoView({ block: 'start' });
      const stage = document.querySelector('[data-agent-character-stage="true"]');
      const focusables = stage ? Array.from(stage.querySelectorAll('a[href], button:not([disabled])')) : [];
      focusables[0]?.focus();
      return true;
    })()`,
  );
  const sequence = [];
  for (let index = 0; index < 5; index += 1) {
    sequence.push(await evaluate(
      cdp,
      sessionId,
      `(() => {
        const node = document.activeElement;
        const style = node ? getComputedStyle(node) : null;
        return {
          kind: node?.tagName ?? '',
          text: node?.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 80) ?? '',
          outlineStyle: style?.outlineStyle ?? '',
          outlineWidth: style?.outlineWidth ?? '',
          role: node?.getAttribute('data-agent-role') ?? '',
          nextActionKind: node?.getAttribute('data-next-action-kind') ?? ''
        };
      })()`,
    ));
    await pressTab(cdp, sessionId);
  }
  return sequence;
}

async function captureScreenshot(cdp, sessionId, name) {
  const result = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false },
    sessionId,
  );
  const file = path.join(OUT_DIR, `${name}.png`);
  await writeFile(file, Buffer.from(result.data, "base64"));
  return file;
}

async function runScenario(cdp, sessionId, scenario) {
  await setViewport(cdp, sessionId, scenario.width, scenario.height, scenario.reduceMotion);
  await navigate(cdp, sessionId);
  await selectTab(cdp, sessionId, scenario.tab);
  await sleep(450);
  const data = await evaluate(cdp, sessionId, collectExpression());
  const screenshot = await captureScreenshot(cdp, sessionId, scenario.name);
  if (scenario.name.startsWith("agents")) {
    data.focusSequence = await collectFocusSequence(cdp, sessionId);
  }
  const errors = assertScenario(scenario, data);
  return { ...scenario, status: errors.length === 0 ? "PASS" : "FAIL", errors, data, screenshot };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const userDataDir = path.join("output/playwright", `.agent-character-stage-chrome-${process.pid}`);
  rmSync(userDataDir, { recursive: true, force: true });
  const browser = spawn(findBrowserExecutable(), [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);

  let cdp = null;
  try {
    const version = await waitForDevTools();
    const connected = await connectToBrowser(version.webSocketDebuggerUrl);
    cdp = connected.cdp;
    const scenarios = [
      { name: "agents-1220", tab: "Agents", width: 1220, height: 900, reduceMotion: false },
      { name: "agents-820", tab: "Agents", width: 820, height: 900, reduceMotion: false },
      { name: "agents-1440", tab: "Agents", width: 1440, height: 900, reduceMotion: false },
      { name: "agents-reduced-motion", tab: "Agents", width: 1220, height: 900, reduceMotion: true },
      { name: "topology-1220", tab: "Topology", width: 1220, height: 900, reduceMotion: false },
    ];
    const results = [];
    for (const scenario of scenarios) {
      results.push(await runScenario(cdp, connected.sessionId, scenario));
    }
    const failed = results.filter((result) => result.status === "FAIL");
    const report = {
      status: failed.length === 0 ? "PASS" : "FAIL",
      targetUrl: TARGET_URL,
      generatedAt: new Date().toISOString(),
      results,
    };
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${report.status} ${REPORT_PATH}`);
    for (const result of failed) {
      console.error(`${result.name}: ${result.errors.join("; ")}`);
    }
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    browser.kill();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
