/**
 * OfficeDesks — W17ant workstations rendered on the DM floor (issue 225).
 *
 * Draws the 10 artist-placed standing desks from `themes/w17ant-spots.ts`
 * (single geometry source, shared with the agent seat mapping) plus the boss
 * desk. Each desk sprite already contains the workstation hardware (dual
 * monitors, laptop, keyboard, mouse). Anchored bottom-center like W17ant
 * furniture; z = bottom edge y so agents in front/behind occlude correctly
 * inside the parent's sortableChildren layer.
 */

"use client";

import { type ReactNode } from "react";
import { usePixiTexture } from "@/hooks/usePixiTexture";
import {
  DESKS,
  BOSS_DESK,
  deskSpritePath,
  deskSpriteHeight,
  type DeskFurniture,
} from "@/themes/w17ant-spots";

function DeskSprite({
  desk,
  boss = false,
}: {
  desk: DeskFurniture;
  boss?: boolean;
}): ReactNode {
  const texture = usePixiTexture(deskSpritePath(desk.kind));
  if (!texture) return null;
  const height = deskSpriteHeight(desk.kind);
  const width = (texture.width / texture.height) * height;
  return (
    <pixiSprite
      texture={texture}
      anchor={{ x: 0.5, y: 1 }}
      x={desk.position.x}
      y={desk.position.y}
      width={width}
      height={height}
      zIndex={desk.position.y + (boss ? 0.5 : 0)}
    />
  );
}

/** The 10 workstation desks from the shared W17ant layout. */
export function DeskCluster(): ReactNode {
  return (
    <>
      {DESKS.map((desk, i) => (
        <DeskSprite key={`desk-${i}`} desk={desk} />
      ))}
    </>
  );
}

/** Michael's workstation (additional desk, drawn behind the boss sprite). */
export function BossDesk(): ReactNode {
  return <DeskSprite desk={BOSS_DESK} boss />;
}
