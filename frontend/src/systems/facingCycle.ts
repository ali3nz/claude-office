/**
 * facingCycle (issue 246 follow-up) — "Rotate" means change the DIRECTION an
 * object faces, never spin it. Isometric sprites ship 4 facing variants; a
 * turn count (0..19, wraps) selects the variant. Sprites with no facing
 * variants mirror horizontally on odd turns.
 */

import type { OfficeFacing } from "@/themes/w17ant-cast";

/** Clockwise facing order seen from above the isometric room. */
const DESK_CYCLE = ["right-front", "left-front", "left-rear", "right-rear"] as const;
const CHAR_CYCLE: OfficeFacing[] = [
  "front-right",
  "front-left",
  "rear-left",
  "rear-right",
];

export type DeskKindName = (typeof DESK_CYCLE)[number];

/** Next desk variant after `turn` clockwise steps from `kind`. */
export function turnDeskKind(kind: string, turn: number): DeskKindName {
  const i = DESK_CYCLE.indexOf(kind as DeskKindName);
  if (i < 0) return kind as DeskKindName;
  return DESK_CYCLE[(i + (((turn % 4) + 4) % 4)) % 4];
}

/**
 * Avatar facing for a turn count: 0 = automatic (behaviour engine), 1..4 = a
 * fixed facing. Returns null for automatic.
 */
export function avatarFacingForTurn(turn: number): OfficeFacing | null {
  const t = ((turn % 5) + 5) % 5;
  return t === 0 ? null : CHAR_CYCLE[t - 1];
}

const DESK_RE = /^(\/sprites\/furniture\/standing-desk-)(left-front|left-rear|right-front|right-rear)(\.png)$/;
const CHAR_RE = /^(\/sprites\/office\/characters\/.+-)(front-left|front-right|rear-left|rear-right)(\.png)$/;

/**
 * Resolve the sprite path + mirror flag for an object after `turn` steps.
 * Desks and cast characters swap to the next facing variant; everything else
 * mirrors on odd turns.
 */
export function turnedSprite(
  path: string,
  turn: number,
): { path: string; flip: boolean } {
  const d = DESK_RE.exec(path);
  if (d) {
    return { path: `${d[1]}${turnDeskKind(d[2], turn)}${d[3]}`, flip: false };
  }
  const c = CHAR_RE.exec(path);
  if (c) {
    const [a, b] = c[2].split("-"); // front-left -> front,left
    const asDesk = `${b}-${a}`; // left-front
    const next = turnDeskKind(asDesk, turn).split("-"); // [side, depth]
    return { path: `${c[1]}${next[1]}-${next[0]}${c[3]}`, flip: false };
  }
  return { path, flip: ((turn % 2) + 2) % 2 === 1 };
}
