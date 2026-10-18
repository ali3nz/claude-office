import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/utils/api", () => ({ apiFetch }));
// Toast auto-dismiss prefs are irrelevant here; a fixed value keeps the store isolated.
vi.mock("@/stores/preferencesStore", () => ({
  usePreferencesStore: {
    getState: () => ({ toastAutoDismissLow: 0, toastAutoDismissInfo: 0 }),
  },
}));

import { useAttentionStore } from "@/stores/attentionStore";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("focusAgentTerminal", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    useAttentionStore.setState({ focusPopup: null, toastQueue: [] });
    useAttentionStore.getState().openFocusPopup("agent-1", 10, 20);
  });

  it("posts to the session focus endpoint", async () => {
    apiFetch.mockResolvedValue(
      jsonResponse({ status: "success", message: "Session s1 focused" }),
    );

    await useAttentionStore.getState().focusAgentTerminal("s1", null);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/sessions/s1/focus",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("closes the popup after a successful focus", async () => {
    apiFetch.mockResolvedValue(
      jsonResponse({ status: "success", message: "Session s1 focused" }),
    );

    await useAttentionStore.getState().focusAgentTerminal("s1", null);

    expect(useAttentionStore.getState().focusPopup).toBeNull();
  });

  it("keeps the popup open with a no-terminal notice when the host has no terminal", async () => {
    apiFetch.mockResolvedValue(
      jsonResponse({ status: "unavailable", message: "No terminal on this host" }),
    );

    await useAttentionStore.getState().focusAgentTerminal("s1", null);

    expect(useAttentionStore.getState().focusPopup).toEqual({
      agentId: "agent-1",
      screenX: 10,
      screenY: 20,
      notice: "no-terminal",
    });
    expect(useAttentionStore.getState().toastQueue).toHaveLength(0);
  });

  it("reports a failed request as an error and closes the popup", async () => {
    apiFetch.mockResolvedValue(
      new Response("boom", { status: 500, statusText: "Internal Server Error" }),
    );

    await useAttentionStore.getState().focusAgentTerminal("s1", null);

    expect(useAttentionStore.getState().focusPopup).toBeNull();
    expect(useAttentionStore.getState().toastQueue[0]?.description).toContain(
      "Focus terminal failed",
    );
  });
});
