/**
 * W17ant DM-floor desk spots (issue 212).
 *
 * Coordinates ported from W17ant rooms.ts "main-office" agentSpots — those
 * percentages are calibrated against the same DM room art we now render.
 * Art mapping: uniform scale to canvas height (1024/896), centered
 * horizontally on the 1280-wide canvas.
 */

import type { Position } from "@/types";
import { BOSS_RUG_POSITION } from "@/constants/positions";
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

// ============================================================================
// WORKSTATIONS (desks) — W17ant rooms.ts main-office furniture entries
// ============================================================================

/**
 * The four W17ant standing-desk sprites. Each sprite already contains the
 * full workstation: dual monitors, laptop, keyboard and mouse ("computers").
 */
export type DeskSpriteKind =
  | "left-front"
  | "left-rear"
  | "right-front"
  | "right-rear";

/**
 * W17ant's room is rendered at 800x600 while the art is 1200x896, and our
 * canvas maps the art at SCALE. Sprite display sizes in W17ant's asset table
 * (height 106 front / 102 rear) therefore scale to the canvas as:
 *   height_canvas = height_w17ant * (ART_WIDTH / 800) * SCALE
 */
const W17ANT_ROOM_WIDTH = 800;
const W17ANT_DESK_HEIGHT = { front: 106, rear: 102 } as const;
const ART_PER_ROOM = ART_WIDTH / W17ANT_ROOM_WIDTH; // 1.5

export function deskSpritePath(kind: DeskSpriteKind): string {
  return `/sprites/furniture/standing-desk-${kind}.png`;
}

/** Canvas-space display height for a desk sprite kind. */
export function deskSpriteHeight(kind: DeskSpriteKind): number {
  const base = kind.endsWith("front")
    ? W17ANT_DESK_HEIGHT.front
    : W17ANT_DESK_HEIGHT.rear;
  return base * ART_PER_ROOM * SCALE;
}

export interface DeskFurniture {
  kind: DeskSpriteKind;
  /** Bottom-center anchor (canvas px) — the desk's floor contact point. */
  position: Position;
}

interface RawDesk {
  k: DeskSpriteKind;
  p: [number, number];
}

/**
 * The 10 workstation entries from W17ant rooms.ts main-office `furniture`
 * (desk-1a…desk-3d), converted from art percentages to canvas space.
 * The anchor is the sprite's bottom-center (W17ant uses translate(-50%,-100%)),
 * which is also the correct render z (front edge y) for our y-sorted layer.
 */
/** Break destinations (W17ant main-office activity spots, art -> canvas). */
export const COFFEE_SPOT: Position = artToCanvas(
  (73.5 / 100) * ART_WIDTH,
  (56.7 / 100) * ART_HEIGHT,
);
export const WATER_SPOT: Position = artToCanvas(
  (53.3 / 100) * ART_WIDTH,
  (46.6 / 100) * ART_HEIGHT,
);

export const DESKS: DeskFurniture[] = (
  [
    { k: "left-rear", p: [42.4, 50.4] },
    { k: "left-front", p: [46.7, 53] },
    { k: "right-front", p: [39.9, 55.2] },
    { k: "left-rear", p: [31.4, 64.8] },
    { k: "left-front", p: [35.4, 67.5] },
    { k: "right-front", p: [27.9, 70] },
    { k: "left-rear", p: [59, 73.7] },
    { k: "left-front", p: [62.6, 76] },
    { k: "right-front", p: [55.4, 78.7] },
    { k: "right-rear", p: [66.6, 71.1] },
  ] as RawDesk[]
).map(({ k, p }) => ({
  kind: k,
  position: artToCanvas((p[0] / 100) * ART_WIDTH, (p[1] / 100) * ART_HEIGHT),
}));

/**
 * Boss workstation: one additional desk (not part of W17ant's main-office
 * furniture list). The boss's runtime home is the legacy store default
 * BOSS_POSITION (640, 900) — his sprite never moves to the art-space
 * BOSS_SPOT — so the desk is placed just BEHIND him (bottom edge above his
 * feet), which reads as "Michael behind his desk" and keeps the departure
 * queue's final position (640, 940) in front of the desk, unblocked.
 */
/**
 * PERSISTENT identities (operator, issue 226 R5): Sol Docker (Boss),
 * Sol Webserver, GhostReporting and TruFreedom each get a FIXED workstation
 * that never changes, and the two Sol characters never move or take breaks.
 *
 * Seats are feet anchors. Sol Docker sits at the boss desk (front-centre, on
 * the rug); the others get dedicated desks outside the 10-workstation pool so
 * they can never collide with a session character.
 */
export const BOSS_SEAT: Position = { x: 640, y: 958 };

export const PINNED_SEATS: Record<string, Position> = {
  "Sol Docker": BOSS_SEAT,
  "Sol Webserver": { x: 1075, y: 735 },
  "GhostReporting": { x: 205, y: 735 },
  "TruFreedom": { x: 862, y: 882 },
};

/** Dedicated desks for the pinned seats (the boss desk already exists). */
export const PINNED_DESKS: DeskFurniture[] = [
  { kind: "right-front", position: { x: 1075, y: 735 } },
  { kind: "left-front", position: { x: 205, y: 735 } },
  { kind: "right-front", position: { x: 862, y: 882 } },
];

export const BOSS_DESK: DeskFurniture = {
  kind: "right-front",
  position: {
    x: BOSS_RUG_POSITION.x,
    y: BOSS_RUG_POSITION.y - 54, // 886 = boss feet (900) − 14
  },
};
