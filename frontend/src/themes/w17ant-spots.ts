/**
 * W17ant DM-floor desk spots (issue 212).
 *
 * Coordinates ported from W17ant rooms.ts "main-office" agentSpots — those
 * percentages are calibrated against the same DM room art we now render.
 * Art mapping: uniform scale to canvas height (1024/896), centered
 * horizontally on the 1280-wide canvas.
 */

import type { Position } from "@/types";
import type { OfficeFacing } from "@/themes/w17ant-cast";

const ART_WIDTH = 1200;
const ART_HEIGHT = 896;
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 1024;

const SCALE = CANVAS_HEIGHT / ART_HEIGHT; // 1.142857…
// Centered horizontally: art spans (1280 − 1200·scale)/2 … +1200·scale
const ART_X_OFFSET = (CANVAS_WIDTH - ART_WIDTH * SCALE) / 2;

/** Convert an art-space pixel coordinate to canvas space. */
export function artToCanvas(x: number, y: number): Position {
  return {
    x: ART_X_OFFSET + x * SCALE,
    y: y * SCALE,
  };
}

export interface DeskSpot {
  position: Position;
  /** Which way the character faces while seated here. */
  facing: OfficeFacing;
  /** Render sort order (W17ant zIndex — desks/foreground occlusion). */
  z: number;
}

/**
 * The 10 desk spots from W17ant rooms.ts main-office agentSpots, in art
 * pixels, converted to canvas space at module load. Positioned at the agent's
 * FEET (the cast sprite is anchored bottom-center), matching how W17ant
 * places its 78px-tall characters (≈133px tall at our scale).
 */
interface RawSpot {
  p: [number, number];
  f: OfficeFacing;
  z: number;
}

export const DESK_SPOTS: DeskSpot[] = (
  [
    { p: [25.8, 71], f: "rear-left", z: 85 },
    { p: [37.9, 68.2], f: "rear-right", z: 85 },
    { p: [26.9, 59.2], f: "front-left", z: 40 },
    { p: [38.5, 55.2], f: "rear-left", z: 58 },
    { p: [48.9, 52.9], f: "rear-right", z: 70 },
    { p: [38.8, 43.6], f: "front-left", z: 30 },
    { p: [52.7, 78.8], f: "rear-left", z: 95 },
    { p: [65.9, 75.8], f: "rear-right", z: 95 },
    { p: [55.2, 66.8], f: "front-left", z: 55 },
    { p: [68.7, 66.2], f: "front-right", z: 55 },
  ] as RawSpot[]
).map(({ p, f, z }) => ({
  position: artToCanvas((p[0] / 100) * ART_WIDTH, (p[1] / 100) * ART_HEIGHT),
  facing: f,
  z,
}));

/** Deterministic desk spot for desk number N (1-indexed, cycles if > 10). */
export function getSpotForDesk(deskNum: number): DeskSpot {
  const index = ((deskNum - 1) % DESK_SPOTS.length + DESK_SPOTS.length) % DESK_SPOTS.length;
  return DESK_SPOTS[index];
}

/** Boss anchor (art px → canvas): Michael's desk, right of the main cluster. */
export const BOSS_SPOT: DeskSpot = {
  position: artToCanvas(0.735 * ART_WIDTH, 0.615 * ART_HEIGHT),
  facing: "front-left",
  z: 60,
};
