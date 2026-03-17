/**
 * @module plugins
 * Plugin architecture for extending Conitens with custom functionality.
 *
 * Plugins register hooks that run before/after events and commands.
 */

import type { ConitensEvent } from "@conitens/protocol";

export interface PluginHooks {
  /** Called before an event is appended to the log */
  onBeforeEvent?: (event: ConitensEvent) => Promise<ConitensEvent | null>;
  /** Called after an event is appended and reducers have run */
  onAfterEvent?: (event: ConitensEvent) => Promise<void>;
  /** Called when a command file is detected */
  onCommand?: (commandPath: string) => Promise<void>;
  /** Called on system startup */
  onStart?: () => Promise<void>;
  /** Called on system shutdown */
  onStop?: () => Promise<void>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  hooks: PluginHooks;
}

export class PluginManager {
  private plugins = new Map<string, PluginManifest>();

  /**
   * Register a plugin.
   */
  register(manifest: PluginManifest): void {
    if (this.plugins.has(manifest.name)) {
      throw new Error(`Plugin "${manifest.name}" is already registered`);
    }
    this.plugins.set(manifest.name, manifest);
  }

  /**
   * Unregister a plugin.
   */
  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  /**
   * List all registered plugins.
   */
  listPlugins(): Array<{ name: string; version: string; description: string }> {
    return [...this.plugins.values()].map(({ name, version, description }) => ({
      name,
      version,
      description,
    }));
  }

  /**
   * Run onBeforeEvent hooks. Returns null if any plugin vetoes the event.
   */
  async runBeforeEvent(event: ConitensEvent): Promise<ConitensEvent | null> {
    let current: ConitensEvent | null = event;

    for (const [, plugin] of this.plugins) {
      if (plugin.hooks.onBeforeEvent && current) {
        current = await plugin.hooks.onBeforeEvent(current);
      }
    }

    return current;
  }

  /**
   * Run onAfterEvent hooks for all plugins.
   */
  async runAfterEvent(event: ConitensEvent): Promise<void> {
    for (const [, plugin] of this.plugins) {
      if (plugin.hooks.onAfterEvent) {
        await plugin.hooks.onAfterEvent(event);
      }
    }
  }

  /**
   * Run onCommand hooks for all plugins.
   */
  async runOnCommand(commandPath: string): Promise<void> {
    for (const [, plugin] of this.plugins) {
      if (plugin.hooks.onCommand) {
        await plugin.hooks.onCommand(commandPath);
      }
    }
  }

  /**
   * Run onStart hooks for all plugins.
   */
  async runOnStart(): Promise<void> {
    for (const [, plugin] of this.plugins) {
      if (plugin.hooks.onStart) {
        await plugin.hooks.onStart();
      }
    }
  }

  /**
   * Run onStop hooks for all plugins.
   */
  async runOnStop(): Promise<void> {
    for (const [, plugin] of this.plugins) {
      if (plugin.hooks.onStop) {
        await plugin.hooks.onStop();
      }
    }
  }
}
