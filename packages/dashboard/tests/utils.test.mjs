import test from "node:test";
import assert from "node:assert/strict";
import { getEventFamily, getTaskTone, isValidTransition, VALID_TRANSITIONS } from "../src/utils.ts";

// ── getEventFamily ──────────────────────────────────────────────

test("getEventFamily extracts prefix before first dot", () => {
  assert.equal(getEventFamily("task.created"), "task");
  assert.equal(getEventFamily("agent.spawned"), "agent");
  assert.equal(getEventFamily("approval.pending"), "approval");
  assert.equal(getEventFamily("handoff.requested"), "handoff");
});

test("getEventFamily returns the full string when there is no dot", () => {
  assert.equal(getEventFamily("system"), "system");
  // ?? only catches null/undefined, not empty string — "" splits to [""]
  assert.equal(getEventFamily(""), "");
});

test("getEventFamily handles multi-segment types", () => {
  assert.equal(getEventFamily("memory.update_approved"), "memory");
  assert.equal(getEventFamily("command.rejected"), "command");
});

// ── getTaskTone ─────────────────────────────────────────────────

test("getTaskTone returns 'success' for active/running/done states", () => {
  assert.equal(getTaskTone("running"), "success");
  assert.equal(getTaskTone("active"), "success");
  assert.equal(getTaskTone("done"), "success");
});

test("getTaskTone returns 'info' for review", () => {
  assert.equal(getTaskTone("review"), "info");
});

test("getTaskTone returns 'danger' for error/blocked/failed", () => {
  assert.equal(getTaskTone("error"), "danger");
  assert.equal(getTaskTone("blocked"), "danger");
  assert.equal(getTaskTone("failed"), "danger");
});

test("getTaskTone returns 'warning' for assigned", () => {
  assert.equal(getTaskTone("assigned"), "warning");
});

test("getTaskTone returns 'neutral' for unknown states", () => {
  assert.equal(getTaskTone("draft"), "neutral");
  assert.equal(getTaskTone("cancelled"), "neutral");
  assert.equal(getTaskTone("planned"), "neutral");
  assert.equal(getTaskTone("unknown-state"), "neutral");
});

// ── VALID_TRANSITIONS ───────────────────────────────────────────

test("VALID_TRANSITIONS covers all 9 task states", () => {
  const states = ["draft", "planned", "assigned", "active", "blocked", "review", "done", "failed", "cancelled"];
  for (const state of states) {
    assert.ok(state in VALID_TRANSITIONS, `Missing state: ${state}`);
  }
});

test("done and cancelled are terminal states (no outgoing transitions)", () => {
  assert.deepEqual(VALID_TRANSITIONS["done"], []);
  assert.deepEqual(VALID_TRANSITIONS["cancelled"], []);
});

// ── isValidTransition ───────────────────────────────────────────

test("isValidTransition allows valid state changes", () => {
  assert.ok(isValidTransition("draft", "planned"));
  assert.ok(isValidTransition("planned", "assigned"));
  assert.ok(isValidTransition("assigned", "active"));
  assert.ok(isValidTransition("active", "review"));
  assert.ok(isValidTransition("review", "done"));
  assert.ok(isValidTransition("active", "blocked"));
  assert.ok(isValidTransition("blocked", "active"));
});

test("isValidTransition rejects invalid state changes", () => {
  assert.ok(!isValidTransition("draft", "active"));
  assert.ok(!isValidTransition("done", "active"));
  assert.ok(!isValidTransition("cancelled", "draft"));
  assert.ok(!isValidTransition("planned", "review"));
  assert.ok(!isValidTransition("assigned", "done"));
});

test("isValidTransition allows cancellation from most states", () => {
  assert.ok(isValidTransition("draft", "cancelled"));
  assert.ok(isValidTransition("planned", "cancelled"));
  assert.ok(isValidTransition("assigned", "cancelled"));
  assert.ok(isValidTransition("active", "cancelled"));
  assert.ok(isValidTransition("blocked", "cancelled"));
  assert.ok(isValidTransition("failed", "cancelled"));
});

test("isValidTransition returns false for unknown states", () => {
  assert.ok(!isValidTransition("nonexistent", "active"));
  assert.ok(!isValidTransition("active", "nonexistent"));
});

test("isValidTransition allows failed -> assigned (reassignment)", () => {
  assert.ok(isValidTransition("failed", "assigned"));
});
