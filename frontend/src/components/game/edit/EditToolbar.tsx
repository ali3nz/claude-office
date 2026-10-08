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
  RotateCcw,
  Share2,
  Plus,
  Trash2,
  X,
  Sparkles,
  Check,
  ZoomIn,
  ZoomOut,
  Minus,
} from "lucide-react";
import { useOfficeEditStore, avatarIds } from "@/stores/officeEditStore";
import { useGameStore, selectAgents } from "@/stores/gameStore";
import { PERSISTENT_IDS } from "@/systems/persistentIdentities";
import { publishCurrentLayout } from "@/systems/layoutSync";
import { OFFICE_CHARACTERS, displayNameFromSlug } from "@/themes/w17ant-cast";

export function EditToolbar() {
  const isEditMode = useOfficeEditStore((s) => s.isEditMode);
  const setEditMode = useOfficeEditStore((s) => s.setEditMode);
  const isPaletteOpen = useOfficeEditStore((s) => s.isPaletteOpen);
  const setPaletteOpen = useOfficeEditStore((s) => s.setPaletteOpen);
  const selectedEntityId = useOfficeEditStore((s) => s.selectedEntityId);
  const selectEntity = useOfficeEditStore((s) => s.selectEntity);
  const rotateEntity = useOfficeEditStore((s) => s.rotateEntity);
  const resizeEntity = useOfficeEditStore((s) => s.resizeEntity);
  const tiltEntity = useOfficeEditStore((s) => s.tiltEntity);
  const agentsMap = useGameStore(selectAgents);
  const setAvatar = useOfficeEditStore((s) => s.setAvatar);
  const avatarValue = useOfficeEditStore((s) =>
    selectedEntityId ? (s.overrides[selectedEntityId]?.avatar ?? "") : "",
  );
  const isAgent = selectedEntityId ? agentsMap.has(selectedEntityId) || PERSISTENT_IDS.has(selectedEntityId) || avatarIds.has(selectedEntityId) : false;
  const deleteEntity = useOfficeEditStore((s) => s.deleteEntity);
  const resetAllEdits = useOfficeEditStore((s) => s.resetAllEdits);
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
    if (selectedEntityId) {
      deleteEntity(selectedEntityId);
    }
  }, [selectedEntityId, deleteEntity]);

  const handleReset = useCallback(() => {
    if (window.confirm("Reset the office layout? This restores every deleted, moved, turned and inserted object.")) {
      resetAllEdits();
    }
  }, [resetAllEdits]);

  const handlePublish = useCallback(() => {
    publishCurrentLayout();
  }, []);

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
        if (selectedEntityId) {
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
    <div className="relative z-40 flex flex-wrap justify-center items-center gap-2 px-2 py-1.5 bg-slate-900/95 border-b border-purple-500/40 text-xs font-mono select-none">
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

          {/* Size Buttons (issue 361): shrink/grow the selection */}
          <button
            onClick={() => resizeEntity(selectedEntityId!, -1)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg shadow transition-colors active:scale-95"
            title="Shrink (smaller)"
          >
            <ZoomOut size={13} />
            <span>Size-</span>
          </button>
          <button
            onClick={() => resizeEntity(selectedEntityId!, 1)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg shadow transition-colors active:scale-95"
            title="Enlarge (bigger)"
          >
            <ZoomIn size={13} />
            <span>Size+</span>
          </button>

          {/* Tilt Buttons (issue 361): slant to match the room walls */}
          <button
            onClick={() => tiltEntity(selectedEntityId!, -1)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg shadow transition-colors active:scale-95"
            title="Slant left to match the wall angle"
          >
            <Minus size={13} />
            <span>Tilt-</span>
          </button>
          <button
            onClick={() => tiltEntity(selectedEntityId!, 1)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg shadow transition-colors active:scale-95"
            title="Slant right to match the wall angle"
          >
            <Plus size={13} />
            <span>Tilt+</span>
          </button>

          {/* Rotate Button (Requirement 2) */}
          <button
            onClick={handleRotate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow transition-colors active:scale-95"
            title="Turn to face the next direction (Key: R)"
          >
            <RotateCw size={13} />
            <span>Rotate</span>
          </button>

          {isAgent && (
            <select
              value={avatarValue}
              onChange={(e) => setAvatar(selectedEntityId!, e.target.value)}
              className="px-2 py-1.5 bg-slate-800 text-slate-100 rounded-lg border border-slate-600 text-xs"
              title="Change avatar"
            >
              <option value="">Avatar: default</option>
              {OFFICE_CHARACTERS.map((c) => (
                <option key={c} value={c}>
                  {displayNameFromSlug(c)}
                </option>
              ))}
            </select>
          )}
          {/* Delete works on ANY selected object (built-ins are hidden; Reset restores) */}
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white font-bold rounded-lg shadow transition-colors"
            title="Delete object (Key: Del)"
          >
            <Trash2 size={13} />
            <span>Delete</span>
          </button>

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

      {/* Publish: share this arrangement with every screen (homepage embed) */}
      <button
        onClick={handlePublish}
        className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 font-bold rounded-lg border border-sky-500/30 transition-colors"
        title="Publish this layout to every screen (homepage embed, other devices)"
      >
        <Share2 size={14} />
        <span>Publish</span>
      </button>

      {/* Reset: undo every edit (restores deleted objects, positions, facings) */}
      <button
        onClick={handleReset}
        className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-lg border border-amber-500/30 transition-colors"
        title="Reset all layout edits"
      >
        <RotateCcw size={14} />
        <span>Reset</span>
      </button>

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
