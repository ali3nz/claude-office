"use client";

/**
 * layoutSync (issue 246 follow-up) — shared office layout across screens.
 *
 * The edit arrangement used to live only in each browser's localStorage, so
 * the homepage embed (served through the embed proxy on a DIFFERENT origin,
 * with its own localStorage) showed a different office than the operator's
 * desktop. The layout is now stored on the backend:
 *
 * - On load: the server layout wins when it is newer; a NEWER local layout is
 *   pushed instead. A legacy local layout (no timestamp) is NOT auto-pushed -
 *   the operator publishes it once with the toolbar's Publish button.
 * - On every edit: debounced push (last write wins by timestamp).
 * - Poll: applies a newer server layout published by another screen.
 *
 * The store's localStorage stays as an offline cache.
 */

import { apiFetch } from "@/utils/api";
import {
  readLayoutUpdatedAt,
  readLocalLayout,
  useOfficeEditStore,
  type SharedLayout,
} from "@/stores/officeEditStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { LOBBY_FLOOR_ID } from "@/types/navigation";

const LAYOUT_PATH = "/api/v1/layout";
const SAVED_LAYOUTS_PATH = `${LAYOUT_PATH}/saved`;
const AREA_SINGLE = "__single__";
const PUSH_DEBOUNCE_MS = 900;
const POLL_MS = 60_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** True while applying a server layout, so the store change is not echoed. */
let applyingRemote = false;
/** Newest server timestamp this client has applied or published. */
let serverUpdatedAt = 0;
/** Area from the last applied server layout, replayed after floors load. */
let pendingArea: string | null = null;
let started = false;

async function fetchServerLayout(): Promise<SharedLayout | null> {
  try {
    const res = await apiFetch(LAYOUT_PATH);
    if (!res.ok) return null;
    const data = (await res.json()) as { layout?: SharedLayout | null };
    return data.layout ?? null;
  } catch {
    return null;
  }
}

async function pushLayout(layout: SharedLayout): Promise<boolean> {
  try {
    const res = await apiFetch(LAYOUT_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
    });
    if (!res.ok) return false;
    serverUpdatedAt = Math.max(serverUpdatedAt, layout.updatedAt);
    return true;
  } catch {
    // Offline: the local cache still holds the arrangement; the next edit or
    // poll retries.
    return false;
  }
}

function applyServerLayout(layout: SharedLayout): void {
  applyingRemote = true;
  try {
    useOfficeEditStore.getState().applySharedLayout(layout);
    serverUpdatedAt = Math.max(serverUpdatedAt, layout.updatedAt ?? 0);
    if (layout.area) pendingArea = layout.area;
  } finally {
    applyingRemote = false;
  }
}

/** Capture the in-memory arrangement and the currently selected room/area. */
export function captureCurrentLayout(): SharedLayout {
  const edit = useOfficeEditStore.getState();
  const navigation = useNavigationStore.getState();
  const existing = readLocalLayout();
  const area =
    navigation.view === "single"
      ? AREA_SINGLE
      : navigation.floorId ?? existing?.area;
  return {
    version: 1,
    updatedAt: Date.now(),
    overrides: edit.overrides,
    inserted: edit.insertedEntities,
    ...(area ? { area } : {}),
  };
}

export interface SavedLayoutSummary {
  name: string;
  savedAt: number;
}

/** Read the server-owned list of named layout snapshots. */
export async function fetchSavedLayouts(): Promise<SavedLayoutSummary[]> {
  const res = await apiFetch(SAVED_LAYOUTS_PATH);
  if (!res.ok) throw new Error("Could not fetch saved layouts");
  const data = (await res.json()) as { layouts?: SavedLayoutSummary[] };
  return Array.isArray(data.layouts) ? data.layouts : [];
}

/** Save an explicit snapshot to the server's named-layout collection. */
export async function saveNamedLayout(
  name: string,
  layout: SharedLayout,
): Promise<string> {
  const res = await apiFetch(
    `${SAVED_LAYOUTS_PATH}/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout),
    },
  );
  if (!res.ok) throw new Error("Could not save layout");
  const data = (await res.json()) as { name?: string };
  return data.name ?? name;
}

/** Load a server snapshot and publish it as the current shared layout. */
export async function loadNamedLayout(name: string): Promise<void> {
  const res = await apiFetch(
    `${SAVED_LAYOUTS_PATH}/${encodeURIComponent(name)}`,
  );
  if (!res.ok) throw new Error("Could not load layout");
  const data = (await res.json()) as { layout?: SharedLayout | null };
  if (!data.layout) throw new Error("Saved layout is empty");

  applyServerLayout({ ...data.layout, updatedAt: Date.now() });
  applyPendingArea();
  await publishCurrentLayoutAndWait();
}

/** Publish the current browser layout (toolbar Publish button / first edit). */
export function publishCurrentLayout(): void {
  void publishCurrentLayoutAndWait().catch(() => undefined);
}

/** Publish and wait for the shared API, used when explicitly loading a layout. */
export async function publishCurrentLayoutAndWait(): Promise<void> {
  const local = readLocalLayout();
  if (!local) throw new Error("There is no current office layout");
  // Stamp it now so it wins over whatever the server had.
  local.updatedAt = Date.now();
  useOfficeEditStore.getState().applySharedLayout(local);
  if (!(await pushLayout(local))) throw new Error("Could not publish shared layout");
}

/** Debounced publish after an edit (see the store subscription below). */
export function scheduleLayoutPush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const local = readLocalLayout();
    if (local) void pushLayout(local);
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Replay the shared area (room/floor selection) once the building config is
 * loaded - called by useFloorConfig after its own restore step.
 */
export function applyPendingArea(): void {
  if (!pendingArea) return;
  const area = pendingArea;
  pendingArea = null;
  const nav = useNavigationStore.getState();
  if (area === AREA_SINGLE) nav.goToSingle();
  else if (area === LOBBY_FLOOR_ID) nav.goToFloor(LOBBY_FLOOR_ID);
  else nav.goToFloor(area);
}

/** Load the shared layout once, then poll for changes from other screens. */
export async function initLayoutSync(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;

  const server = await fetchServerLayout();
  const local = readLocalLayout();
  const localAt = local?.updatedAt ?? 0;
  const serverAt = server?.updatedAt ?? 0;

  if (server && serverAt >= localAt) {
    applyServerLayout(server);
  } else if (local && localAt > 0) {
    // Local edits made with sync in place, but the server has no copy (or an
    // older one): publish them.
    await pushLayout(local);
  }
  // else: legacy local layout with no server copy - the operator publishes it
  // explicitly (toolbar Publish) so a stale copy on another screen cannot win.

  setInterval(() => {
    void (async () => {
      if (applyingRemote || pushTimer) return;
      const remote = await fetchServerLayout();
      if (!remote) return;
      const remoteAt = remote.updatedAt ?? 0;
      if (remoteAt <= serverUpdatedAt) return;
      if (remoteAt <= readLayoutUpdatedAt()) return; // newer local edits pending
      applyServerLayout(remote);
    })();
  }, POLL_MS);
}

// Publish every edit (debounced). applySharedLayout sets `applyingRemote`
// around its own store write, so server-sourced changes are not echoed back.
useOfficeEditStore.subscribe((state, prev) => {
  if (applyingRemote) return;
  if (
    state.overrides !== prev.overrides ||
    state.insertedEntities !== prev.insertedEntities
  ) {
    scheduleLayoutPush();
  }
});
