/**
 * Idle sweep (issue 226 R5 + 714; operator: "idle agents are supposed to
 * disappear after 5 minutes"). One predicate decides who is shown, so the
 * floor, the AGENT STATE and AGENT ACTIVITY lists and the header count cannot
 * drift apart.
 *
 * An agent stays while it has REAL activity within IDLE_TIMEOUT_MS (issue 714:
 * repeated unchanged room broadcasts and reconnect replays do not count). The
 * two Sol gateway characters and Ghost Protocol are ALWAYS present - they are
 * infrastructure, not sessions.
 */
import { PERSISTENT_IDS } from "@/systems/persistentIdentities";

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** How often idle agents are re-evaluated without a store update. */
export const IDLE_CLOCK_MS = 30_000;

const ALWAYS_PRESENT = new Set([
  "Sol Docker",
  "Sol Webserver",
  "Ghost",
  "Ghost Protocol",
]);

export interface SweepableAgent {
  id?: string;
  name: string | null;
  lastActivityAt?: number;
}

export function isRecentlyActive(agent: SweepableAgent, now: number): boolean {
  if (agent.name && ALWAYS_PRESENT.has(agent.name)) return true;
  // Issue 226 R6h: robust persistent-identity detection - the ai-agents and
  // the two gateway sessions never leave the floor even when their feed goes
  // quiet (a missing identity once went missing because only the display name was checked).
  // SOL review: enumerate the three persistent IDs exactly; an `ai-` prefix
  // would make any future ai-* agent permanently immune to the idle sweep.
  if (PERSISTENT_IDS.has(agent.id ?? "")) return true;
  if (!Number.isFinite(agent.lastActivityAt) || !agent.lastActivityAt) return false;
  return now - agent.lastActivityAt < IDLE_TIMEOUT_MS;
}

/** The agents that pass the sweep, keyed as in the source map. */
export function filterRecentlyActive<T extends SweepableAgent>(
  agents: ReadonlyMap<string, T>,
  now: number,
): Map<string, T> {
  const active = new Map<string, T>();
  for (const [key, agent] of agents) {
    if (isRecentlyActive(agent, now)) active.set(key, agent);
  }
  return active;
}

/** Number of agents that pass the sweep (the same set as filterRecentlyActive). */
export function countRecentlyActive<T extends SweepableAgent>(
  agents: ReadonlyMap<string, T>,
  now: number,
): number {
  let count = 0;
  for (const agent of agents.values()) {
    if (isRecentlyActive(agent, now)) count += 1;
  }
  return count;
}
