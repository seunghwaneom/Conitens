import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createOperatorWorkspaceCommandService } from "../src/features/workspaces/operator-workspace-command-service.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_SRC = path.resolve(TEST_DIR, "../src");
const APP_PATH = path.join(DASHBOARD_SRC, "App.tsx");
const WORKSPACE_CONTROLLER_PATH = path.join(
  DASHBOARD_SRC,
  "features/workspaces/use-operator-workspace-controller.ts",
);
const WORKSPACE_RESOURCE_PATH = path.join(
  DASHBOARD_SRC,
  "features/workspaces/use-operator-workspace-resources.ts",
);
const WORKSPACE_COMMAND_PATH = path.join(
  DASHBOARD_SRC,
  "features/workspaces/operator-workspace-command-service.ts",
);

function readSource(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function makeDraft(overrides = {}) {
  return {
    label: "Workspace",
    path: "packages/dashboard",
    kind: "repo",
    status: "active",
    archiveNote: "",
    ownerAgentId: "architect",
    linkedRunId: "run-1",
    linkedIterationId: "iter-1",
    taskIds: "task-1",
    notes: "",
    ...overrides,
  };
}

const config = { baseUrl: "http://127.0.0.1:8785/api", token: "token" };
const workspaceRoute = {
  screen: "workspaces",
  runId: null,
  taskId: null,
  workspaceId: null,
  threadId: null,
  agentId: null,
};
const detailRoute = { ...workspaceRoute, screen: "workspace-detail", workspaceId: "workspace-1" };

function makeFeedback(events) {
  return {
    setMutationState: (state) => events.push(`mutation:${state}`),
    setMutationError: (message) => events.push(`mutation-error:${message}`),
    setTaskActionState: (state) => events.push(`task:${state}`),
    setTaskActionError: (message) => events.push(`task-error:${message}`),
    setTaskActionMessage: (message) => events.push(`task-message:${message}`),
  };
}

test("workspace command service drives bridge, feedback, and refresh in runtime order", async () => {
  const events = [];
  const gateway = {
    createWorkspace: async (_config, body) => {
      events.push(`create:${body.label}`);
      return { workspace: { workspace_id: "workspace-2" } };
    },
    updateWorkspace: async (_config, workspaceId, body) => {
      events.push(`update:${workspaceId}:${body.status}`);
      return { workspace: { workspace_id: workspaceId } };
    },
    detachTaskWorkspace: async (_config, taskId) => events.push(`detach:${taskId}`),
    archiveTask: async (_config, taskId, body) => events.push(`archive:${taskId}:${body.archive_note}`),
  };
  const service = createOperatorWorkspaceCommandService(gateway);
  const feedback = makeFeedback(events);
  const refresh = async (workspaceId) => events.push(`refresh:${workspaceId}`);

  await service.submit({ config, route: workspaceRoute, draft: makeDraft(), refresh, feedback });
  assert.deepEqual(events, [
    "mutation:loading",
    "mutation-error:null",
    "create:Workspace",
    "refresh:workspace-2",
    "mutation:ready",
  ]);

  events.length = 0;
  await service.quickStatus({
    config,
    route: detailRoute,
    draft: makeDraft({ archiveNote: "approved rationale" }),
    status: "archived",
    refresh,
    feedback,
  });
  assert.deepEqual(events, [
    "mutation:loading",
    "mutation-error:null",
    "update:workspace-1:archived",
    "refresh:workspace-1",
    "mutation:ready",
  ]);

  events.length = 0;
  await service.detachTask({ config, route: detailRoute, draft: makeDraft(), taskId: "task-1", refresh, feedback });
  assert.deepEqual(events, [
    "task:loading",
    "task-error:null",
    "task-message:null",
    "detach:task-1",
    "refresh:workspace-1",
    "task:ready",
    "task-message:Detached task-1 from workspace-1.",
  ]);

  events.length = 0;
  await service.archiveTask({
    config,
    route: detailRoute,
    draft: makeDraft({ archiveNote: "verified blocker resolution" }),
    taskId: "task-1",
    refresh,
    feedback,
  });
  assert.deepEqual(events, [
    "task:loading",
    "task-error:null",
    "task-message:null",
    "archive:task-1:verified blocker resolution",
    "refresh:workspace-1",
    "task:ready",
    "task-message:Archived linked task task-1.",
  ]);
});

test("workspace command service blocks archive mutation before the bridge", async () => {
  const events = [];
  const gateway = {
    createWorkspace: async () => events.push("unexpected-create"),
    updateWorkspace: async () => events.push("unexpected-update"),
    detachTaskWorkspace: async () => events.push("unexpected-detach"),
    archiveTask: async () => events.push("unexpected-archive"),
  };
  const service = createOperatorWorkspaceCommandService(gateway);

  await service.quickStatus({
    config,
    route: detailRoute,
    draft: makeDraft(),
    status: "archived",
    refresh: async () => events.push("unexpected-refresh"),
    feedback: makeFeedback(events),
  });

  assert.deepEqual(events, [
    "mutation:error",
    "mutation-error:Workspace archive rationale is required.",
  ]);
});

test("App composes one feature-owned workspace controller", () => {
  const appSource = readSource(APP_PATH);
  const controllerSource = readSource(WORKSPACE_CONTROLLER_PATH);
  const resourceSource = readSource(WORKSPACE_RESOURCE_PATH);
  const commandSource = readSource(WORKSPACE_COMMAND_PATH);

  assert.ok(controllerSource, "workspace controller hook should exist");
  assert.ok(resourceSource, "workspace resource hook should exist");
  assert.ok(commandSource, "workspace command service should exist");
  assert.match(appSource, /useOperatorWorkspaceController\(/);
  assert.doesNotMatch(
    appSource,
    /forward(?:Create|Update|Get)OperatorWorkspace|forwardGetOperatorWorkspaces|forwardDetachOperatorTaskWorkspace/,
  );
  assert.match(controllerSource, /export function useOperatorWorkspaceController/);
  assert.match(controllerSource, /useOperatorWorkspaceResources/);
  assert.match(controllerSource, /operatorWorkspaceCommandService/);
  assert.match(commandSource, /forwardCreateOperatorWorkspace/);
  assert.match(commandSource, /forwardUpdateOperatorWorkspace/);
  assert.match(commandSource, /forwardDetachOperatorTaskWorkspace/);
});

test("workspace list errors and selection remain operator-legible", () => {
  const appSource = readSource(APP_PATH);

  assert.match(
    appSource,
    /error=\{route\.screen === "workspaces" \? workspacesError : workspaceDetailError\}/,
    "the list route must render the workspace-list error instead of an empty detail error",
  );
  assert.match(
    appSource,
    /aria-pressed=\{isWorkspaceSelected\}/,
    "the workspace rail must announce its selected item",
  );
  assert.match(
    appSource,
    /forward-run-item\$\{isWorkspaceSelected \? " active" : ""\}/,
    "the visual and semantic selected states must share one predicate",
  );
});
