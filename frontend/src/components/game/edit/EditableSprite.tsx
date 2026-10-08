"use client";

/**
 * EditableSprite Component (issue 246)
 *
 * Provides edit mode capabilities (select, drag & drop, rotate) for any sprite
 * or container on the office floor.
 * Consumes the override layer from useOfficeEditStore.
 * Renders selection affordance and handles window-level drag tracking.
 */

import { type ReactNode } from "react";
import { type Texture } from "pixi.js";
import {
  useOfficeEditStore,
  clampEntityScale,
  clampEntityTilt,
} from "@/stores/officeEditStore";
import { useEditDrag } from "./useEditDrag";

export interface EditableSpriteProps {
  id: string;
  name?: string;
  defaultX: number;
  defaultY: number;
  /** Mirror horizontally (facing change for sprites without facing variants). */
  flip?: boolean;
  width: number;
  height: number;
  zBias?: number;
  texture?: Texture | null;
  /** Custom children to render inside the transformed container */
  children?: ReactNode;
}

export function EditableSprite({
  id,
  defaultX,
  defaultY,
  flip = false,
  width,
  height,
  zBias = 0,
  texture,
  children,
}: EditableSpriteProps): ReactNode {
  const isEditMode = useOfficeEditStore((s) => s.isEditMode);
  const selectedEntityId = useOfficeEditStore((s) => s.selectedEntityId);
  const override = useOfficeEditStore((s) => s.overrides[id]);

  const isSelected = isEditMode && selectedEntityId === id;

  // Position from override layer or defaults
  const x = override?.x ?? defaultX;
  const y = override?.y ?? defaultY;

  // Operator size + wall-matching slant (issue 361). Inserted entities carry
  // their own values; built-ins read the override layer.
  const insertedScale = useOfficeEditStore(
    (s) => s.insertedEntities.find((e) => e.id === id)?.scale,
  );
  const insertedTilt = useOfficeEditStore(
    (s) => s.insertedEntities.find((e) => e.id === id)?.tilt,
  );
  const scale = clampEntityScale(insertedScale ?? override?.scale ?? 1);
  const tiltDeg = clampEntityTilt(insertedTilt ?? override?.tilt ?? 0);
  const skewX = Math.tan((tiltDeg * Math.PI) / 180);

  const { onPointerDown, isDragging } = useEditDrag(id, x, y);

  const zIndex = y + zBias;

  // Deleted by the operator (Reset restores) - hooks above stay unconditional.
  if (override?.hidden) return null;

  // Selection box padding (follows the operator size)
  const pad = 6;
  const scaledW = width * scale;
  const scaledH = height * scale;
  const halfW = scaledW / 2;

  return (
    <pixiContainer
      x={x}
      y={y}
      zIndex={zIndex + (isSelected ? 50 : 0)}
      eventMode={isEditMode ? "static" : "auto"}
      cursor={isEditMode ? (isDragging ? "grabbing" : "grab") : "default"}
      onPointerDown={isEditMode ? onPointerDown : undefined}
    >
      {/* Inner container centered at sprite visual centre; flip mirrors
          the facing, scale applies the operator size, skew slants the image
          to match the isometric walls (issue 361) */}
      <pixiContainer
        x={0}
        y={-scaledH / 2}
        scale={{ x: flip ? -scale : scale, y: scale }}
        skew={{ x: skewX, y: 0 }}
      >
        {texture && (
          <pixiSprite
            texture={texture}
            anchor={0.5}
            x={0}
            y={0}
            width={width}
            height={height}
          />
        )}
        {children}

        {/* Selection Affordance Box */}
        {isSelected && (
          <pixiGraphics
            draw={(g) => {
              g.clear();
              const bx = -halfW - pad;
              const by = -scaledH / 2 - pad;
              const bw = scaledW + pad * 2;
              const bh = scaledH + pad * 2;

              // High-visibility cyan/sky selection border
              g.roundRect(bx, by, bw, bh, 3);
              g.stroke({ width: 2, color: 0x38bdf8, alpha: 0.95 });

              // Corner handles
              const sz = 6;
              const corners = [
                [bx - 1, by - 1],
                [bx + bw - sz + 1, by - 1],
                [bx - 1, by + bh - sz + 1],
                [bx + bw - sz + 1, by + bh - sz + 1],
              ];
              for (const [cx, cy] of corners) {
                g.rect(cx, cy, sz, sz);
                g.fill({ color: 0x38bdf8 });
              }
            }}
          />
        )}
      </pixiContainer>
    </pixiContainer>
  );
}

/** Operator size multiplier for an object (issue 361). */
export function useEntityScale(id: string, fallback = 1): number {
  return useOfficeEditStore((s) => {
    const inserted = s.insertedEntities.find((e) => e.id === id);
    return clampEntityScale(inserted?.scale ?? s.overrides[id]?.scale ?? fallback);
  });
}

/** Operator wall-matching slant in degrees for an object (issue 361). */
export function useEntityTilt(id: string, fallback = 0): number {
  return useOfficeEditStore((s) => {
    const inserted = s.insertedEntities.find((e) => e.id === id);
    return clampEntityTilt(inserted?.tilt ?? s.overrides[id]?.tilt ?? fallback);
  });
}

/** Facing steps the operator applied to an object (see systems/facingCycle). */
export function useEntityTurn(id: string, fallback = 0): number {
  return useOfficeEditStore((s) => {
    const inserted = s.insertedEntities.find((e) => e.id === id);
    return inserted?.turn ?? s.overrides[id]?.turn ?? fallback;
  });
}
