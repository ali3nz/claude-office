/**
 * Issue 714 follow-up (operator): (1) never two agents at one desk unless
 * every seat is taken, and (2) nobody renders partially off the floor.
 * These tests pin the seat pool (coincident-desk dedupe + floor clamp) and
 * the assignment rules.
 */
import { describe, expect, it } from "vitest";
import {
  assignDeskSeats,
  buildDeskSeats,
  computeShareOffsets,
  SHARE_OFFSET_SPACING,
} from "@/systems/deskSeats";
import {
  clampDeskSeatY,
  clampFeetToFloor,
  FLOOR_FOOT_MARGIN,
  floorEdgeY,
  STAND_DESK_FORWARD,
} from "@/systems/floorRegion";
import type { InsertedSprite } from "@/stores/officeEditStore";

const desk = (id: string, x: number, y: number): InsertedSprite => ({
  id,
  spritePath: "/sprites/furniture/standing-desk-left-front.png",
  name: id,
  x,
  y,
});

describe("floor region (issue 714 follow-up)", () => {
  it("clamps feet above the carpet edge", () => {
    const clamped = clampFeetToFloor({ x: 127, y: 9999 });
    expect(clamped.y).toBeLessThanOrEqual(floorEdgeY(127) - FLOOR_FOOT_MARGIN);
  });

  it("clamps a desk anchor so its occupant stays on the carpet", () => {
    const y = clampDeskSeatY(913, 9999);
    expect(y + STAND_DESK_FORWARD).toBeLessThanOrEqual(
      floorEdgeY(913) - FLOOR_FOOT_MARGIN,
    );
  });

  it("leaves positions already on the carpet untouched", () => {
    const p = { x: 640, y: 700 };
    expect(clampFeetToFloor(p)).toEqual(p);
  });
});

describe("seat pool (issue 714 follow-up)", () => {
  it("does not create a second seat for an inserted desk dropped on an authored anchor", () => {
    // Operator layout: desk-3 moved to (259,748), inserted desk at (254,745).
    const seats = buildDeskSeats({ "desk-3": { x: 259, y: 748 } }, [
      desk("ins-1", 254, 745),
    ]);
    // No two seats may be the same physical desk.
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        const d = Math.hypot(seats[i].x - seats[j].x, seats[i].y - seats[j].y);
        expect(d).toBeGreaterThanOrEqual(40);
      }
    }
    // The operator's visible desk is a seat; the coincident anchor is not.
    expect(seats.some((s) => s.id === "ins-1")).toBe(true);
    expect(seats.some((s) => s.id === "desk-3")).toBe(false);
  });

  it("clamps every pool seat so its occupant stays on the carpet", () => {
    const seats = buildDeskSeats({}, [desk("ins-2", 913, 826)]);
    expect(seats.length).toBeGreaterThan(0);
    for (const s of seats) {
      expect(s.y + STAND_DESK_FORWARD).toBeLessThanOrEqual(
        floorEdgeY(s.x) - FLOOR_FOOT_MARGIN + 0.001,
      );
    }
  });
});

describe("assignDeskSeats (issue 714 follow-up)", () => {
  const agents = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `a${i}`,
      name: null as string | null,
      desk: null as number | null,
    }));

  it("fills real desks first and never shares while a seat is free", () => {
    const map = assignDeskSeats(agents(3), new Set(), 2, 2);
    expect(new Set(map.values()).size).toBe(3);
  });

  it("shares only when every seat is taken", () => {
    const map = assignDeskSeats(agents(4), new Set(), 2, 1);
    const values = [...map.values()];
    expect(values).toHaveLength(4);
    expect(new Set(values).size).toBe(3); // 3 seats, 4 agents -> one share
  });

  it("does not keep a backend overflow seat while a real desk is free", () => {
    const map = assignDeskSeats(
      [
        { id: "a0", name: null, desk: 3 },
        { id: "a1", name: null, desk: null },
      ],
      new Set(),
      2,
      2,
    );
    expect(map.get("a0")).toBe(1); // re-seated on a real desk
    expect(map.get("a1")).toBe(2);
  });

  it("prefers a free VISIBLE desk over an invisible anchor seat", () => {
    // 3 seats, only the first 2 are visible operator desks; the agent claims
    // seat 3 (an invisible authored anchor).
    const map = assignDeskSeats(
      [{ id: "a0", name: null, desk: 3 }],
      new Set(),
      3,
      0,
      2,
    );
    expect(map.get("a0")).toBeLessThanOrEqual(2);
  });
});

describe("share offsets (issue 714 follow-up)", () => {
  const agents = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `a${i}`,
      name: null as string | null,
      desk: null as number | null,
    }));

  it("fans agents that share one seat so they never overlap", () => {
    const map = assignDeskSeats(agents(3), new Set(), 1, 1); // 2 seats, 3 agents
    const offsets = computeShareOffsets(map);
    expect(offsets.size).toBeGreaterThanOrEqual(2);
    const xs = [...offsets.values()].map((o) => o.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(
      SHARE_OFFSET_SPACING,
    );
  });

  it("gives agents with their own seat no offset", () => {
    const map = assignDeskSeats(agents(2), new Set(), 2, 0);
    expect(computeShareOffsets(map).size).toBe(0);
  });
});
