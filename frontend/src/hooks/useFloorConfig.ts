"use client";

import { useEffect } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import { apiFetch, initApiKeyFromBrowser } from "@/utils/api";
import { LOBBY_FLOOR_ID } from "@/types/navigation";

// Issue 246: persisted room/area choice (Settings -> Office Layout).
const AREA_STORAGE_KEY = "claude-office-floor";
const AREA_SINGLE = "__single__";

/**
 * Fetches building configuration from the backend and stores it
 * in the navigation store. Runs once on mount.
 *
 * If no floors are configured, the store stays in "single" view mode.
 * If the operator previously selected a room/area (Settings -> Office
 * Layout), that selection is restored once the floors are known.
 */
export function useFloorConfig(): void {
  const setBuildingConfig = useNavigationStore((s) => s.setBuildingConfig);
  const setLoading = useNavigationStore((s) => s.setLoading);

  useEffect(() => {
    // Issue 246: this effect runs before page.tsx's key-intake effect, and the
    // floors request needs the API key - load it here first (idempotent).
    initApiKeyFromBrowser();
    setLoading(true);
    apiFetch("/api/v1/floors")
      .then((res) => res.json())
      .then((data) => {
        // Backend returns camelCase (Pydantic to_camel alias)
        const config = {
          buildingName: data.buildingName ?? "Building",
          floors: ((data.floors ?? []) as Record<string, unknown>[]).map(
            (floor) => ({
              id: floor.id as string,
              name: floor.name as string,
              floorNumber: floor.floorNumber as number,
              accent: floor.accent as string,
              icon: floor.icon as string,
              rooms: ((floor.rooms ?? []) as Record<string, unknown>[]).map(
                (room) => ({
                  id: room.id as string,
                  repoName: room.repoName as string,
                }),
              ),
            }),
          ),
        };
        setBuildingConfig(config);

        // Issue 246: restore the last selected room/area if it still exists.
        try {
          const saved = window.localStorage.getItem(AREA_STORAGE_KEY);
          const nav = useNavigationStore.getState();
          if (saved === AREA_SINGLE) {
            nav.goToSingle();
          } else if (saved === LOBBY_FLOOR_ID) {
            nav.goToFloor(LOBBY_FLOOR_ID);
          } else if (saved && config.floors.some((f) => f.id === saved)) {
            nav.goToFloor(saved);
          }
        } catch {
          // Private mode / no storage: keep the default view.
        }
      })
      .catch(() => {
        setBuildingConfig({ buildingName: "Building", floors: [] });
      });
  }, [setBuildingConfig, setLoading]);
}
