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
import { useOfficeEditStore } from "@/stores/officeEditStore";
import { useEditDrag } from "./useEditDrag";

export interface EditableSpriteProps {
  id: string;
  name?: string;
  defaultX: number;
  defaultY: number;
  defaultRotation?: number;
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
  defaultRotation = 0,
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

  // Position & rotation from override layer or defaults
  const x = override?.x ?? defaultX;
  const y = override?.y ?? defaultY;
  const rotation = override?.rotation ?? defaultRotation;

  const { onPointerDown, isDragging } = useEditDrag(id, x, y);

  const rotRad = (rotation * Math.PI) / 180;
  const zIndex = y + zBias;

  // Selection box padding
  const pad = 6;
  const halfW = width / 2;

  return (
    <pixiContainer
      x={x}
      y={y}
      zIndex={zIndex + (isSelected ? 50 : 0)}
      eventMode={isEditMode ? "static" : "auto"}
      cursor={isEditMode ? (isDragging ? "grabbing" : "grab") : "default"}
      onPointerDown={isEditMode ? onPointerDown : undefined}
    >
      {/* Rotatable inner container centered at sprite visual center (y - height/2) */}
      <pixiContainer
        x={0}
        y={-height / 2}
        rotation={rotRad}
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
              const by = -height / 2 - pad;
              const bw = width + pad * 2;
              const bh = height + pad * 2;

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
