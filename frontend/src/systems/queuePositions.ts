/**
 * Office Queue System
 *
 * Manages two queues:
 * 1. Arrival Queue: Agents report to boss (left side) before going to desk
 * 2. Departure Queue: Agents turn in work (right side) before leaving
 *
 * Each queue has predefined positions. The boss desk slot is the "head"
 * of each queue. Only one boss slot can be occupied at a time, with
 * the arrival (getting work) slot having priority.
 */

import { Position } from "@/types";
import { artToCanvas } from "@/themes/w17ant-spots";
import { getDeskSeat } from "@/systems/deskSeats";

// Boss desk positions (where agents stand IN FRONT of the desk)
// W17ant Office theme: boss is at the DM-art desk (≈962, 630 on canvas);
// slots flank the desk surface, clear of its obstacle rectangle.
export const BOSS_SLOT_LEFT: Position = { x: 842, y: 610 }; // Getting work (arrivals)
export const BOSS_SLOT_RIGHT: Position = { x: 1082, y: 610 }; // Receiving work (departures)

// Boss center position (for rendering)
// Desk visual: drawn 20px below boss with 80px height → desk center = boss_y + 60
// For desk center at y=960 (grid-aligned 30*32), boss is at y=900
export const BOSS_POSITION: Position = artToCanvas(0.735 * 1200, 0.615 * 896);

// Elevator position (DO NOT CHANGE - this is the elevator's fixed location)
export const ELEVATOR_POSITION: Position = { x: 86, y: 178 };

// Pathfinding target for agents walking to elevator (can be adjusted independently)
export const ELEVATOR_PATHFINDING_TARGET: Position = { x: 86, y: 192 };

// Position where departing agents stand inside elevator (after arriving)
export const ELEVATOR_DEPARTURE_POSITION: Position = { x: 86, y: 200 };

// Elevator spawn positions (2x3 grid inside elevator)
// Elevator interior: ~112x144px centered at x:86
export const ELEVATOR_SPAWN_POSITIONS: Position[] = [
  { x: 56, y: 190 }, // Top left
  { x: 116, y: 190 }, // Top right
  { x: 56, y: 240 }, // Middle left
  { x: 116, y: 240 }, // Middle right
  { x: 56, y: 290 }, // Bottom left
  { x: 116, y: 290 }, // Bottom right
];

// Track available spawn slots (rotates through positions)
let nextSpawnIndex = 0;

// Track which elevator positions are currently occupied (by agent ID)
const occupiedElevatorPositions: Map<number, string> = new Map();

/**
 * Get the next spawn position for a new agent, avoiding occupied positions.
 * Falls back to cycling if all positions are occupied.
 */
export function getNextSpawnPosition(): Position {
  // Try to find an unoccupied position
  for (let i = 0; i < ELEVATOR_SPAWN_POSITIONS.length; i++) {
    const index = (nextSpawnIndex + i) % ELEVATOR_SPAWN_POSITIONS.length;
    if (!occupiedElevatorPositions.has(index)) {
      nextSpawnIndex = index + 1;
      return ELEVATOR_SPAWN_POSITIONS[index];
    }
  }

  // All positions occupied - fall back to cycling (will cause overlap)
  const pos =
    ELEVATOR_SPAWN_POSITIONS[nextSpawnIndex % ELEVATOR_SPAWN_POSITIONS.length];
  nextSpawnIndex++;
  return pos;
}

/**
 * Reserve an elevator position for an agent (call when spawning)
 */
export function reserveElevatorPosition(
  agentId: string,
  position: Position,
): void {
  const index = ELEVATOR_SPAWN_POSITIONS.findIndex(
    (p) => p.x === position.x && p.y === position.y,
  );
  if (index !== -1) {
    occupiedElevatorPositions.set(index, agentId);
  }
}

/**
 * Release an elevator position (call when agent leaves elevator zone)
 */
export function releaseElevatorPosition(agentId: string): void {
  for (const [index, id] of occupiedElevatorPositions.entries()) {
    if (id === agentId) {
      occupiedElevatorPositions.delete(index);
      break;
    }
  }
}

/**
 * Reset spawn index and clear occupied positions (for session reset)
 */
export function resetSpawnIndex(): void {
  nextSpawnIndex = 0;
  occupiedElevatorPositions.clear();
}

// Elevator zone bounds for collision exclusion
export const ELEVATOR_ZONE = {
  minX: 30, // 86 - 56 (half interior width)
  maxX: 142, // 86 + 56
  minY: 90, // Top of elevator
  maxY: 300, // Floor level threshold (extended to include lower spawn positions)
};

/**
 * Check if a position is inside the elevator zone
 * Used to skip collision checks and hide agents
 */
export function isInElevatorZone(pos: Position): boolean {
  return (
    pos.x >= ELEVATOR_ZONE.minX &&
    pos.x <= ELEVATOR_ZONE.maxX &&
    pos.y >= ELEVATOR_ZONE.minY &&
    pos.y <= ELEVATOR_ZONE.maxY
  );
}

// Arrival queue positions (W17ant theme: line forms left of the DM boss desk,
// along the front of the main floor; clear of desk-spot obstacles).
export const ARRIVAL_QUEUE_POSITIONS: Position[] = [
  { x: 726, y: 588 }, // Position 0 (A0 - ready spot, left of boss desk)
  { x: 580, y: 588 }, // Position 1 (first waiting spot)
  { x: 434, y: 588 }, // Position 2
  { x: 288, y: 588 }, // Position 3
  { x: 180, y: 530 }, // Position 4
  { x: 180, y: 440 }, // Position 5
  { x: 180, y: 350 }, // Position 6
  { x: 180, y: 270 }, // Position 7
];

// Departure queue positions (W17ant theme: exits right of the DM boss desk,
// mirrored L-shape; clear of desk-spot obstacles).
export const DEPARTURE_QUEUE_POSITIONS: Position[] = [
  { x: 1198, y: 588 }, // Position 0 (D0 - ready spot, right of boss desk)
  { x: 1240, y: 700 }, // Position 1
  { x: 1240, y: 800 }, // Position 2
  { x: 1240, y: 900 }, // Position 3
  { x: 1100, y: 940 }, // Position 4
  { x: 940, y: 940 }, // Position 5
  { x: 780, y: 940 }, // Position 6
  { x: 640, y: 940 }, // Position 7
];

export type QueueType = "arrival" | "departure";

export interface QueueSlot {
  agentId: string;
  position: Position;
  queueIndex: number; // Index in queue (0 = front, waiting for boss)
}

/**
 * Get the queue positions for a given queue type
 */
export function getQueuePositions(type: QueueType): Position[] {
  return type === "arrival"
    ? ARRIVAL_QUEUE_POSITIONS
    : DEPARTURE_QUEUE_POSITIONS;
}

/**
 * Get the boss slot position for a given queue type
 */
export function getBossSlot(type: QueueType): Position {
  return type === "arrival" ? BOSS_SLOT_LEFT : BOSS_SLOT_RIGHT;
}

/**
 * Get position for an agent at a given index in the queue
 * Returns the boss slot if index is -1 (at boss desk)
 * Returns undefined if index exceeds available positions
 */
export function getQueuePosition(
  type: QueueType,
  index: number,
): Position | undefined {
  if (index < 0) {
    return getBossSlot(type);
  }
  const positions = getQueuePositions(type);
  if (index >= positions.length) {
    // Overflow - place beyond last position (110px vertical spacing)
    const lastPos = positions[positions.length - 1];
    const offset = (index - positions.length + 1) * 110;
    // Overflow goes upward (negative y)
    return { x: lastPos.x, y: lastPos.y - offset };
  }
  return positions[index];
}

/**
 * Calculate all agent positions for a queue given their IDs in order
 */
export function calculateQueueSlots(
  type: QueueType,
  agentIds: string[],
): QueueSlot[] {
  return agentIds.map((agentId, index) => ({
    agentId,
    position: getQueuePosition(type, index)!,
    queueIndex: index,
  }));
}

/**
 * Get desk position for a given desk number (1-indexed)
 * Returns the position where agent BOTTOM CIRCLE CENTER should be placed.
 * The bottom circle center is 22px above the feet, 18px below body center.
 * Must match DeskGrid rendering in OfficeGameV2.tsx
 * Grid-aligned: X at multiples of 32, row spacing 192 (6×32)
 */
export function getDeskPosition(deskNum: number): Position {
  // W17ant Office theme (issue 212): desks are the real DM-floor art spots.
  // Persistent desk layout: the seat position comes from the SAVED layout
  // (authored desks minus hidden ones + operator-inserted desks), cycled by
  // desk number. The position is the agent's sprite anchor (feet / bottom).
  const seat = getDeskSeat(deskNum);
  return { x: seat.x, y: seat.y };
}
