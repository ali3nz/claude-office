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
export function buildDeskSeats(
  overrides: Record<string, EntityOverride>,
  inserted: readonly InsertedSprite[],
): DeskSeat[] {
  const placed: DeskSeat[] = [];
  for (const e of inserted) {
    if (!isDeskSpritePath(e.spritePath)) continue;
    placed.push({
      id: e.id,
      x: e.x,
      y: e.y,
      kind: deskKindFromPath(e.spritePath),
      base: false,
      desk: true,
    });
  }

  const anchors: DeskSeat[] = [];
  for (let i = 0; i < DESK_SPOTS.length; i++) {
    const id = `desk-${i + 1}`;
    if (overrides[id]?.hidden) continue; // operator removed this workstation
    const spot = DESK_SPOTS[i];
    const paired = DESKS[SEAT_TO_DESK_INDEX[i]] ?? DESKS[i] ?? DESKS[0];
    const ov = overrides[id];
    anchors.push({
      id,
      x: ov?.x ?? spot.position.x,
      y: ov?.y ?? spot.position.y,
      kind: paired.kind,
      base: true,
      desk: true,
    });
  }

  return [...placed, ...anchors];
}

/** Standing overflow spots as seats (static; not layout-driven). */
const OVERFLOW_SEATS: DeskSeat[] = OVERFLOW_SPOTS.map((p, i) => ({
  id: `overflow-${i + 1}`,
  x: p.x,
  y: p.y,
  kind: "left-front",
  base: false,
  desk: false,
}));

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
 * Assign each non-pinned agent a seat number (1-based).
 *
 * An agent keeps its backend seat when it is valid and free; otherwise it
 * takes the lowest free pool seat, then the lowest free overflow spot, and
 * only once those are full does it share an overflow spot (cycling). Pool
 * seats are never extended, so an arrival can never spawn a brand-new desk,
 * and pool desks are never doubled up. Pinned identities never receive a
 * pool or overflow seat.
 */
export function assignDeskSeats(
  agents: readonly SeatAssignmentAgent[],
  pinnedNames: ReadonlySet<string>,
  seatCount: number,
  overflowCount: number = 0,
): Map<string, number> {
  const total = seatCount + overflowCount;
  const map = new Map<string, number>();
  if (total <= 0) return map;
  const used = new Set<number>();
  const freeIn = (from: number, to: number): number | null => {
    for (let n = from; n <= to; n++) if (!used.has(n)) return n;
    return null;
  };
  for (const a of agents) {
    if (a.name && pinnedNames.has(a.name)) continue;
    if (a.desk && a.desk >= 1 && a.desk <= total && !used.has(a.desk)) {
      used.add(a.desk);
      map.set(a.id, a.desk);
    }
  }
  let reuse = 0;
  for (const a of agents) {
    if (map.has(a.id) || (a.name && pinnedNames.has(a.name))) continue;
    const n =
      freeIn(1, seatCount) ??
      (overflowCount > 0 ? freeIn(seatCount + 1, total) : null) ??
      (overflowCount > 0
        ? seatCount + 1 + (reuse++ % overflowCount)
        : (reuse++ % seatCount) + 1);
    used.add(n);
    map.set(a.id, n);
  }
  return map;
}

/** Reactive seat pool — re-derives whenever the layout changes. */
export function useDeskSeats(): DeskSeat[] {
  const overrides = useOfficeEditStore((s) => s.overrides);
  const inserted = useOfficeEditStore((s) => s.insertedEntities);
  return useMemo(() => buildDeskSeats(overrides, inserted), [overrides, inserted]);
}
