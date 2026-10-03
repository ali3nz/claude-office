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
const STORAGE_KEY_LAYOUT_AT = "claude-office-layout-updated-at";
const STORAGE_KEY_AREA = "claude-office-floor";

/**
 * Shared layout (issue 246 follow-up): the arrangement is published to the
 * backend so the homepage embed (a different origin, with its own
 * localStorage) shows the same office as the operator's desktop.
 */
export interface SharedLayout {
  version: 1;
  /** Epoch ms of the last local edit / publish; newest wins across devices. */
  updatedAt: number;
  overrides: Record<string, EntityOverride>;
  inserted: InsertedSprite[];
  /** Selected room/area id, so every screen shows the same room. */
  area?: string;
}

function saveLayoutUpdatedAt(at: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_LAYOUT_AT, String(at));
  } catch {
    // ignore
  }
}

/** Epoch ms of the last local layout change (0 when unknown/legacy). */
export function readLayoutUpdatedAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY_LAYOUT_AT)) || 0;
  } catch {
    return 0;
  }
}

/**
 * The browser's current layout, or null when there is nothing to share yet.
 * Used by systems/layoutSync to seed the server and to publish edits.
 */
export function readLocalLayout(): SharedLayout | null {
  const overrides = readInitialOverrides();
  const inserted = readInitialInserted();
  const at = readLayoutUpdatedAt();
  let area: string | undefined;
  try {
    area = window.localStorage.getItem(STORAGE_KEY_AREA) ?? undefined;
  } catch {
    area = undefined;
  }
  // Content, a timestamp (a Reset), or an area choice all count as "something
  // to share" - the embed must show the same room, not just the same sprites.
  if (
    Object.keys(overrides).length === 0 &&
    inserted.length === 0 &&
    at === 0 &&
    !area
  ) {
    return null;
  }
  return {
    version: 1,
    updatedAt: at,
    overrides,
    inserted,
    ...(area ? { area } : {}),
  };
}

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
    // Every persisted change bumps the layout timestamp (newest wins).
    saveLayoutUpdatedAt(Date.now());
  } catch {
    // ignore
  }
}

function saveInserted(inserted: InsertedSprite[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_INSERTED, JSON.stringify(inserted));
    saveLayoutUpdatedAt(Date.now());
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
  /** Apply a layout received from the backend (see systems/layoutSync). */
  applySharedLayout: (layout: SharedLayout) => void;
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

  /**
   * Apply a layout received from the backend (issue 246 follow-up). Sets the
   * local cache to the published arrangement WITHOUT bumping the timestamp, so
   * the sync layer does not echo it straight back to the server.
   */
  applySharedLayout: (layout: SharedLayout) => {
    const overrides = layout.overrides ?? {};
    const inserted = Array.isArray(layout.inserted) ? layout.inserted : [];
    saveOverrides(overrides);
    saveInserted(inserted);
    saveLayoutUpdatedAt(layout.updatedAt ?? Date.now());
    try {
      if (layout.area) {
        window.localStorage.setItem(STORAGE_KEY_AREA, layout.area);
      }
    } catch {
      // ignore
    }
    set({
      overrides,
      insertedEntities: inserted,
      selectedEntityId: null,
    });
  },

  resetAllEdits: () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY_OVERRIDES);
      window.localStorage.removeItem(STORAGE_KEY_INSERTED);
    } catch {
      // ignore
    }
    // Bump the timestamp so the reset also clears the shared server layout.
    saveLayoutUpdatedAt(Date.now());
    set({
      overrides: {},
      insertedEntities: [],
      selectedEntityId: null,
    });
  },
}));
