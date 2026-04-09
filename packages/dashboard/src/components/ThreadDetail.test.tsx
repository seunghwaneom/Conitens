import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadDetail } from "./ThreadDetail";

describe("ThreadDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a live-bridge empty state without a token and skips fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <ThreadDetail
        apiBase="http://localhost:8785/api"
        threadId="thread-1"
        token=""
      />,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/thread detail을 보려면 라이브 브리지를 연결하세요/i)).toBeInTheDocument();
  });

  it("refetches detail when the bearer token changes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        thread: {
          id: "thread-1",
          kind: "agent_agent",
          workspace: "ops",
          status: "open",
          participants: ["architect", "worker-1"],
          created_at: "2026-04-09T00:00:00Z",
          updated_at: "2026-04-09T00:05:00Z",
          messages: [],
          path: ".threads/thread-1.json",
        },
      }),
    } as Response);

    const { rerender } = render(
      <ThreadDetail
        apiBase="http://localhost:8785/api"
        threadId="thread-1"
        token="first-token"
      />,
    );

    expect(await screen.findByText("thread-1")).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer first-token" },
    });

    rerender(
      <ThreadDetail
        apiBase="http://localhost:8785/api"
        threadId="thread-1"
        token="second-token"
      />,
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer second-token" },
    });
  });
});
