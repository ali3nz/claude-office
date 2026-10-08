import { describe, it, expect } from "vitest";
import {
  assignDeskSeats,
  buildDeskSeats,
  deskKindFromPath,
  getDeskSeat,
  isDeskSpritePath,
  overflowSeatCount,
  setDeskSeatSnapshot,
} from "./deskSeats";
import { DESK_SPOTS, OVERFLOW_SPOTS } from "@/themes/w17ant-spots";
import type { InsertedSprite } from "@/stores/officeEditStore";

const standingDesk = (
  id: string,
  x: number,
  y: number,
  variant = "standing-desk-left-front",
): InsertedSprite => ({
  id,
  spritePath: `/sprites/furniture/${variant}.png`,
  name: "Standing Desk",
  x,
  y,
  turn: 0,
});

describe("deskSeats — layout-driven desk pool", () => {
  it("recognises only standing-desk sprite paths", () => {
    expect(isDeskSpritePath("/sprites/furniture/standing-desk-left-front.png")).toBe(true);
    expect(isDeskSpritePath("/sprites/furniture/standing-desk-right-rear.png")).toBe(true);
    expect(isDeskSpritePath("/sprites/rubber-duck.png")).toBe(false);
    expect(isDeskSpritePath("/sprites/decoration/monstera-plant.png")).toBe(false);
  });

  it("maps a standing-desk path to its facing kind", () => {
    expect(deskKindFromPath("/sprites/furniture/standing-desk-left-front.png")).toBe("left-front");
    expect(deskKindFromPath("/sprites/furniture/standing-desk-right-rear.png")).toBe("right-rear");
  });

  it("drops hidden desks and honours moved desk positions", () => {
    const seats = buildDeskSeats(
      { "desk-5": { hidden: true }, "desk-3": { x: 259, y: 748 } },
      [],
    );
    expect(seats.filter((s) => s.base)).toHaveLength(DESK_SPOTS.length - 1);
    expect(seats.some((s) => s.id === "desk-5")).toBe(false);
    const moved = seats.find((s) => s.id === "desk-3");
    expect(moved?.x).toBe(259);
    expect(moved?.y).toBe(748);
    expect(seats.every((s) => s.desk)).toBe(true);
  });

  it("turns operator-inserted standing desks into extra seats", () => {
    const seats = buildDeskSeats({}, [
      standingDesk("inserted-1", 913, 826, "standing-desk-right-front"),
      { id: "inserted-2", spritePath: "/sprites/rubber-duck.png", name: "Duck", x: 10, y: 20, turn: 0 },
    ]);
    const extras = seats.filter((s) => !s.base);
    expect(extras).toHaveLength(1);
    expect(extras[0].id).toBe("inserted-1");
    expect(extras[0].kind).toBe("right-front");
    expect(extras[0].x).toBe(913);
  });

  it("resolves seats past the pool to the standing overflow spots", () => {
    const seats = buildDeskSeats({}, [standingDesk("inserted-a", 100, 200)]);
    setDeskSeatSnapshot(seats);
    const n = seats.length;
    expect(overflowSeatCount()).toBe(OVERFLOW_SPOTS.length);
    const over = getDeskSeat(n + 1);
    expect(over.desk).toBe(false);
    expect(over.id).toBe("overflow-1");
    expect(over.x).toBe(OVERFLOW_SPOTS[0].x);
    // Overflow cycles instead of inventing seats.
    expect(getDeskSeat(n + overflowSeatCount() + 1).id).toBe("overflow-1");
  });
});

describe("assignDeskSeats", () => {
  const PINNED = new Set(["Sol Docker", "Sol Webserver", "GhostReporting"]);

  it("never lets a pinned identity take a pool seat", () => {
    const map = assignDeskSeats(
      [
        { id: "gateway-dockerhost", name: "Sol Docker" },
        { id: "w1", name: "Worker 1" },
      ],
      PINNED,
      3,
      2,
    );
    expect(map.has("gateway-dockerhost")).toBe(false);
    expect(map.get("w1")).toBe(1);
  });

  it("fills desks first, then overflow — never a new desk", () => {
    const agents = Array.from({ length: 6 }, (_, i) => ({
      id: `w${i + 1}`,
      name: `Worker ${i + 1}`,
    }));
    const map = assignDeskSeats(agents, PINNED, 3, 2);
    // 3 pool seats then 2 overflow spots, then the 6th shares overflow-1.
    expect([...map.values()].slice(0, 3)).toEqual([1, 2, 3]);
    expect(map.get("w4")).toBe(4);
    expect(map.get("w5")).toBe(5);
    expect(map.get("w6")).toBe(4);
    for (const n of map.values()) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("keeps a valid backend seat when it is free", () => {
    const map = assignDeskSeats(
      [
        { id: "a", name: "A", desk: 7 },
        { id: "b", name: "B" },
      ],
      PINNED,
      10,
      6,
    );
    expect(map.get("a")).toBe(7);
  });
});
