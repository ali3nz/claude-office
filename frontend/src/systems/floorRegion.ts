/**
 * Floor region (issue 714 follow-up, operator: "previously some agents were
 * partially off the floor completely so that can't happen either").
 *
 * The room art (office-day-dm.png, 1200x896) maps to canvas space through
 * `artToCanvas` (scale 1024/896, x offset -45.71). Measuring the carpet's
 * lower boundary from the art gives two straight edges meeting at the bottom
 * vertex (686, 976):
 *
 *   left  edge: y = 658 + 0.461 x      (x <= 686)
 *   right edge: y = 1326.2 - 0.518 x   (x >  686)
 *
 * Everything below those lines is the dark void outside the room. Characters
 * must keep their feet above the edge by FLOOR_FOOT_MARGIN so nobody renders
 * partially off the floor, and standing desks must keep their whole
 * character (seat + STAND_DESK_FORWARD) on the carpet.
 */

/** How far in front of a desk anchor a standing character is drawn. */
export const STAND_DESK_FORWARD = 40;

const BOTTOM_VERTEX_X = 686;
const LEFT_SLOPE = 0.461;
const LEFT_INTERCEPT = 658;
const RIGHT_SLOPE = -0.518;
const RIGHT_INTERCEPT = 1326.2;

/** Safety margin between a character's feet and the carpet edge. */
export const FLOOR_FOOT_MARGIN = 20;

/** Lowest carpet y at a given canvas x (the room's lower boundary). */
export function floorEdgeY(x: number): number {
  return x <= BOTTOM_VERTEX_X
    ? LEFT_INTERCEPT + LEFT_SLOPE * x
    : RIGHT_INTERCEPT + RIGHT_SLOPE * x;
}

/** Clamp a character's FEET position onto the carpet (never off the floor). */
export function clampFeetToFloor<T extends { x: number; y: number }>(p: T): T {
  const maxY = floorEdgeY(p.x) - FLOOR_FOOT_MARGIN;
  return p.y <= maxY ? p : { ...p, y: maxY };
}

/**
 * Clamp a standing-desk ANCHOR so its occupant (anchor + STAND_DESK_FORWARD)
 * stays on the carpet. The desk moves with the character - the pair keeps the
 * standard workstation relationship instead of the character sliding off the
 * floor or into its own desk.
 */
export function clampDeskSeatY(x: number, y: number): number {
  const maxY = floorEdgeY(x) - FLOOR_FOOT_MARGIN - STAND_DESK_FORWARD;
  return y <= maxY ? y : maxY;
}
