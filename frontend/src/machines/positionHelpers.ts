/**
 * Position Helpers
 *
 * Utility functions for calculating agent positions in the office:
 *   - Desk positions based on desk number
 *   - Elevator target positions
 *
 * Extracted from agentMachineService.ts for testability and reuse.
 */

import type { Position } from "@/types";
import {
  ARRIVAL_QUEUE_POSITIONS,
  DEPARTURE_QUEUE_POSITIONS,
  ELEVATOR_PATHFINDING_TARGET,
} from "@/systems/queuePositions";
import { getSpotForDesk } from "@/themes/w17ant-spots";

// ============================================================================
// DESK POSITION
// ============================================================================

/**
 * Calculate the pixel position for an agent seated at a given desk.
 *
 * W17ant Office theme (issue 212): desks are the real DM-floor art spots
 * (ported from W17ant rooms.ts), cycled by desk number. The position is the
 * agent's sprite anchor (feet / bottom-center).
 *
 * @param deskNum - 1-based desk number
 * @returns Pixel position for the agent's seat anchor
 */
export function getDeskPosition(deskNum: number): Position {
  return getSpotForDesk(deskNum).position;
}

// ============================================================================
// QUEUE / READY POSITION HELPERS
// ============================================================================

/**
 * Return the A0 / D0 position where agents stand when talking to the boss.
 *
 * @param queueType - Which queue the agent belongs to
 */
export function getReadyPosition(queueType: "arrival" | "departure"): Position {
  return queueType === "arrival"
    ? ARRIVAL_QUEUE_POSITIONS[0]
    : DEPARTURE_QUEUE_POSITIONS[0];
}

// ============================================================================
// ELEVATOR POSITION HELPERS
// ============================================================================

/**
 * Return the pathfinding target for agents walking to the elevator.
 *
 * This is the cell that the pathfinder navigates toward; the agent
 * snaps to the true departure position once inside the elevator.
 */
export function getElevatorPathTarget(): Position {
  return ELEVATOR_PATHFINDING_TARGET;
}
