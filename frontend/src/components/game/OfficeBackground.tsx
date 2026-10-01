/**
 * OfficeBackground Component
 *
 * Renders the office floor, walls, and tile pattern using sprites.
 */

import { type ReactNode, useMemo, useCallback } from "react";
import { Graphics, Texture } from "pixi.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";
import { ORCHESTRA_PALETTE } from "@/themes/orchestra-office";

// ============================================================================
// CONSTANTS
// ============================================================================

// Floor/wall dimensions
const WALL_HEIGHT = 250;
const WALL_TRIM_HEIGHT = 10;
const FLOOR_TILE_SIZE = 100;

// Colors (Orchestra Office theme — W17ant-inspired warm palette)
const FLOOR_COLOR = ORCHESTRA_PALETTE.floor;
const WALL_COLOR = ORCHESTRA_PALETTE.wall;
const WALL_TRIM_COLOR = ORCHESTRA_PALETTE.wallTrim;
const FLOOR_TILE_DARK = ORCHESTRA_PALETTE.floorTileDark;
const DESK_WOOD = ORCHESTRA_PALETTE.deskWood;
const DESK_WOOD_LIGHT = ORCHESTRA_PALETTE.deskWoodLight;
const GLOW_WARM = ORCHESTRA_PALETTE.glowWarm;
const GLOW_WARM_ALPHA = ORCHESTRA_PALETTE.glowWarmAlpha;
const GLOW_MONITOR = ORCHESTRA_PALETTE.glowMonitor;
const GLOW_MONITOR_ALPHA = ORCHESTRA_PALETTE.glowMonitorAlpha;

// Desk band depth along the wall (W17ant-style furniture strip)
const DESK_BAND_HEIGHT = 22;
// Spacing of monitor glow patches across the desk band
const MONITOR_GLOW_SPACING = 320;
const MONITOR_GLOW_WIDTH = 84;

// ============================================================================
// TYPES
// ============================================================================

interface OfficeBackgroundProps {
  floorTileTexture?: Texture | null;
}

interface TileData {
  x: number;
  y: number;
  rotation: number;
  tint: number;
}

// Tint colors for checkerboard effect (warm darkening, not gray)
const TILE_TINT_LIGHT = 0xffffff; // No tint
const TILE_TINT_DARK = FLOOR_TILE_DARK;

// ============================================================================
// DRAWING FUNCTION
// ============================================================================

/**
 * Draws the office walls (no floor - that's handled by sprites).
 */
function drawWalls(g: Graphics): void {
  g.clear();

  // Main floor background (fallback color behind tiles)
  g.rect(0, WALL_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT - WALL_HEIGHT);
  g.fill(FLOOR_COLOR);

  // Wall
  g.rect(0, 0, CANVAS_WIDTH, WALL_HEIGHT);
  g.fill(WALL_COLOR);

  // Wall base trim
  g.rect(0, WALL_HEIGHT - WALL_TRIM_HEIGHT, CANVAS_WIDTH, WALL_TRIM_HEIGHT);
  g.fill(WALL_TRIM_COLOR);

  // Desk band along the wall (W17ant desk-wood strip with top highlight)
  g.rect(0, WALL_HEIGHT, CANVAS_WIDTH, DESK_BAND_HEIGHT);
  g.fill(DESK_WOOD);
  g.rect(0, WALL_HEIGHT, CANVAS_WIDTH, 4);
  g.fill(DESK_WOOD_LIGHT);

  // Warm lamp glow pooling over the desk band
  g.rect(0, WALL_HEIGHT - 28, CANVAS_WIDTH, DESK_BAND_HEIGHT + 46);
  g.fill({ color: GLOW_WARM, alpha: GLOW_WARM_ALPHA });

  // Cool monitor glow patches along the desk band
  for (
    let x = MONITOR_GLOW_SPACING / 2;
    x < CANVAS_WIDTH;
    x += MONITOR_GLOW_SPACING
  ) {
    g.rect(x - MONITOR_GLOW_WIDTH / 2, WALL_HEIGHT + 2, MONITOR_GLOW_WIDTH, 10);
    g.fill({ color: GLOW_MONITOR, alpha: GLOW_MONITOR_ALPHA });
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function OfficeBackground({
  floorTileTexture,
}: OfficeBackgroundProps): ReactNode {
  // Generate tile positions with alternating rotations and tints
  const tiles = useMemo(() => {
    const result: TileData[] = [];
    const startY = WALL_HEIGHT;

    for (let y = startY; y < CANVAS_HEIGHT; y += FLOOR_TILE_SIZE) {
      const rowIndex = Math.floor((y - startY) / FLOOR_TILE_SIZE);
      for (let x = 0; x < CANVAS_WIDTH; x += FLOOR_TILE_SIZE) {
        const colIndex = Math.floor(x / FLOOR_TILE_SIZE);
        // Checkerboard pattern: alternate rotation based on row + column
        const isAlternate = (rowIndex + colIndex) % 2 === 1;
        result.push({
          x: x + FLOOR_TILE_SIZE / 2,
          y: y + FLOOR_TILE_SIZE / 2,
          rotation: isAlternate ? Math.PI / 2 : 0,
          tint: isAlternate ? TILE_TINT_DARK : TILE_TINT_LIGHT,
        });
      }
    }
    return result;
  }, []);

  // Stable reference for wall drawing
  const drawWallsCallback = useCallback((g: Graphics) => drawWalls(g), []);

  return (
    <>
      {/* Walls and floor background */}
      <pixiGraphics draw={drawWallsCallback} />

      {/* Floor tiles with alternating rotations and tints */}
      {floorTileTexture &&
        tiles.map((tile, index) => (
          <pixiSprite
            key={index}
            texture={floorTileTexture}
            x={tile.x}
            y={tile.y}
            anchor={0.5}
            rotation={tile.rotation}
            tint={tile.tint}
          />
        ))}
    </>
  );
}
