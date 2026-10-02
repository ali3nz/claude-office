/**
 * usePixiTexture — loads any image URL into a cached pixi Texture.
 *
 * pixi Assets caches by URL, so callers sharing a URL share one GPU texture.
 * Returns null until loaded; callers must handle null (skip render or fall
 * back to procedural drawing).
 */

"use client";

import { useState, useEffect } from "react";
import { Assets, Texture } from "pixi.js";

export function usePixiTexture(url: string | null): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(
    () => (url ? (Assets.cache.get(url) as Texture | undefined) ?? null : null),
  );

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // Assets.load resolves from cache when already loaded, so this covers the
    // cache-hit case too — and setState from an async callback is lint-clean.
    Assets.load(url)
      .then((t) => {
        if (!cancelled) setTexture(t);
      })
      .catch(() => {
        // Missing sprite: leave null, caller renders fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return texture;
}
