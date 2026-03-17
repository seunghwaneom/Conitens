/**
 * @module channels/slack
 * Slack adapter using Bolt.js Socket Mode pattern.
 * Requires: @slack/bolt (not installed — add when configuring)
 */

import type { BaseChannelAdapter, InboundMessage, OutboundMessage, MessageHandler } from "./base-adapter.js";

export interface SlackConfig {
  botToken: string;
  appToken: string;
  signingSecret: string;
}

export class SlackAdapter implements BaseChannelAdapter {
  readonly channelType = "slack";
  private handlers: MessageHandler[] = [];
  private config: SlackConfig;
  private running = false;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    // In production: initialize Bolt App with socket mode
    // const app = new App({ token: this.config.botToken, appToken: this.config.appToken, socketMode: true });
    // app.message(async ({ message }) => { ... });
    // await app.start();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    // I-5: Approval gate check would happen before this
    if (message.containsSecrets) {
      throw new Error("Cannot send message containing secrets (approval: deny)");
    }
    // In production: await app.client.chat.postMessage({ channel: message.channelId, text: message.content });
  }

  makeIdempotencyKey(message: InboundMessage): string {
    // slack:{team}:{channel}:{event_ts}
    return `slack:default:${message.channelId}:${message.messageId}`;
  }

  /** Simulate receiving a message (for testing) */
  async simulateMessage(message: InboundMessage): Promise<void> {
    for (const handler of this.handlers) {
      await handler(message);
    }
  }
}
