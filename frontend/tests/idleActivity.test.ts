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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useWebSocketEvents } from "@/hooks/useWebSocketEvents";
import { useGameStore } from "@/stores/gameStore";
import { reconcileState, type ReconcilerContext } from "@/systems/stateReconciler";
import type { WebSocketControllerOptions } from "@/systems/webSocketController";
import type { Agent, BubbleContent, GameState, Position } from "@/types";
import {
  IDLE_TIMEOUT_MS,
  countRecentlyActive,
  filterRecentlyActive,
  isRecentlyActive,
} from "@/systems/idleSweep";
import { PERSISTENT_IDS } from "@/systems/persistentIdentities";

// The reconciler drives the machine service; these store-level tests need none of it.
vi.mock("@/machines/agentMachineService", () => ({
  agentMachineService: {
    spawnAgent: vi.fn(),
    triggerDeparture: vi.fn(),
    markPendingDeparture: vi.fn(),
    notifyBossAvailable: vi.fn(),
    notifyBubbleComplete: vi.fn(),
  },
}));

// Records the controller the hook constructs, so a test can drive the hook's
// own onMessage / onReconnectReset callbacks (what WebSocketController invokes).
const hoisted = vi.hoisted(() => ({
  controllers: [] as Array<{ opts: WebSocketControllerOptions }>,
}));

vi.mock("@/systems/webSocketController", () => ({
  WebSocketController: class {
    connect(): void {}
    disconnect(): void {}
    constructor(public opts: WebSocketControllerOptions) {
      hoisted.controllers.push(this);
    }
  },
}));

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

/**
 * Issue 714 follow-up: a transport reconnect replays every agent's current
 * bubble. The replay must not re-arm the idle clock, while a genuinely new
 * bubble must still count as activity. The reconciler's per-entity dedupe map
 * (lastSeenBubbleText) is what suppresses the replay; the hook keeps that map
 * across transport reconnects and clears it only on session/room change.
 */
describe("reconnect replay does not re-arm the idle clock", () => {
  const T0 = Date.parse("2026-10-20T10:00:00Z");
  const MIN5 = 5 * 60 * 1000;

  /** One backend agent at its desk, showing a tool bubble. */
  function snapshot(sessionId: string, text: string | null): GameState {
    return {
      sessionId,
      boss: { state: "idle", currentTask: null, bubble: null },
      office: {
        contextUtilization: 0,
        deskCount: 0,
        phoneState: "idle",
        printReport: null,
        toolUsesSinceCompaction: 0,
      },
      arrivalQueue: [],
      departureQueue: [],
      conversation: [],
      todos: [],
      whiteboardData: null,
      agents: [
        {
          id: "off-quiet",
          color: "#00ff00",
          number: 1,
          state: "idle",
          name: "Quiet session",
          desk: 3,
          ...(text === null ? {} : { bubble: { type: "speech", text } }),
        } as unknown as Agent,
      ],
    } as unknown as GameState;
  }

  function newCtx(sessionId: string): ReconcilerContext {
    return {
      currentSessionId: sessionId,
      processedAgents: new Set(),
      lastSeenBubbleText: new Map(),
      initialQueueSyncDone: { current: null },
    } as unknown as ReconcilerContext;
  }

  /** The machine would bring a spawned agent to its desk; mimic that. */
  function settleAtDesk(id: string): void {
    useGameStore.setState((s) => {
      const agents = new Map(s.agents);
      const a = agents.get(id);
      if (a) agents.set(id, { ...a, phase: "idle" as typeof a.phase });
      return { agents };
    });
  }

  beforeEach(() => {
    useGameStore.getState().reset();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("an unchanged bubble replayed after a reconnect keeps the original clock", () => {
    const ctx = newCtx("S1");
    reconcileState(snapshot("S1", null), ctx); // spawn, no bubble yet
    settleAtDesk("off-quiet");

    vi.setSystemTime(T0 + 30_000);
    reconcileState(snapshot("S1", "read"), ctx); // first display: real activity
    const shownAt = clockOf("off-quiet");
    expect(shownAt).toBe(T0 + 30_000);
    useGameStore.getState().advanceBubble("off-quiet"); // bubble finished

    // Socket reconnects 5 minutes later; the server replays the same bubble.
    vi.setSystemTime(T0 + 30_000 + MIN5);
    reconcileState(snapshot("S1", "read"), ctx);
    expect(clockOf("off-quiet")).toBe(shownAt);
  });

  it("a changed bubble after the reconnect still counts as activity", () => {
    const ctx = newCtx("S1");
    reconcileState(snapshot("S1", null), ctx);
    settleAtDesk("off-quiet");
    vi.setSystemTime(T0 + 30_000);
    reconcileState(snapshot("S1", "read"), ctx);
    useGameStore.getState().advanceBubble("off-quiet");

    vi.setSystemTime(T0 + 60_000);
    reconcileState(snapshot("S1", "grep"), ctx);
    expect(clockOf("off-quiet")).toBe(T0 + 60_000);
  });

  // The tests above share one ReconcilerContext and never clear its dedupe map,
  // so they cannot see a reconnect reset. These go through the real hook.
  function Harness(): null {
    useWebSocketEvents({ sessionId: "S1", enabled: true });
    return null;
  }

  /** Renders the hook once (effects do not run server-side) and returns its controller. */
  function hookController(): { opts: WebSocketControllerOptions } {
    renderToString(createElement(Harness));
    const latest = hoisted.controllers[hoisted.controllers.length - 1];
    if (!latest) throw new Error("hook did not construct a controller");
    return latest;
  }

  /** Delivers a state_update exactly as the socket would. */
  function deliver(controller: { opts: WebSocketControllerOptions }, text: string | null): void {
    controller.opts.onMessage({
      data: JSON.stringify({ type: "state_update", state: snapshot("S1", text) }),
    } as unknown as MessageEvent);
  }

  it("hook: a real reconnect does not re-arm the clock of an unchanged bubble", () => {
    const controller = hookController();
    deliver(controller, null); // spawn, no bubble yet
    settleAtDesk("off-quiet");

    vi.setSystemTime(T0 + 30_000);
    deliver(controller, "read"); // first display: real activity
    const shownAt = clockOf("off-quiet");
    expect(shownAt).toBe(T0 + 30_000);
    useGameStore.getState().advanceBubble("off-quiet");

    vi.setSystemTime(T0 + 30_000 + MIN5);
    controller.opts.onReconnectReset(); // WebSocketController calls this from onopen
    deliver(controller, "read"); // the server replays the same bubble
    expect(clockOf("off-quiet")).toBe(shownAt);
  });

  it("hook: a changed bubble after a real reconnect still counts as activity", () => {
    const controller = hookController();
    deliver(controller, null);
    settleAtDesk("off-quiet");
    vi.setSystemTime(T0 + 30_000);
    deliver(controller, "read");
    useGameStore.getState().advanceBubble("off-quiet");

    vi.setSystemTime(T0 + 60_000);
    controller.opts.onReconnectReset();
    deliver(controller, "grep");
    expect(clockOf("off-quiet")).toBe(T0 + 60_000);
  });
});

// Operator 2026-10-21: the floor, both sidebars and the header count must agree
// on who is idle, so they share one predicate (systems/idleSweep.ts).
describe("idle sweep predicate shared by floor, sidebars and header", () => {
  const NOW = 10_000_000;
  const agent = (id: string, name: string | null, ageMs?: number) => ({
    id,
    name,
    lastActivityAt: ageMs === undefined ? undefined : NOW - ageMs,
  });

  it("drops an agent once it has had no real activity for 5 minutes", () => {
    expect(isRecentlyActive(agent("fresh", "Fresh", 4 * 60_000), NOW)).toBe(true);
    expect(isRecentlyActive(agent("edge", "Edge", IDLE_TIMEOUT_MS), NOW)).toBe(false);
    expect(isRecentlyActive(agent("old", "Old", 6 * 60_000), NOW)).toBe(false);
  });

  it("keeps the Sol gateways and Ghost Protocol by name or persistent id", () => {
    const persistentId = [...PERSISTENT_IDS][0];
    expect(isRecentlyActive(agent("x", "Sol Docker", 60 * 60_000), NOW)).toBe(true);
    expect(isRecentlyActive(agent("x", "Ghost Protocol", 60 * 60_000), NOW)).toBe(true);
    expect(isRecentlyActive(agent(persistentId, "Plain", 60 * 60_000), NOW)).toBe(true);
  });

  it("keeps an agent that has never been stamped (unchanged behaviour)", () => {
    expect(isRecentlyActive(agent("never", "Never", undefined), NOW)).toBe(true);
  });

  it("filter and count keep exactly the same agents", () => {
    const agents = new Map([
      ["fresh", agent("fresh", "Fresh", 60_000)],
      ["stale", agent("stale", "Stale", 10 * 60_000)],
      ["sol", agent("sol", "Sol Docker", 10 * 60_000)],
    ]);
    const kept = filterRecentlyActive(agents, NOW);
    expect([...kept.keys()].sort()).toEqual(["fresh", "sol"]);
    expect(countRecentlyActive(agents, NOW)).toBe(kept.size);
  });
});
