"use client";

/**
 * useEditDrag — shared pointer-drag behaviour for edit-mode sprites (issue 246).
 *
 * Tracks a window-level pointer drag, converts client deltas to canvas
 * coordinates (accounting for the CSS scaling / zoom of the canvas element),
 * writes live (uncommitted) positions to the edit store during the drag and
 * commits the final drop position on release.
 *
 * Issue 246 review fixes:
 * - I1: callers can pass `getCurrent` so the drag starts from the position the
 *   sprite is CURRENTLY DISPLAYED at (avatars are drawn at base + behaviour
 *   offset, not at the seat anchor passed as x/y).
 * - M4: window listeners are removed if the component unmounts mid-drag.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useOfficeEditStore } from "@/stores/officeEditStore";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";

interface PointerDownLike {
  clientX: number;
  clientY: number;
  stopPropagation?: () => void;
}

export function useEditDrag(
  id: string,
  x: number,
  y: number,
  getCurrent?: () => { x: number; y: number },
): { onPointerDown: (e: PointerDownLike) => void; isDragging: boolean } {
  const selectEntity = useOfficeEditStore((s) => s.selectEntity);
  const updateEntityPosition = useOfficeEditStore((s) => s.updateEntityPosition);
  const setIsStoreDragging = useOfficeEditStore((s) => s.setIsDragging);
  const [isDragging, setLocalDragging] = useState(false);

  const dragRef = useRef({
    startX: 0,
    startY: 0,
    clientStartX: 0,
    clientStartY: 0,
    currentX: 0,
    currentY: 0,
    hasMoved: false,
  });

  // M4: live-drag listener cleanup on unmount.
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: PointerDownLike) => {
      if (typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }

      selectEntity(id);

      const canvas = document.querySelector(
        ".pixi-canvas-container canvas",
      ) as HTMLCanvasElement | null;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;

      // I1: drag from the currently displayed position when provided.
      const start = getCurrent ? getCurrent() : { x, y };

      dragRef.current = {
        startX: start.x,
        startY: start.y,
        clientStartX: e.clientX,
        clientStartY: e.clientY,
        currentX: start.x,
        currentY: start.y,
        hasMoved: false,
      };

      setLocalDragging(true);
      setIsStoreDragging(true);

      const onPointerMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - dragRef.current.clientStartX) * scaleX;
        const dy = (ev.clientY - dragRef.current.clientStartY) * scaleY;

        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          dragRef.current.hasMoved = true;
        }

        if (dragRef.current.hasMoved) {
          const newX = Math.round(
            Math.max(20, Math.min(CANVAS_WIDTH - 20, dragRef.current.startX + dx)),
          );
          const newY = Math.round(
            Math.max(20, Math.min(CANVAS_HEIGHT - 20, dragRef.current.startY + dy)),
          );
          dragRef.current.currentX = newX;
          dragRef.current.currentY = newY;
          // Live render-time update without committing to localStorage every micro-move
          updateEntityPosition(id, newX, newY, false);
        }
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        cleanupRef.current = null;

        setLocalDragging(false);
        setIsStoreDragging(false);

        // Commit final drop position to persisted store
        if (dragRef.current.hasMoved) {
          updateEntityPosition(
            id,
            dragRef.current.currentX,
            dragRef.current.currentY,
            true,
          );
        }
      };

      cleanupRef.current = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [id, x, y, getCurrent, selectEntity, setIsStoreDragging, updateEntityPosition],
  );

  return { onPointerDown, isDragging };
}
