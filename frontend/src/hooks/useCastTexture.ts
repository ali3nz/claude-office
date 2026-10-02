/**
 * useCastTexture — loads a W17ant Office cast sprite on demand.
 *
 * pixi Assets caches by URL, so every agent sharing a slug+facing shares one
 * GPU texture. Returns null until loaded; callers must handle null (skip
 * render) to avoid flashing a broken texture.
 */

"use client";

import { officeSpritePath, type OfficeFacing } from "@/themes/w17ant-cast";
import { usePixiTexture } from "./usePixiTexture";

/** Load a W17ant Office cast sprite (cached per slug+facing). */
export function useCastTexture(
  slug: string,
  facing: OfficeFacing = "front-right",
) {
  return usePixiTexture(officeSpritePath(slug, facing));
}
