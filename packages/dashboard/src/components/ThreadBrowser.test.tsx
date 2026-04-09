import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadBrowser } from "./ThreadBrowser";

describe("ThreadBrowser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a live-bridge empty state without a token and skips fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<ThreadBrowser apiBase="http://localhost:8785/api" token="" />);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/thread history를 보려면 라이브 브리지를 연결하세요/i)).toBeInTheDocument();
    expect(screen.getByText(/데모 샘플/i)).toBeInTheDocument();
  });

  it("refetches when the bearer token changes and exposes a labelled filter", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ threads: [] }),
    } as Response);

    const { rerender } = render(
      <ThreadBrowser apiBase="http://localhost:8785/api" token="first-token" />,
    );

    expect(await screen.findByRole("searchbox", { name: /스레드 필터/i })).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer first-token" },
    });

    rerender(<ThreadBrowser apiBase="http://localhost:8785/api" token="second-token" />);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer second-token" },
    });
  });
});
