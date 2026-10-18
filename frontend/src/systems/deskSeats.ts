"use client";

/**
 * deskSeats — the office desk/seat pool derived from the SAVED layout.
 *
 * The operator arranges the office in edit mode; that persisted layout (shared
 * through the backend — the saved "Ben" snapshot is the one in use) is the
 * single source of truth for WHICH desks exist and WHERE they are:
 *
 *   - the ten authored workstations, minus any the operator hid, each drawn at
 *     its moved position when the operator dragged `desk-N`; and
 *   - every standing-desk sprite the operator inserted from the palette.
 *
 * Seating order (issue 360): agents fill pool seats first; when every desk is
 * taken, further arrivals STAND at the overflow spots (issue 714: beside the
 * bandit cat, south/east of the pool table, west and bottom-centre open
 * floor) instead of spawning new desks or doubling up. The three pinned
 * identities (Sol Docker, Sol Webserver, Ghost Protocol) never enter this
 * pool; they keep fixed seats (see themes/w17ant-spots PINNED_SEATS).
 *
 * Seat POSITION feeds the movement engine too (getDeskPosition), so the helper
 * exposes a module snapshot that pure/non-React callers read; React callers use
 * the useDeskSeats() hook, which re-derives on every layout change.
 */

import { useMemo } from "react";
import {
  DESK_SPOTS,
  DESKS,
  SEAT_TO_DESK_INDEX,
  OVERFLOW_SPOTS,
  type DeskSpriteKind,
} from "@/themes/w17ant-spots";
import {
  useOfficeEditStore,
  type EntityOverride,
  type InsertedSprite,
} from "@/stores/officeEditStore";
import {
  clampDeskSeatY,
  clampFeetToFloor,
} from "@/systems/floorRegion";

export interface DeskSeat {
  /** Stable entity id: `desk-<n>`, the sprite id, or `overflow-<n>`. */
  id: string;
  x: number;
  y: number;
  /** Furniture sprite kind (used to render pool workstations). */
  kind: DeskSpriteKind;
  /** true = one of the ten authored workstations; false = operator-inserted. */
  base: boolean;
  /** true = seated at a desk; false = standing at an overflow spot. */
  desk: boolean;
}

const DESK_PATH_RE = /\/sprites\/(?:furniture\/standing-desk-(left|right)-(front|rear)|desk)\.png$/;

/** Is this sprite path a workstation desk (i.e. should it become a seat)? */
export function isDeskSpritePath(path: string): boolean {
  return DESK_PATH_RE.test(path);
}

/** Furniture kind for a standing-desk sprite path (defaults left-front). */
export function deskKindFromPath(path: string): DeskSpriteKind {
  const m = /standing-desk-(left|right)-(front|rear)\.png$/.exec(path);
  if (!m) return "left-front";
  return `${m[1]}-${m[2]}` as DeskSpriteKind;
}

/**
 * Build the desk/seat pool from the persisted layout overrides + inserts.
 * Order is deterministic (operator: visible desks fill first): the
 * operator-inserted desks first (in insertion order), then the authored
 * base anchors (skipping hidden ones). Base anchors have no furniture in
 * normal view; they are bare standing spots at the arranged positions.
 */
/**
 * Two seats closer than this are the same physical desk. Issue 714 follow-up
 * (operator: "not 2 at the same desk unless all desks are full"): layouts
 * sometimes place an inserted desk on top of an authored anchor, which used
 * to seat two agents at one visible desk.
 */
const SEAT_DEDUPE_DIST = 40;

export function buildDeskSeats(
  overrides: Record<string, EntityOverride>,
  inserted: readonly InsertedSprite[],
): DeskSeat[] {
  const placed: DeskSeat[] = [];
  for (const e of inserted) {
    if (!isDeskSpritePath(e.spritePath)) continue;
    const seat: DeskSeat = {
      id: e.id,
      x: e.x,
      // Issue 714 follow-up: keep the whole character (seat + forward offset)
      // on the carpet - the desk moves with it, the pair never separates.
      y: clampDeskSeatY(e.x, e.y),
      kind: deskKindFromPath(e.spritePath),
      base: false,
      desk: true,
    };
    // An inserted desk dropped on top of an existing seat is not a second
    // seat: the operator's visible desk wins, no agent doubles up there.
    if (
      placed.some((s) => Math.hypot(s.x - seat.x, s.y - seat.y) < SEAT_DEDUPE_DIST)
    ) {
      continue;
    }
    placed.push(seat);
  }

  const anchors: DeskSeat[] = [];
  for (let i = 0; i < DESK_SPOTS.length; i++) {
    const id = `desk-${i + 1}`;
    if (overrides[id]?.hidden) continue; // operator removed this workstation
    const spot = DESK_SPOTS[i];
    const paired = DESKS[SEAT_TO_DESK_INDEX[i]] ?? DESKS[i] ?? DESKS[0];
    const ov = overrides[id];
    const x = ov?.x ?? spot.position.x;
    const seat: DeskSeat = {
      id,
      x,
      y: clampDeskSeatY(x, ov?.y ?? spot.position.y),
      kind: paired.kind,
      base: true,
      desk: true,
    };
    // Authored anchors coinciding with an operator desk are not extra seats
    // (authored desks do not render in normal view - the operator desk is the
    // visible furniture and wins).
    if (
      [...placed, ...anchors].some(
        (s) => Math.hypot(s.x - seat.x, s.y - seat.y) < SEAT_DEDUPE_DIST,
      )
    ) {
      continue;
    }
    anchors.push(seat);
  }

  return [...placed, ...anchors];
}

/** Standing overflow spots as seats (static; not layout-driven). */
const OVERFLOW_SEATS: DeskSeat[] = OVERFLOW_SPOTS.map((p, i) => {
  // Issue 714 follow-up: standing feet stay on the carpet too.
  const feet = clampFeetToFloor(p);
  return {
    id: `overflow-${i + 1}`,
    x: feet.x,
    y: feet.y,
    kind: "left-front",
    base: false,
    desk: false,
  };
});

/** How many standing overflow spots exist (issue 360). */
export function overflowSeatCount(): number {
  return OVERFLOW_SEATS.length;
}

/** The authored desks as a baseline pool (no overrides). */
const DEFAULT_SEATS: DeskSeat[] = buildDeskSeats({}, []);

let snapshot: DeskSeat[] = DEFAULT_SEATS;

/** Publish the current seat pool for non-React callers (movement engine). */
export function setDeskSeatSnapshot(seats: DeskSeat[]): void {
  if (seats.length > 0) snapshot = seats;
}

/** Number of desk seats currently on the floor (never grows with arrivals). */
export function deskSeatCount(): number {
  return snapshot.length || DEFAULT_SEATS.length;
}

/**
 * The seat for seat number n (1-based). Numbers past the pool resolve to the
 * standing overflow spots (cycling), so an arrival never needs a new desk.
 */
export function getDeskSeat(n: number): DeskSeat {
  const pool = snapshot.length ? snapshot : DEFAULT_SEATS;
  const idx = Math.trunc(n) - 1;
  if (idx < 0) {
    return pool[((idx % pool.length) + pool.length) % pool.length];
  }
  if (idx < pool.length) return pool[idx];
  const oi =
    ((idx - pool.length) % OVERFLOW_SEATS.length + OVERFLOW_SEATS.length) %
    OVERFLOW_SEATS.length;
  return OVERFLOW_SEATS[oi];
}

export interface SeatAssignmentAgent {
  id: string;
  name?: string | null;
  desk?: number | null;
}

/**
 * Issue 714 follow-up (operator: "make sure agents do not overlap even when
 * working at same desk if possible"): when more agents are on the floor than
 * there are seats, the assignment shares a seat - fan the sharers sideways so
 * no two sprites draw on top of each other. 56px keeps the ~53px-wide
 * characters clear of one another.
 */
export const SHARE_OFFSET_SPACING = 56;

/** Lateral offset per agent for seats shared by more than one agent. */
export function computeShareOffsets(
  assignments: ReadonlyMap<string, number>,
): Map<string, { x: number; y: number }> {
  const bySeat = new Map<number, string[]>();
  for (const [id, seat] of assignments) {
    const list = bySeat.get(seat);
    if (list) list.push(id);
    else bySeat.set(seat, [id]);
  }
  const offsets = new Map<string, { x: number; y: number }>();
  for (const ids of bySeat.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id, i) => {
      const dx = (i - (ids.length - 1) / 2) * SHARE_OFFSET_SPACING;
      offsets.set(id, { x: dx, y: 0 });
    });
  }
  return offsets;
}

/**
 * Most agents that may stand on one seat (operator: "max 2 at any one desk").
 * A second agent sits down only once every seat already holds one.
 */
export const MAX_AGENTS_PER_SEAT = 2;

/**
 * Assign each non-pinned agent a seat number (1-based), in this order
 * (issue 714 follow-up 3; operator: empty desks first, Bandi / pool-table
 * spots next, never more than two agents on one seat):
 *
 *  1. keep a valid backend seat when it is a real visible desk and EMPTY;
 *  2. take the lowest EMPTY seat: pool desks first, then the overflow spots
 *     (the first of which stands beside Bandi the cat and the pool table);
 *  3. only when every seat already holds one agent, add a second agent to the
 *     lowest seat that holds fewer than MAX_AGENTS_PER_SEAT (desks first);
 *  4. when no seat can take another agent, the agent gets no seat at all, so
 *     it is not drawn rather than stacked on someone.
 *
 * Pinned identities never take a pool or overflow seat. Duplicate ids are
 * placed once. Seats are never extended, so an arrival cannot create a desk.
 */
export function assignDeskSeats(
  agents: readonly SeatAssignmentAgent[],
  pinnedNames: ReadonlySet<string>,
  seatCount: number,
  overflowCount: number = 0,
  /**
   * How many of the leading pool seats are VISIBLE desks (operator-inserted
   * furniture). Issue 714 follow-up (operator: "new agents should go to empty
   * desks"): a free visible desk must be taken before an invisible authored
   * anchor seat, so a new arrival never stands at bare floor while an empty
   * desk the operator can see sits there.
   */
  visibleSeatCount: number = seatCount,
): Map<string, number> {
  const total = seatCount + overflowCount;
  const map = new Map<string, number>();
  if (total <= 0) return map;
  // Agents currently holding each seat number (1..total).
  const load = new Map<number, number>();
  const seatLoad = (n: number): number => load.get(n) ?? 0;
  const place = (id: string, n: number): void => {
    map.set(id, n);
    load.set(n, seatLoad(n) + 1);
  };
  const isPinned = (a: SeatAssignmentAgent): boolean =>
    Boolean(a.name && pinnedNames.has(a.name));
  // Visible desks first, then the invisible anchors, then the overflow spots.
  const firstEmpty = (): number | null => {
    for (let n = 1; n <= total; n++) if (seatLoad(n) === 0) return n;
    return null;
  };
  const firstWithRoom = (): number | null => {
    for (let n = 1; n <= total; n++) {
      if (seatLoad(n) > 0 && seatLoad(n) < MAX_AGENTS_PER_SEAT) return n;
    }
    return null;
  };
  // Duplicate ids are placed once (the first occurrence wins).
  const seen = new Set<string>();
  const candidates = agents.filter((a) => {
    if (isPinned(a) || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  // 1. Keep a valid backend seat that is a real visible desk and still empty.
  for (const a of candidates) {
    if (
      a.desk &&
      a.desk >= 1 &&
      a.desk <= Math.min(seatCount, visibleSeatCount) &&
      seatLoad(a.desk) === 0
    ) {
      place(a.id, a.desk);
    }
  }
  // 2. Everyone else takes an EMPTY seat, in order.
  for (const a of candidates) {
    if (map.has(a.id)) continue;
    const empty = firstEmpty();
    if (empty !== null) place(a.id, empty);
  }
  // 3. Every seat already holds one agent: double up, but never past two.
  for (const a of candidates) {
    if (map.has(a.id)) continue;
    const room = firstWithRoom();
    if (room !== null) place(a.id, room);
    // 4. Otherwise no seat can take another agent: leave it unseated.
  }
  return map;
}

/** Reactive seat pool — re-derives whenever the layout changes. */
export function useDeskSeats(): DeskSeat[] {
  const overrides = useOfficeEditStore((s) => s.overrides);
  const inserted = useOfficeEditStore((s) => s.insertedEntities);
  return useMemo(() => buildDeskSeats(overrides, inserted), [overrides, inserted]);
}
