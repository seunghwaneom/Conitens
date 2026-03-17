/**
 * @module dedupe
 * RFC-1.0.1 §14 — Idempotency key generation and deduplication interface.
 */

export type ChannelType = "slack" | "telegram" | "discord" | "webui" | "cli";

export const DEFAULT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate an idempotency key for a channel message.
 */
export function makeIdempotencyKey(channel: ChannelType, parts: string[]): string {
  return `${channel}:${parts.join(":")}`;
}

/**
 * Interface for the deduplication store.
 * Implementation: runtime/state.sqlite dedupe table.
 */
export interface DedupeStore {
  exists(key: string): Promise<boolean>;
  set(key: string, eventId: string, ttlMs: number): Promise<void>;
  cleanup(): Promise<number>;  // returns removed count
}
