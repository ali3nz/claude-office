/**
 * officeBehavior — display-only movement for real agents (issue 226 R3/R4).
 *
 * Two behaviors, both purely visual (authoritative state, backend and machines
 * are never touched):
 *   - break:   idle agents occasionally walk to the coffee machine / water
 *              cooler, linger, then return to their exact workstation.
 *   - consult: an agent that is consulting Sol walks over to the Sol gateway
 *              character, lingers, then returns to its workstation.
 *
 * Precedence (Sol): consult movement > return to workstation > idle break >
 * seated idle. Concurrency is capped so the floor never empties: at most ONE
 * agent on a break and ONE consulting at any moment, with per-agent cooldowns.
 * Advanced by a single pixi ticker; the sprite/label/bubble layers read the
 * same offsets so they stay aligned.
 */

import type { Position } from "@/types";

export type BehaviorMode = "seat" | "break" | "consult";

export interface BehaviorSpec {
  mode: BehaviorMode;
  /** The agent's authoritative seat (feet anchor). */
  seat: Position;
  /** Where to walk for break/consult (null => seat). */
  target: Position | null;
}

interface Anim {
  x: number;
  y: number;
  phase: "idle" | "out" | "linger" | "back";
  phaseUntil: number;
  nextBreakAt: number;
  nextConsultAt: number;
}

const WALK_SPEED = 95; // px/s
const BREAK_MIN_MS = 90_000;
const BREAK_MAX_MS = 240_000;
const BREAK_LINGER_MS = 7_000;
const CONSULT_LINGER_MS = 10_000;
const CONSULT_MIN_MS = 180_000;
const CONSULT_MAX_MS = 420_000;
const MAX_BREAKS = 1;
const MAX_CONSULTS = 1;

const specs = new Map<string, BehaviorSpec>();
const anims = new Map<string, Anim>();

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function setBehavior(id: string, spec: BehaviorSpec): void {
  specs.set(id, spec);
  if (!anims.has(id)) {
    const now = Date.now();
    anims.set(id, {
      x: 0,
      y: 0,
      phase: "idle",
      phaseUntil: 0,
      nextBreakAt: now + randBetween(BREAK_MIN_MS, BREAK_MAX_MS),
      nextConsultAt: now + randBetween(CONSULT_MIN_MS, CONSULT_MAX_MS),
    });
  }
}

export function dropBehavior(id: string): void {
  specs.delete(id);
  anims.delete(id);
}

export function getOffset(id: string): { x: number; y: number } {
  const anim = anims.get(id);
  return anim ? { x: anim.x, y: anim.y } : { x: 0, y: 0 };
}

function stepToward(anim: Anim, tx: number, ty: number, step: number): boolean {
  const dx = tx - anim.x;
  const dy = ty - anim.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= step || dist === 0) {
    anim.x = tx;
    anim.y = ty;
    return true;
  }
  anim.x += (dx / dist) * step;
  anim.y += (dy / dist) * step;
  return false;
}

/** Advance every agent's display offset. Called from one pixi ticker. */
export function tickBehaviors(deltaMs: number): void {
  const now = Date.now();
  const step = (WALK_SPEED * Math.min(deltaMs, 100)) / 1000;

  // Concurrency accounting: how many agents are currently away per behavior.
  let breaksAway = 0;
  let consultsAway = 0;
  for (const [id, spec] of specs) {
    const a = anims.get(id);
    if (!a || a.phase === "idle") continue;
    if (spec.mode === "consult") consultsAway += 1;
    else if (spec.mode === "break") breaksAway += 1;
  }

  for (const [id, spec] of specs) {
    const anim = anims.get(id);
    if (!anim) continue;
    const away = anim.phase !== "idle";

    // ---- consult: highest precedence, capped + cooled down ----
    if (spec.mode === "consult" && spec.target) {
      if (!away) {
        if (
          consultsAway < MAX_CONSULTS &&
          now >= anim.nextConsultAt
        ) {
          consultsAway += 1;
          anim.phase = "out";
        } else {
          // Not this agent's turn: stay seated.
          continue;
        }
      }
      const tx = spec.target.x - spec.seat.x;
      const ty = spec.target.y - spec.seat.y;
      if (anim.phase === "back") {
        if (stepToward(anim, 0, 0, step)) {
          anim.phase = "idle";
          anim.nextConsultAt = now + randBetween(CONSULT_MIN_MS, CONSULT_MAX_MS);
          anim.nextBreakAt = now + randBetween(BREAK_MIN_MS, BREAK_MAX_MS);
        }
      } else if (anim.phase === "linger") {
        if (now >= anim.phaseUntil) anim.phase = "back";
      } else if (stepToward(anim, tx, ty, step)) {
        anim.phase = "linger";
        anim.phaseUntil = now + CONSULT_LINGER_MS;
      }
      continue;
    }

    // ---- break: only for genuinely idle agents, capped ----
    switch (anim.phase) {
      case "idle": {
        if (
          spec.mode === "break" &&
          spec.target &&
          now >= anim.nextBreakAt &&
          breaksAway < MAX_BREAKS
        ) {
          breaksAway += 1;
          anim.phase = "out";
        } else if (spec.mode === "break" && now >= anim.nextBreakAt) {
          anim.nextBreakAt = now + 20_000; // someone else is out; try later
        }
        break;
      }
      case "out": {
        const target = spec.target;
        if (!target || stepToward(anim, target.x - spec.seat.x, target.y - spec.seat.y, step)) {
          anim.phase = "linger";
          anim.phaseUntil = now + BREAK_LINGER_MS;
        }
        break;
      }
      case "linger": {
        if (now >= anim.phaseUntil) anim.phase = "back";
        break;
      }
      case "back": {
        if (stepToward(anim, 0, 0, step)) {
          anim.phase = "idle";
          anim.nextBreakAt = now + randBetween(BREAK_MIN_MS, BREAK_MAX_MS);
        }
        break;
      }
    }
  }
}
