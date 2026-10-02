"use client";

/**
 * officeRoomStore — which office location is rendered (issue 226 R5).
 *
 * Local-only preference (same pattern as lowResourceMode): the wall display
 * and each workstation can render a different location without touching the
 * server. Override via ?room=modern|dm (persists), else localStorage, else
 * the operator default: the modern office (image reference 2026-10-03).
 */

import { create } from "zustand";
import type { OfficeRoom } from "@/themes/w17ant-cast";

const STORAGE_KEY = "claude-office-room";
const DEFAULT_ROOM: OfficeRoom = "modern";

function isRoom(v: unknown): v is OfficeRoom {
  return v === "modern" || v === "dm";
}

function readInitial(): OfficeRoom {
  if (typeof window === "undefined") return DEFAULT_ROOM;
  try {
    const q = new URLSearchParams(window.location.search).get("room");
    if (isRoom(q)) {
      window.localStorage.setItem(STORAGE_KEY, q);
      return q;
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isRoom(saved)) return saved;
  } catch {
    // Private mode / no storage: fall through to the default.
  }
  return DEFAULT_ROOM;
}

interface OfficeRoomState {
  room: OfficeRoom;
  setRoom: (room: OfficeRoom) => void;
}

export const useOfficeRoomStore = create<OfficeRoomState>((set) => ({
  room: readInitial(),
  setRoom: (room) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, room);
    } catch {
      // ignore
    }
    set({ room });
  },
}));
