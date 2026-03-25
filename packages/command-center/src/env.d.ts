/**
 * env.d.ts — TypeScript declarations for Vite environment variables.
 *
 * Sub-AC 13a: Web deployment pipeline
 *
 * Augments the Vite-provided ImportMetaEnv with project-specific VITE_*
 * variables.  All values are `string | undefined` at the type level because
 * Vite only guarantees their presence when the corresponding .env file is
 * present.  Application code should always provide a fallback.
 *
 * @see .env, .env.development, .env.production
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * WebSocket URL for the @conitens/core orchestrator event bus.
   * Default: "ws://localhost:8080"
   */
  readonly VITE_WS_URL?: string;

  /**
   * Browser tab / window title.
   * Default: "Conitens Command Center"
   */
  readonly VITE_APP_TITLE?: string;

  /**
   * Base URL for HTML/asset links — used by Vite's `base` config option.
   * Default: "/"
   */
  readonly VITE_BASE_URL?: string;

  /**
   * HTTP base URL for the @conitens/core orchestrator control-plane REST API.
   * Used by useControlPlaneMetrics to poll per-agent and per-room live metrics:
   *   GET <VITE_API_BASE_URL>/api/agents/{id}/metrics
   *   GET <VITE_API_BASE_URL>/api/rooms/{id}/metrics
   * Falls back to metrics-store simulated data when unavailable.
   * Default: "http://localhost:8080"
   */
  readonly VITE_API_BASE_URL?: string;

  /**
   * HTTP base URL for the @conitens/core orchestrator control-plane API.
   * Used by AgentCommandDispatch to forward dispatched commands.
   * Alias for VITE_API_BASE_URL; prefer VITE_API_BASE_URL for new code.
   * Default: "http://localhost:8080"
   */
  readonly VITE_ORCHESTRATOR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
