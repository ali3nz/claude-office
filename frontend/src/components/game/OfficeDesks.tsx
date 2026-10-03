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
  DESK_SPOTS,
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
        // Issue 226 R6f (operator, twice): the authored furniture positions do
        // NOT line up with the seat positions (they are separate orderings),
        // which is why characters appeared to face away from their desks.
        // Draw the workstation AT THE SEAT instead - then "at the desk" and
        // "facing the monitor" are true by construction.
        const paired = DESKS[SEAT_TO_DESK_INDEX[i]] ?? desk;
        const seat = DESK_SPOTS[i];
        return (
          <DeskSprite
            key={`desk-${i}`}
            desk={{ kind: paired.kind, position: seat.position }}
          />
        );
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
  { path: "/sprites/decoration/white-board.png", art: [13.5, 52.0], h: 86 },
  { path: "/sprites/furniture/filling-open.png", art: [76.0, 47.0], h: 60 },
  { path: "/sprites/decoration/monstera-plant.png", art: [57.0, 47.5], h: 71 },
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

/**
 * Issue 226 R6e (operator: "office so empty ... couch ... bed"): the upstream
 * art set ships no couch/bed, so the lounge is drawn procedurally (dark-mode
 * palette) and the biggest upstream props are added around it.
 */
function Lounge(): ReactNode {
  // Sol turn-8 spec, verbatim: deliberately HARD-EDGED pixel art, rectangles
  // only (no rounded rects, no alpha, no gradients), palette taken from the
  // room. Footprint inside x 500..780 / y 380..515 (above the desk cluster).
  return (
    <>
      {/* RUG: blocky stepped corners, 4px border band, opaque fills */}
      <pixiGraphics
        draw={(g) => {
          g.clear();
          // stepped outer plate (6-8px steps)
          g.rect(538, 392, 204, 116); // top edge inset by the steps
          g.rect(530, 400, 220, 100);
          g.rect(538, 500, 204, 8);
          g.fill(0x52667a); // border band
          g.rect(538, 400, 204, 100);
          g.fill(0x26364a); // fill
          g.rect(546, 408, 188, 84);
          g.fill(0x31465e); // inner field
        }}
      />
      {/* SOFA: back (14px), body, arms (18px), seat front, shadow, highlight */}
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.rect(558, 402, 164, 14);
          g.fill(0x40566e); // back
          g.rect(576, 416, 128, 8);
          g.fill(0x607892); // highlight band
          g.rect(558, 424, 164, 30);
          g.fill(0x40566e); // body
          g.rect(558, 444, 164, 10);
          g.fill(0x4c647d); // seat/front
          g.rect(558, 402, 18, 52);
          g.fill(0x283849); // left arm
          g.rect(704, 402, 18, 52);
          g.fill(0x283849); // right arm
        }}
      />
      {/* COFFEE TABLE: hard rects, four short pixel legs */}
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.rect(594, 465, 92, 26);
          g.fill(0x76573f); // top
          g.rect(594, 483, 92, 8);
          g.fill(0x4e382b); // front/shadow
          g.rect(594, 465, 92, 4);
          g.fill(0x9a7555); // highlight edge
          g.rect(600, 491, 6, 10);
          g.rect(674, 491, 6, 10);
          g.fill(0x4e382b); // legs
        }}
      />
    </>
  );
}

/** Room dressing for the empty middle of the floor. */
export function OfficeDecor(): ReactNode {
  return (
    <>
      <Lounge />
      {/* Sol: pair the lounge with real assets - plants just outside the rug
          and a cat ON the rug beside the table. */}
      <DecorSprite path="/sprites/decoration/monstera-plant.png" art={[46.9, 45.2]} h={71} />
      <DecorSprite path="/sprites/decoration/snake-plant.png" art={[69.3, 48.3]} h={63} />
      <DecorSprite path="/sprites/cats/cat-bandit.png" art={[59.0, 52.0]} h={34} />
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
