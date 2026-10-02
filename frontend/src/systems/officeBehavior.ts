/**
 * officeBehavior — display-only movement for real agents (issue 226 R3/R4).
 *
 * Two behaviors, both purely visual (the authoritative agent state, backend and
 * machines are never touched):
 *   - break:   idle agents occasionally walk to the coffee machine / water
 *              cooler, linger, then return to their exact workstation.
 *   - consult: agents that are consulting Sol walk over to the Sol gateway
 *              character, linger, then return to their workstation.
 *
 * Precedence (Sol): consult movement > return to workstation > idle break >
 * seated idle. The engine is advanced by a single pixi ticker and read by the
 * sprite/label/bubble layers so they stay aligned.
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
}

const WALK_SPEED = 95; // px/s
const BREAK_MIN_MS = 45_000;
const BREAK_MAX_MS = 150_000;
const BREAK_LINGER_MS = 7_000;
const CONSULT_LINGER_MS = 12_000;

const specs = new Map<string, BehaviorSpec>();
const anims = new Map<string, Anim>();

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function setBehavior(id: string, spec: BehaviorSpec): void {
  specs.set(id, spec);
  const anim = anims.get(id);
  if (!anim) {
    anims.set(id, {
      x: 0,
      y: 0,
      phase: "idle",
      phaseUntil: 0,
      nextBreakAt: Date.now() + randBetween(BREAK_MIN_MS, BREAK_MAX_MS),
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

  for (const [id, spec] of specs) {
    const anim = anims.get(id);
    if (!anim) continue;

    // Consult movement always wins and pre-empts any in-flight break.
    if (spec.mode === "consult" && spec.target) {
      const tx = spec.target.x - spec.seat.x;
      const ty = spec.target.y - spec.seat.y;
      if (anim.phase === "back") {
        if (stepToward(anim, 0, 0, step)) {
          anim.phase = "idle";
          anim.nextBreakAt = now + randBetween(BREAK_MIN_MS, BREAK_MAX_MS);
        }
      } else if (anim.phase === "linger") {
        if (now >= anim.phaseUntil) anim.phase = "back";
      } else {
        if (stepToward(anim, tx, ty, step)) {
          anim.phase = "linger";
          anim.phaseUntil = now + CONSULT_LINGER_MS;
        }
      }
      continue;
    }

    switch (anim.phase) {
      case "idle": {
        if (spec.mode === "break" && spec.target && now >= anim.nextBreakAt) {
          anim.phase = "out";
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
