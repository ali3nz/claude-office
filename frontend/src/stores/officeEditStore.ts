"use client";

/**
 * officeEditStore — state for Claude Office edit mode (issue 246).
 *
 * Persists:
 * - isEditMode: whether editing is unlocked (toggle in SettingsModal)
 * - overrides: per-entity position and rotation overrides
 * - insertedEntities: user-added sprites placed on the office floor
 *
 * Everything persists to localStorage and survives full page reload.
 */

import { create } from "zustand";

/** Ids of avatar (agent) groups seen in edit chrome - drives the avatar picker. */
export const avatarIds = new Set<string>();

export interface EntityOverride {
  x?: number;
  y?: number;
  /** Facing steps (see systems/facingCycle). Legacy `rotation` is ignored. */
  turn?: number;
  /** Deleted (hidden) by the operator; Reset restores. */
  hidden?: boolean;
  /** Cast avatar slug chosen by the operator (agents only). */
  avatar?: string;
}

export interface InsertedSprite {
  id: string;
  spritePath: string;
  name: string;
  x: number;
  y: number;
  /** Facing steps (see systems/facingCycle). */
  turn?: number;
}

const STORAGE_KEY_EDIT_MODE = "claude-office-edit-mode";
const STORAGE_KEY_OVERRIDES = "claude-office-edit-overrides";
const STORAGE_KEY_INSERTED = "claude-office-inserted-sprites";

function readInitialEditMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY_EDIT_MODE) === "true";
  } catch {
    return false;
  }
}

function readInitialOverrides(): Record<string, EntityOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_OVERRIDES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, EntityOverride>;
      }
    }
  } catch {
    // Ignore invalid storage
  }
  return {};
}

function readInitialInserted(): InsertedSprite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_INSERTED);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as InsertedSprite[];
      }
    }
  } catch {
    // Ignore invalid storage
  }
  return [];
}

function saveEditMode(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_EDIT_MODE, enabled ? "true" : "false");
  } catch {
    // ignore
  }
}

function saveOverrides(overrides: Record<string, EntityOverride>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

function saveInserted(inserted: InsertedSprite[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_INSERTED, JSON.stringify(inserted));
  } catch {
    // ignore
  }
}

interface OfficeEditState {
  isEditMode: boolean;
  selectedEntityId: string | null;
  isPaletteOpen: boolean;
  overrides: Record<string, EntityOverride>;
  insertedEntities: InsertedSprite[];
  isDragging: boolean;

  // Actions
  setEditMode: (enabled: boolean) => void;
  selectEntity: (id: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  updateEntityPosition: (id: string, x: number, y: number, commit?: boolean) => void;
  rotateEntity: (id: string) => void;
  /** Delete any object: inserted sprites are removed, built-ins are hidden. */
  deleteEntity: (id: string) => void;
  setAvatar: (id: string, slug: string) => void;
  insertEntity: (spritePath: string, x: number, y: number, name?: string) => string;
  removeInsertedEntity: (id: string) => void;
  setIsDragging: (dragging: boolean) => void;
  resetAllEdits: () => void;
}

export const useOfficeEditStore = create<OfficeEditState>((set, get) => ({
  isEditMode: readInitialEditMode(),
  selectedEntityId: null,
  isPaletteOpen: false,
  overrides: readInitialOverrides(),
  insertedEntities: readInitialInserted(),
  isDragging: false,

  setEditMode: (enabled: boolean) => {
    saveEditMode(enabled);
    set({
      isEditMode: enabled,
      selectedEntityId: enabled ? get().selectedEntityId : null,
      isPaletteOpen: enabled ? get().isPaletteOpen : false,
    });
  },

  selectEntity: (id: string | null) => {
    set({ selectedEntityId: id });
  },

  setPaletteOpen: (open: boolean) => {
    set({ isPaletteOpen: open });
  },

  updateEntityPosition: (id: string, x: number, y: number, commit = true) => {
    set((state) => {
      // Issue 246 review M4: ignore commits for an inserted sprite that was
      // deleted mid-drag (no orphan override entries).
      if (
        id.startsWith("inserted-") &&
        !state.insertedEntities.some((e) => e.id === id)
      ) {
        return {};
      }
      // Check if this is an inserted entity
      const insertedIndex = state.insertedEntities.findIndex((e) => e.id === id);
      if (insertedIndex !== -1) {
        const updatedInserted = [...state.insertedEntities];
        const item = updatedInserted[insertedIndex];
        updatedInserted[insertedIndex] = { ...item, x, y };
        if (commit) saveInserted(updatedInserted);
        return { insertedEntities: updatedInserted };
      }

      // Existing entity override
      const current = state.overrides[id];
      const updatedOverrides = {
        ...state.overrides,
        [id]: {
          ...current,
          x,
          y,
        },
      };
      if (commit) saveOverrides(updatedOverrides);
      return { overrides: updatedOverrides };
    });
  },

  rotateEntity: (id: string) => {
    set((state) => {
      // Check if inserted entity
      const insertedIndex = state.insertedEntities.findIndex((e) => e.id === id);
      if (insertedIndex !== -1) {
        const updatedInserted = [...state.insertedEntities];
        const item = updatedInserted[insertedIndex];
        updatedInserted[insertedIndex] = { ...item, turn: ((item.turn ?? 0) + 1) % 20 };
        saveInserted(updatedInserted);
        return { insertedEntities: updatedInserted };
      }

      // Existing entity override
      const current = state.overrides[id];
      const updatedOverrides = {
        ...state.overrides,
        [id]: { ...current, turn: ((current?.turn ?? 0) + 1) % 20 },
      };
      saveOverrides(updatedOverrides);
      return { overrides: updatedOverrides };
    });
  },

  setAvatar: (id: string, slug: string) => {
    set((state) => {
      const updated = {
        ...state.overrides,
        [id]: { ...state.overrides[id], avatar: slug || undefined },
      };
      saveOverrides(updated);
      return { overrides: updated };
    });
  },

  deleteEntity: (id: string) => {
    set((state) => {
      if (state.insertedEntities.some((e) => e.id === id)) {
        const updated = state.insertedEntities.filter((e) => e.id !== id);
        saveInserted(updated);
        return {
          insertedEntities: updated,
          selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
        };
      }
      const updatedOverrides = {
        ...state.overrides,
        [id]: { ...state.overrides[id], hidden: true },
      };
      saveOverrides(updatedOverrides);
      return {
        overrides: updatedOverrides,
        selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
      };
    });
  },

  insertEntity: (spritePath: string, x: number, y: number, customName?: string) => {
    const id = `inserted-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const baseName =
      customName ??
      spritePath
        .split("/")
        .pop()
        ?.replace(".png", "")
        ?.replace(/[-_]/g, " ") ??
      "Sprite";

    const newSprite: InsertedSprite = {
      id,
      spritePath,
      name: baseName,
      x: Math.round(x),
      y: Math.round(y),
      turn: 0,
    };

    set((state) => {
      const updated = [...state.insertedEntities, newSprite];
      saveInserted(updated);
      return {
        insertedEntities: updated,
        selectedEntityId: id,
      };
    });

    return id;
  },

  removeInsertedEntity: (id: string) => {
    set((state) => {
      const updated = state.insertedEntities.filter((e) => e.id !== id);
      saveInserted(updated);
      return {
        insertedEntities: updated,
        selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
      };
    });
  },

  setIsDragging: (dragging: boolean) => {
    set({ isDragging: dragging });
  },

  resetAllEdits: () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY_OVERRIDES);
      window.localStorage.removeItem(STORAGE_KEY_INSERTED);
    } catch {
      // ignore
    }
    set({
      overrides: {},
      insertedEntities: [],
      selectedEntityId: null,
    });
  },
}));
