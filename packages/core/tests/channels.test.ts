import { describe, it, expect, beforeEach } from "vitest";
import { SlackAdapter } from "../src/channels/slack-adapter.js";
import { TelegramAdapter } from "../src/channels/telegram-adapter.js";
import { DiscordAdapter } from "../src/channels/discord-adapter.js";
import type { InboundMessage } from "../src/channels/base-adapter.js";

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channelType: "test",
    channelId: "ch-001",
    messageId: "msg-001",
    senderId: "user-001",
    content: "Hello",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("SlackAdapter", () => {
  let adapter: SlackAdapter;

  beforeEach(() => {
    adapter = new SlackAdapter({
      botToken: "xoxb-test",
      appToken: "xapp-test",
      signingSecret: "secret",
    });
  });

  it("generates correct idempotency key format", () => {
    const key = adapter.makeIdempotencyKey(
      makeMessage({ channelId: "C123", messageId: "1234567890.123456" }),
    );
    expect(key).toBe("slack:default:C123:1234567890.123456");
  });

  it("rejects outbound messages with secrets", async () => {
    await adapter.start();
    await expect(
      adapter.sendMessage({ channelId: "C123", content: "test", containsSecrets: true }),
    ).rejects.toThrow("secrets");
  });

  it("calls message handlers on simulateMessage", async () => {
    const received: InboundMessage[] = [];
    adapter.onMessage(async (msg) => { received.push(msg); });

    await adapter.simulateMessage(makeMessage({ content: "test" }));
    expect(received.length).toBe(1);
    expect(received[0].content).toBe("test");
  });
});

describe("TelegramAdapter", () => {
  let adapter: TelegramAdapter;

  beforeEach(() => {
    adapter = new TelegramAdapter({ botToken: "bot-test" });
  });

  it("generates correct idempotency key format", () => {
    const key = adapter.makeIdempotencyKey(
      makeMessage({ channelId: "12345", messageId: "67890" }),
    );
    expect(key).toBe("telegram:12345:67890");
  });

  it("rejects outbound messages with secrets", async () => {
    await expect(
      adapter.sendMessage({ channelId: "12345", content: "test", containsSecrets: true }),
    ).rejects.toThrow("secrets");
  });
});

describe("DiscordAdapter", () => {
  let adapter: DiscordAdapter;

  beforeEach(() => {
    adapter = new DiscordAdapter({ botToken: "bot-test", guildId: "guild-001" });
  });

  it("generates correct idempotency key format", () => {
    const key = adapter.makeIdempotencyKey(
      makeMessage({ channelId: "ch-discord", messageId: "msg-discord" }),
    );
    expect(key).toBe("discord:guild-001:ch-discord:msg-discord");
  });

  it("uses default guild when not configured", () => {
    const noGuild = new DiscordAdapter({ botToken: "bot-test" });
    const key = noGuild.makeIdempotencyKey(
      makeMessage({ channelId: "ch-1", messageId: "m-1" }),
    );
    expect(key).toBe("discord:default:ch-1:m-1");
  });
});
