/**
 * Issue 714: the idle sweep never fired because every room broadcast patched
 * every agent, and every patch counted as activity - so `lastActivityAt` was
 * refreshed continuously and `isRecentlyActive` (OfficeGame) was always true.
 *
 * These tests pin the fixed store semantics:
 *  - a patch that repeats unchanged non-movement values does NOT refresh
 *    `lastActivityAt` (room broadcasts are not activity);
 *  - a genuinely CHANGED non-movement value does refresh it;
 *  - a new bubble does refresh it;
 *  - movement writes never refresh it (issue 226 R5 rule, unchanged).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/stores/gameStore";
import type { Agent, BubbleContent, Position } from "@/types";

const ORIGIN: Position = { x: 0, y: 0 };

/** Minimal backend Agent fixture; tests override fields as needed. */
function makeAgent(id: string, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    color: "#ff0000",
    number: 1,
    state: "working",
    ...overrides,
  };
}

const BUBBLE: BubbleContent = { type: "speech", text: "hi" };

const PAST = 1_000;

/** Force lastActivityAt to a fixed past value so refreshes are observable. */
function pinClock(id: string, value: number): void {
  useGameStore.setState((state) => {
    const agents = new Map(state.agents);
    const agent = agents.get(id);
    if (agent) agents.set(id, { ...agent, lastActivityAt: value });
    return { agents };
  });
}

function clockOf(id: string): number | undefined {
  return useGameStore.getState().agents.get(id)?.lastActivityAt;
}

beforeEach(() => {
  useGameStore.getState().reset();
});

describe("idle clock (issue 714)", () => {
  it("repeating an unchanged patch does not count as activity", () => {
    useGameStore.getState().addAgent(makeAgent("A", { name: "Alice" }), ORIGIN);
    pinClock("A", PAST);

    // The room-broadcast path: same state, same name, same task, same title.
    useGameStore.getState().updateAgentMeta("A", {
      backendState: "working",
      name: "Alice",
      currentTask: null,
      title: null,
    });

    expect(clockOf("A")).toBe(PAST);
  });

  it("a changed non-movement value refreshes the clock", () => {
    useGameStore.getState().addAgent(makeAgent("A", { name: "Alice" }), ORIGIN);
    pinClock("A", PAST);

    useGameStore.getState().updateAgentMeta("A", {
      backendState: "idle",
      name: "Alice",
      currentTask: null,
      title: null,
    });

    expect(clockOf("A")).toBeGreaterThan(PAST);
  });

  it("a new bubble refreshes the clock", () => {
    useGameStore.getState().addAgent(makeAgent("A", { name: "Alice" }), ORIGIN);
    pinClock("A", PAST);

    useGameStore.getState().enqueueBubble("A", BUBBLE);

    expect(clockOf("A")).toBeGreaterThan(PAST);
  });

  it("movement writes never refresh the clock", () => {
    useGameStore.getState().addAgent(makeAgent("A", { name: "Alice" }), ORIGIN);
    pinClock("A", PAST);

    useGameStore.getState().updateAgentTarget("A", { x: 100, y: 200 });
    useGameStore.getState().updateAgentPath("A", null);

    expect(clockOf("A")).toBe(PAST);
  });
});
