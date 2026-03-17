/**
 * @module channels
 * RFC-1.0.1 — Base channel adapter interface.
 *
 * Channel adapters bridge external messaging platforms (Slack, Telegram, Discord)
 * to the Conitens command plane. Inbound messages become commands;
 * outbound messages pass through approval gates (I-5).
 */

export interface InboundMessage {
  channelType: string;
  channelId: string;
  messageId: string;
  senderId: string;
  content: string;
  timestamp: string;
  raw?: unknown;
}

export interface OutboundMessage {
  channelId: string;
  content: string;
  replyTo?: string;
  containsCode?: boolean;
  containsSecrets?: boolean;
}

export type MessageHandler = (message: InboundMessage) => Promise<void>;

export interface BaseChannelAdapter {
  readonly channelType: string;

  /** Start listening for messages */
  start(): Promise<void>;

  /** Stop the adapter gracefully */
  stop(): Promise<void>;

  /** Register a handler for inbound messages */
  onMessage(handler: MessageHandler): void;

  /** Send a message (subject to approval gate I-5) */
  sendMessage(message: OutboundMessage): Promise<void>;

  /** Generate idempotency key per RFC-1.0.1 §14 */
  makeIdempotencyKey(message: InboundMessage): string;
}
