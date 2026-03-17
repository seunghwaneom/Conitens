import { describe, it, expect, beforeEach } from "vitest";
import { PluginManager } from "../src/plugins/plugin-manager.js";
import { SCHEMA_VERSION } from "@conitens/protocol";
import type { ConitensEvent } from "@conitens/protocol";

function makeEvent(): ConitensEvent {
  return {
    schema: SCHEMA_VERSION,
    event_id: "evt_plugin_test",
    type: "task.created",
    ts: new Date().toISOString(),
    run_id: "run_test",
    actor: { kind: "system", id: "test" },
    payload: { title: "Test" },
  };
}

describe("PluginManager", () => {
  let pm: PluginManager;

  beforeEach(() => {
    pm = new PluginManager();
  });

  it("registers and lists plugins", () => {
    pm.register({
      name: "test-plugin",
      version: "1.0.0",
      description: "A test plugin",
      hooks: {},
    });

    const plugins = pm.listPlugins();
    expect(plugins.length).toBe(1);
    expect(plugins[0].name).toBe("test-plugin");
  });

  it("prevents duplicate registration", () => {
    pm.register({ name: "dup", version: "1.0.0", description: "", hooks: {} });
    expect(() =>
      pm.register({ name: "dup", version: "1.0.0", description: "", hooks: {} }),
    ).toThrow("already registered");
  });

  it("unregisters plugins", () => {
    pm.register({ name: "removable", version: "1.0.0", description: "", hooks: {} });
    expect(pm.unregister("removable")).toBe(true);
    expect(pm.listPlugins().length).toBe(0);
  });

  it("runs onBeforeEvent hooks", async () => {
    const calls: string[] = [];
    pm.register({
      name: "logger",
      version: "1.0.0",
      description: "",
      hooks: {
        onBeforeEvent: async (event) => {
          calls.push(event.type);
          return event;
        },
      },
    });

    const event = makeEvent();
    const result = await pm.runBeforeEvent(event);
    expect(result).not.toBeNull();
    expect(calls).toEqual(["task.created"]);
  });

  it("allows plugins to veto events", async () => {
    pm.register({
      name: "blocker",
      version: "1.0.0",
      description: "",
      hooks: {
        onBeforeEvent: async () => null,
      },
    });

    const result = await pm.runBeforeEvent(makeEvent());
    expect(result).toBeNull();
  });

  it("runs onAfterEvent hooks", async () => {
    const received: string[] = [];
    pm.register({
      name: "after",
      version: "1.0.0",
      description: "",
      hooks: {
        onAfterEvent: async (event) => {
          received.push(event.event_id);
        },
      },
    });

    await pm.runAfterEvent(makeEvent());
    expect(received).toEqual(["evt_plugin_test"]);
  });

  it("runs lifecycle hooks", async () => {
    const lifecycle: string[] = [];
    pm.register({
      name: "lifecycle",
      version: "1.0.0",
      description: "",
      hooks: {
        onStart: async () => { lifecycle.push("start"); },
        onStop: async () => { lifecycle.push("stop"); },
      },
    });

    await pm.runOnStart();
    await pm.runOnStop();
    expect(lifecycle).toEqual(["start", "stop"]);
  });
});
