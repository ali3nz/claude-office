import { describe, it, expect } from "vitest";
import {
  MAX_AGENTS_PER_SEAT,
  assignDeskSeats,
  buildDeskSeats,
  deskKindFromPath,
  getDeskSeat,
  isDeskSpritePath,
  overflowSeatCount,
  setDeskSeatSnapshot,
} from "./deskSeats";
import { clampDeskSeatY } from "./floorRegion";
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
    // Issue 714 follow-up: a seat whose occupant would fall off the carpet is
    // clamped up (desk + character keep their 40px relationship on the floor).
    expect(moved?.y).toBe(clampDeskSeatY(259, 748));
    expect(moved?.y).toBeLessThanOrEqual(748);
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

  it("fills placed desks before bare base anchors", () => {
    const seats = buildDeskSeats({}, [standingDesk("inserted-1", 913, 826)]);
    expect(seats[0].id).toBe("inserted-1");
    expect(seats[0].desk).toBe(true);
    expect(seats.slice(1).every((s) => s.base)).toBe(true);
  });
});

describe("assignDeskSeats", () => {
  const PINNED = new Set(["Sol Docker", "Sol Webserver", "Ghost Protocol"]);

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

  it("fills every empty seat before doubling up, then never a new desk", () => {
    const agents = Array.from({ length: 6 }, (_, i) => ({
      id: `w${i + 1}`,
      name: `Worker ${i + 1}`,
    }));
    const map = assignDeskSeats(agents, PINNED, 3, 2);
    // 3 desks then 2 spots each take one agent (w1..w5 on seats 1..5); the
    // sixth agent doubles up on the first desk, never on a new seat.
    expect(map.get("w1")).toBe(1);
    expect(map.get("w2")).toBe(2);
    expect(map.get("w3")).toBe(3);
    expect(map.get("w4")).toBe(4);
    expect(map.get("w5")).toBe(5);
    expect(map.get("w6")).toBe(1);
    for (const n of map.values()) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("never seats more than MAX_AGENTS_PER_SEAT agents on one seat", () => {
    const agents = Array.from({ length: 22 }, (_, i) => ({
      id: `w${i + 1}`,
      name: `Worker ${i + 1}`,
    }));
    const map = assignDeskSeats(agents, PINNED, 5, 6);
    const load = new Map<number, number>();
    for (const n of map.values()) load.set(n, (load.get(n) ?? 0) + 1);
    expect(map.size).toBe(22);
    for (const count of load.values()) {
      expect(count).toBeLessThanOrEqual(MAX_AGENTS_PER_SEAT);
    }
  });

  it("leaves extra agents unseated once every seat holds two", () => {
    const agents = Array.from({ length: 25 }, (_, i) => ({
      id: `w${i + 1}`,
      name: `Worker ${i + 1}`,
    }));
    const map = assignDeskSeats(agents, PINNED, 5, 6);
    // 11 seats x 2 = 22 seated; the last 3 get no seat and are not drawn.
    expect(map.size).toBe(22);
    expect(map.has("w23")).toBe(false);
    expect(map.has("w24")).toBe(false);
    expect(map.has("w25")).toBe(false);
  });

  it("places duplicate ids once", () => {
    const map = assignDeskSeats(
      [
        { id: "same", name: "A" },
        { id: "same", name: "A again" },
        { id: "other", name: "B" },
      ],
      PINNED,
      3,
      0,
    );
    expect(map.size).toBe(2);
    expect(map.get("same")).toBe(1);
    expect(map.get("other")).toBe(2);
  });

  it("gives an empty visible desk to a new arrival before an invisible anchor", () => {
    // desk 3 is an invisible anchor here (only desk 1 is visible), so it must
    // not be kept: the arrival takes the empty visible desk 1 instead.
    const map = assignDeskSeats(
      [{ id: "n", name: "New one", desk: 3 }],
      PINNED,
      3,
      0,
      1,
    );
    expect(map.get("n")).toBe(1);
  });

  it("reuses a departing agent's desk for the next arrival", () => {
    const first = assignDeskSeats([{ id: "departing", name: "Departing" }], PINNED, 2);
    expect(first.get("departing")).toBe(1);

    const afterDeparture = assignDeskSeats([{ id: "arrival", name: "Arrival" }], PINNED, 2);
    expect(afterDeparture.get("arrival")).toBe(1);
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
