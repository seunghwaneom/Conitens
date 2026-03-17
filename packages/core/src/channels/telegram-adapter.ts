/**
 * @module channels/telegram
 * Telegram adapter using grammY pattern.
 * Requires: grammy (not installed — add when configuring)
 */

import type { BaseChannelAdapter, InboundMessage, OutboundMessage, MessageHandler } from "./base-adapter.js";

export interface TelegramConfig {
  botToken: string;
}

export class TelegramAdapter implements BaseChannelAdapter {
  readonly channelType = "telegram";
  private handlers: MessageHandler[] = [];
  private config: TelegramConfig;
  private running = false;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    // In production: const bot = new Bot(this.config.botToken);
    // bot.on("message", (ctx) => { ... });
    // bot.start();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    if (message.containsSecrets) {
      throw new Error("Cannot send message containing secrets (approval: deny)");
    }
    // In production: await bot.api.sendMessage(message.channelId, message.content);
  }

  makeIdempotencyKey(message: InboundMessage): string {
    // telegram:{chat_id}:{message_id}
    return `telegram:${message.channelId}:${message.messageId}`;
  }

  async simulateMessage(message: InboundMessage): Promise<void> {
    for (const handler of this.handlers) {
      await handler(message);
    }
  }
}
