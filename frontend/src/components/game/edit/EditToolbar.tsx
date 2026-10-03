"use client";

/**
 * EditToolbar Component (issue 246)
 *
 * Floating HUD displayed when edit mode is unlocked:
 * - Insert button to open the sprite palette
 * - Rotate button when a sprite is selected (90° clockwise per click)
 * - Delete button when an inserted sprite is selected (also supports Delete/Backspace key)
 * - Exit edit mode button
 */

import { useEffect, useCallback } from "react";
import {
  RotateCw,
  Plus,
  Trash2,
  X,
  Sparkles,
  Check,
} from "lucide-react";
import { useOfficeEditStore } from "@/stores/officeEditStore";

export function EditToolbar() {
  const isEditMode = useOfficeEditStore((s) => s.isEditMode);
  const setEditMode = useOfficeEditStore((s) => s.setEditMode);
  const isPaletteOpen = useOfficeEditStore((s) => s.isPaletteOpen);
  const setPaletteOpen = useOfficeEditStore((s) => s.setPaletteOpen);
  const selectedEntityId = useOfficeEditStore((s) => s.selectedEntityId);
  const selectEntity = useOfficeEditStore((s) => s.selectEntity);
  const rotateEntity = useOfficeEditStore((s) => s.rotateEntity);
  const removeInsertedEntity = useOfficeEditStore((s) => s.removeInsertedEntity);
  const insertedEntities = useOfficeEditStore((s) => s.insertedEntities);

  const selectedInserted = insertedEntities.find(
    (e) => e.id === selectedEntityId,
  );
  const isInserted = selectedInserted !== undefined;

  const handleRotate = useCallback(() => {
    if (selectedEntityId) {
      rotateEntity(selectedEntityId);
    }
  }, [selectedEntityId, rotateEntity]);

  const handleDelete = useCallback(() => {
    if (selectedEntityId && isInserted) {
      removeInsertedEntity(selectedEntityId);
    }
  }, [selectedEntityId, isInserted, removeInsertedEntity]);

  // Keyboard shortcut: Delete or Backspace key removes selected inserted sprite
  useEffect(() => {
    if (!isEditMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedEntityId && isInserted) {
          e.preventDefault();
          handleDelete();
        }
      } else if (
        (e.key === "r" || e.key === "R") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        if (selectedEntityId) {
          e.preventDefault();
          handleRotate();
        }
      } else if (e.key === "Escape") {
        if (selectedEntityId) {
          selectEntity(null);
        } else if (isPaletteOpen) {
          setPaletteOpen(false);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isEditMode,
    selectedEntityId,
    isInserted,
    handleDelete,
    handleRotate,
    selectEntity,
    isPaletteOpen,
    setPaletteOpen,
  ]);

  if (!isEditMode) return null;

  // Format readable name for selected entity
  const displayName = selectedInserted
    ? selectedInserted.name
    : selectedEntityId
      ? selectedEntityId
          .replace(/^(desk|decor|char)-/, "")
          .replace(/[-_]/g, " ")
      : null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 p-1.5 bg-slate-900/90 backdrop-blur-md border border-purple-500/40 rounded-xl shadow-2xl text-xs font-mono select-none">
      {/* Edit Mode Badge */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold">
        <Sparkles size={14} className="text-purple-400" />
        <span>EDIT MODE</span>
      </div>

      {/* Insert Button */}
      <button
        onClick={() => setPaletteOpen(!isPaletteOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors ${
          isPaletteOpen
            ? "bg-purple-600 text-white shadow"
            : "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
        }`}
        title="Open Sprite Palette"
      >
        <Plus size={14} />
        <span>Insert</span>
      </button>

      {/* Selected Entity Actions */}
      {selectedEntityId && (
        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700/80">
          <span className="text-[11px] text-slate-400 px-1 max-w-[120px] truncate">
            {displayName}
          </span>

          {/* Rotate Button (Requirement 2) */}
          <button
            onClick={handleRotate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow transition-colors active:scale-95"
            title="Rotate 90° clockwise (Key: R)"
          >
            <RotateCw size={13} />
            <span>Rotate</span>
          </button>

          {/* Delete Button for inserted sprites (Requirement 5) */}
          {isInserted && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white font-bold rounded-lg shadow transition-colors"
              title="Delete sprite (Key: Del)"
            >
              <Trash2 size={13} />
              <span>Delete</span>
            </button>
          )}

          {/* Deselect */}
          <button
            onClick={() => selectEntity(null)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Deselect (Key: Esc)"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Done / Exit button */}
      <button
        onClick={() => setEditMode(false)}
        className="flex items-center gap-1 ml-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold rounded-lg border border-emerald-500/30 transition-colors"
        title="Done editing (lock mode)"
      >
        <Check size={14} />
        <span>Done</span>
      </button>
    </div>
  );
}
