/**
 * OfficeBackground Component
 *
 * W17ant Office theme (issue 212): renders the real Dunder Mifflin room art
 * (day/night by wall-clock) stretched to the canvas, letterboxed with the
 * theme wall color. Falls back to the legacy procedural floor while the art
 * loads or if it is missing.
 */

import { type ReactNode, useMemo, useCallback } from "react";
import { Graphics } from "pixi.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";
import { ORCHESTRA_PALETTE } from "@/themes/orchestra-office";
import { usePixiTexture } from "@/hooks/usePixiTexture";
import { getRoomImage } from "@/themes/w17ant-cast";
import { coMark } from "@/utils/coMark";

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

// DM room art native size (1200×896) mapped to full canvas
const ART_ASPECT = 1200 / 896;

interface OfficeBackgroundProps {
  floorTileTexture?: import("pixi.js").Texture | null;
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
 * Draws the legacy walls + floor (fallback behind/instead of room art).
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
}

// ============================================================================
// COMPONENT
// ============================================================================

export function OfficeBackground({
  floorTileTexture,
}: OfficeBackgroundProps): ReactNode {
  coMark("bg");
  const roomUrl = useMemo(() => getRoomImage(), []);
  const roomTexture = usePixiTexture(roomUrl);

  // Generate tile positions with alternating rotations and tints (fallback)
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

  // Room-art geometry: fill the canvas, preserving aspect (slight crop OK)
  const artGeom = useMemo(() => {
    const byHeight = CANVAS_HEIGHT * ART_ASPECT;
    if (byHeight >= CANVAS_WIDTH) {
      const w = byHeight;
      return { x: (CANVAS_WIDTH - w) / 2, y: 0, w, h: CANVAS_HEIGHT };
    }
    const h = CANVAS_WIDTH / ART_ASPECT;
    return { x: 0, y: (CANVAS_HEIGHT - h) / 2, w: CANVAS_WIDTH, h };
  }, []);

  return (
    <>
      {/* Walls and floor background (also the letterbox behind art) */}
      <pixiGraphics draw={drawWallsCallback} />

      {roomTexture ? (
        /* The real Dunder Mifflin floor art */
        <pixiSprite
          texture={roomTexture}
          x={artGeom.x}
          y={artGeom.y}
          width={artGeom.w}
          height={artGeom.h}
        />
      ) : (
        <>
          {/* Fallback: procedural floor tiles while art loads */}
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
      )}
    </>
  );
}
