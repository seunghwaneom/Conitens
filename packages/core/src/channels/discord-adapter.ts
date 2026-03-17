/**
 * @module channels/discord
 * Discord adapter using discord.js pattern.
 * Requires: discord.js (not installed — add when configuring)
 */

import type { BaseChannelAdapter, InboundMessage, OutboundMessage, MessageHandler } from "./base-adapter.js";

export interface DiscordConfig {
  botToken: string;
  guildId?: string;
}

export class DiscordAdapter implements BaseChannelAdapter {
  readonly channelType = "discord";
  private handlers: MessageHandler[] = [];
  private config: DiscordConfig;
  private running = false;

  constructor(config: DiscordConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    // In production: const client = new Client({ intents: [...] });
    // client.on("messageCreate", (msg) => { ... });
    // await client.login(this.config.botToken);
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
    // In production: const channel = await client.channels.fetch(message.channelId);
    // await channel.send(message.content);
  }

  makeIdempotencyKey(message: InboundMessage): string {
    // discord:{guild}:{channel}:{id}
    const guild = this.config.guildId ?? "default";
    return `discord:${guild}:${message.channelId}:${message.messageId}`;
  }

  async simulateMessage(message: InboundMessage): Promise<void> {
    for (const handler of this.handlers) {
      await handler(message);
    }
  }
}
