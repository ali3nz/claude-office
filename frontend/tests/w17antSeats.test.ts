/**
 * W17ant seat reachability (issue 212, Sol acceptance test).
 *
 * Every art-mapped desk seat (DESK_SPOTS) and the boss anchor (BOSS_SPOT)
 * must be a walkable destination reachable on foot from the elevator spawn.
 * This pins the getDeskPosition remap + nav-grid obstacle redesign: a seat
 * tile blocked by its own desk obstacle would strand arriving agents.
 */

import { describe, expect, it } from "vitest";
import { findWorldPath } from "@/systems/astar";
import {
  getNavigationGrid,
} from "@/systems/navigationGrid";
import { ELEVATOR_SPAWN_POSITIONS } from "@/systems/queuePositions";
import { DESK_SPOTS, BOSS_SPOT } from "@/themes/w17ant-spots";

describe("W17ant seat reachability (issue 212)", () => {
  const grid = getNavigationGrid();
  const spawn = ELEVATOR_SPAWN_POSITIONS[0];

  it("elevator spawn itself is walkable", () => {
    const g = grid.worldToGrid(spawn.x, spawn.y);
    expect(grid.isWalkable(g.gx, g.gy)).toBe(true);
  });

  DESK_SPOTS.forEach((spot, i) => {
    it(`desk spot ${i + 1} at (${Math.round(spot.position.x)},${Math.round(spot.position.y)}) is walkable and reachable`, () => {
      const g = grid.worldToGrid(spot.position.x, spot.position.y);
      expect(grid.isWalkable(g.gx, g.gy)).toBe(true);
      const path = findWorldPath(spawn, spot.position);
      expect(path.length).toBeGreaterThan(0);
    });
  });

  it("boss anchor is walkable and reachable", () => {
    const g = grid.worldToGrid(BOSS_SPOT.position.x, BOSS_SPOT.position.y);
    expect(grid.isWalkable(g.gx, g.gy)).toBe(true);
    const path = findWorldPath(spawn, BOSS_SPOT.position);
    expect(path.length).toBeGreaterThan(0);
  });
});
