import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { selectAgents, useGameStore } from "@/stores/gameStore";
import {
  IDLE_CLOCK_MS,
  countRecentlyActive,
  filterRecentlyActive,
} from "@/systems/idleSweep";

/**
 * Wall clock that ticks every IDLE_CLOCK_MS, so idle agents expire even when
 * no store update arrives (issue 226 R5 + 714).
 */
export function useIdleClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), IDLE_CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Agents that pass the idle sweep - the same set the floor draws. */
export function useRecentlyActiveAgents() {
  const agents = useGameStore(useShallow(selectAgents));
  const now = useIdleClock();
  return useMemo(() => filterRecentlyActive(agents, now), [agents, now]);
}

/**
 * Count of agents that pass the idle sweep. Selects a primitive, so the caller
 * re-renders only when the count changes (or on the idle tick), not per frame.
 */
export function useRecentlyActiveCount(): number {
  const now = useIdleClock();
  return useGameStore((s) => countRecentlyActive(s.agents, now));
}
