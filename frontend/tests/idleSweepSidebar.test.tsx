// @vitest-environment happy-dom
/**
 * Operator 2026-10-21: idle agents must leave the AGENT STATE sidebar as well
 * as the floor. This renders the real component against the real store (SSR
 * would show the store's initial state under zustand 5, so it cannot prove
 * this).
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentStatus } from "@/components/game/AgentStatus";
import { IDLE_CLOCK_MS, IDLE_TIMEOUT_MS } from "@/systems/idleSweep";
import { useGameStore } from "@/stores/gameStore";
import type { Agent, Position } from "@/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ORIGIN: Position = { x: 0, y: 0 };

function makeAgent(id: string, name: string): Agent {
  return { id, name, color: "#ff0000", number: 1, state: "working" };
}

/** Force lastActivityAt to a fixed value (the store only stamps "now"). */
function pinClock(id: string, value: number): void {
  useGameStore.setState((state) => {
    const agents = new Map(state.agents);
    const agent = agents.get(id);
    if (agent) agents.set(id, { ...agent, lastActivityAt: value });
    return { agents };
  });
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(element: ReactElement): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  container = host;
  root = r;
  await act(async () => {
    r.render(element);
  });
  return host;
}

beforeEach(() => {
  useGameStore.getState().reset();
  vi.useFakeTimers();
});

afterEach(async () => {
  const r = root;
  root = null;
  if (r) {
    await act(async () => {
      r.unmount();
    });
  }
  container?.remove();
  container = null;
  vi.useRealTimers();
});

describe("AGENT STATE sidebar follows the idle sweep", () => {
  it("lists only the agents that pass the sweep", async () => {
    const now = Date.now();
    const store = useGameStore.getState();
    store.addAgent(makeAgent("fresh", "Fresh Bot"), ORIGIN);
    store.addAgent(makeAgent("stale", "Stale Bot"), ORIGIN);
    pinClock("fresh", now - 60_000);
    pinClock("stale", now - IDLE_TIMEOUT_MS - 1_000);

    const host = await render(createElement(AgentStatus));

    expect(host.textContent).toContain("Fresh Bot");
    expect(host.textContent).not.toContain("Stale Bot");
  });

  it("an agent leaves the list on the idle tick once the timeout passes", async () => {
    const now = Date.now();
    useGameStore.getState().addAgent(makeAgent("solo", "Solo Bot"), ORIGIN);
    pinClock("solo", now - IDLE_TIMEOUT_MS + 60_000);

    const host = await render(createElement(AgentStatus));
    expect(host.textContent).toContain("Solo Bot");

    // The wall clock passes the timeout; the component only re-evaluates on
    // its idle tick (IDLE_CLOCK_MS), so advance one tick.
    vi.setSystemTime(now + 2 * 60_000);
    await act(async () => {
      vi.advanceTimersByTime(IDLE_CLOCK_MS);
    });

    expect(host.textContent).not.toContain("Solo Bot");
  });
});
