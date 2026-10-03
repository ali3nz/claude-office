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
import { artToCanvas } from "@/themes/w17ant-spots";
import {
  DESKS,
  BOSS_DESK,
  PINNED_DESKS,
  SEAT_TO_DESK_INDEX,
  deskSpritePath,
  deskSpriteHeight,
  type DeskFurniture,
} from "@/themes/w17ant-spots";

function DeskSprite({
  desk,
  boss = false,
  zBias = -220,
}: {
  desk: DeskFurniture;
  boss?: boolean;
  /**
   * Issue 226 R5 (operator): desks are FURNITURE - they always sort below the
   * characters (a desk sprite is ~181px tall, so a -220 bias still lets an
   * agent standing well behind a desk sort behind it, while the occupant is
   * never covered by its own desk).
   */
  zBias?: number;
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
      zIndex={desk.position.y + zBias + (boss ? 0.5 : 0)}
    />
  );
}

/**
 * The 10 workstation desks from the shared W17ant layout.
 *
 * Issue 226 R5 (operator): only desks that are actually OCCUPIED by a visible
 * agent are drawn - an empty workstation is not rendered at all.
 * `occupied` holds the 1-based desk numbers (matching getSpotForDesk).
 */
export function DeskCluster({
  occupied,
}: {
  occupied: Set<number>;
}): ReactNode {
  return (
    <>
      {DESKS.map((desk, i) => {
        if (!occupied.has(i + 1)) return null;
        // Seat i+1 sits at a SPECIFIC furniture desk (seat/furniture orderings
        // differ - see SEAT_TO_DESK_INDEX).
        const paired = DESKS[SEAT_TO_DESK_INDEX[i]] ?? desk;
        return <DeskSprite key={`desk-${i}`} desk={paired} />;
      })}
    </>
  );
}

/**
 * Issue 226 R6b (operator: "any cool stuff you can put in the middle"): the
 * upstream room decoration, at the positions the upstream authors placed it.
 * Heights follow the same room->canvas scale as the desks. Presentation only.
 */
const DECOR: { path: string; art: [number, number]; h: number }[] = [
  { path: "/sprites/decoration/monstera-plant.png", art: [43.2, 37.9], h: 71 },
  { path: "/sprites/decoration/snake-plant.png", art: [32.0, 71.2], h: 63 },
  { path: "/sprites/decoration/money-tree.png", art: [60.2, 80.4], h: 63 },
  { path: "/sprites/decoration/printer.png", art: [85.4, 56.8], h: 69 },
  // Issue 226 R6c: floor reads too empty - more dressing + two office cats.
  { path: "/sprites/decoration/monstera-plant.png", art: [17.5, 62.0], h: 71 },
  { path: "/sprites/decoration/snake-plant.png", art: [70.0, 60.0], h: 63 },
  { path: "/sprites/decoration/money-tree.png", art: [40.0, 47.0], h: 63 },
  { path: "/sprites/furniture/filling-closed.png", art: [24.5, 52.0], h: 56 },
  { path: "/sprites/cats/cat-bandit.png", art: [48.0, 62.0], h: 34 },
  { path: "/sprites/cats/cat-sprinkles.png", art: [33.0, 78.0], h: 34 },
];

const ART_PER_ROOM = 1.5;
const ROOM_SCALE = 1024 / 896;

function DecorSprite({
  path,
  art,
  h,
}: {
  path: string;
  art: [number, number];
  h: number;
}): ReactNode {
  const texture = usePixiTexture(path);
  if (!texture) return null;
  const pos = artToCanvas((art[0] / 100) * 1200, (art[1] / 100) * 896);
  const height = h * ART_PER_ROOM * ROOM_SCALE;
  const width = (texture.width / texture.height) * height;
  return (
    <pixiSprite
      texture={texture}
      anchor={{ x: 0.5, y: 1 }}
      x={pos.x}
      y={pos.y}
      width={width}
      height={height}
      zIndex={pos.y - 400}
    />
  );
}

/** Room dressing for the empty middle of the floor. */
export function OfficeDecor(): ReactNode {
  return (
    <>
      {DECOR.map((d, i) => (
        <DecorSprite key={`decor-${i}`} path={d.path} art={d.art} h={d.h} />
      ))}
    </>
  );
}

/** Owner name per PINNED_DESKS entry (Sol Docker uses the boss desk). */
const PINNED_DESK_OWNERS = [
  "Sol Webserver",
  "GhostReporting",
  "TruFreedom",
] as const;

/** Persistent-identity workstations (issue 226 R5) - only when present. */
export function SolDesks({ present }: { present: Set<string> }): ReactNode {
  return (
    <>
      {PINNED_DESKS.map((desk, i) =>
        present.has(PINNED_DESK_OWNERS[i]) ? (
          <DeskSprite key={`pinned-desk-${i}`} desk={desk} />
        ) : null,
      )}
    </>
  );
}

/** Michael's workstation (additional desk, drawn behind the boss sprite). */
export function BossDesk(): ReactNode {
  return <DeskSprite desk={BOSS_DESK} boss />;
}
