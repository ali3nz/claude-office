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
import { EditableSprite, useEntityTurn } from "./edit/EditableSprite";
import { drawPoolTable, drawCouch } from "@/systems/isoDraw";
import { turnDeskKind, turnedSprite } from "@/systems/facingCycle";
import {
  BOSS_DESK,
  PINNED_DESKS,
  deskSpritePath,
  deskSpriteHeight,
  type DeskFurniture,
} from "@/themes/w17ant-spots";
import { useDeskSeats } from "@/systems/deskSeats";

function DeskSprite({
  id,
  name,
  desk,
  boss = false,
  zBias = -220,
}: {
  id?: string;
  name?: string;
  desk: DeskFurniture;
  boss?: boolean;
  zBias?: number;
}): ReactNode {
  // Issue 246 follow-up: Rotate changes which way the desk FACES (next
  // standing-desk variant), it does not spin the sprite.
  const turn = useEntityTurn(id ?? "");
  const kind = turnDeskKind(desk.kind, turn);
  const texture = usePixiTexture(deskSpritePath(kind));
  if (!texture) return null;
  const height = deskSpriteHeight(kind);
  const width = (texture.width / texture.height) * height;

  if (id) {
    return (
      <EditableSprite
        id={id}
        name={name ?? (boss ? "Boss Desk" : "Workstation Desk")}
        defaultX={desk.position.x}
        defaultY={desk.position.y}
        width={width}
        height={height}
        zBias={zBias + (boss ? 0.5 : 0)}
        texture={texture}
      />
    );
  }

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
  // The desk set is FIXED by the saved layout (authored desks minus hidden
  // ones); only OCCUPIED pool seats draw their workstation, so empty desks
  // never pop onto the floor. Operator-inserted desks are skipped here and
  // render through InsertedSpriteView. `occupied` holds 1-based pool seat
  // numbers (matching assignDeskSeats).
  const seats = useDeskSeats();
  return (
    <>
      {seats.map((seat, i) => {
        if (!seat.base) return null; // inserted desks draw themselves
        if (!occupied.has(i + 1)) return null; // empty desk stays off floor
        return (
          <DeskSprite
            key={seat.id}
            id={seat.id}
            name={`Workstation Desk ${i + 1}`}
            desk={{ kind: seat.kind, position: { x: seat.x, y: seat.y } }}
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
  id,
  name,
  path,
  art,
  h,
}: {
  id?: string;
  name?: string;
  path: string;
  art: [number, number];
  h: number;
}): ReactNode {
  const turn = useEntityTurn(id ?? "");
  const turned = turnedSprite(path, turn);
  const texture = usePixiTexture(turned.path);
  if (!texture) return null;
  const pos = artToCanvas((art[0] / 100) * 1200, (art[1] / 100) * 896);
  const height = h * ART_PER_ROOM * ROOM_SCALE;
  const width = (texture.width / texture.height) * height;

  if (id) {
    return (
      <EditableSprite
        id={id}
        name={name}
        defaultX={pos.x}
        defaultY={pos.y}
        width={width}
        height={height}
        flip={turned.flip}
        zBias={-400}
        texture={texture}
      />
    );
  }

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
/**
 * Issue 246 follow-up: the lounge pieces are raw Graphics, so they could not be
 * selected or removed. LoungePiece wraps one piece in EditableSprite (select,
 * drag, turn = mirror, delete) and offsets the original absolute-coordinate
 * drawing so it still renders at the same spot by default.
 */
function LoungePiece({
  id,
  name,
  bx,
  by,
  bw,
  bh,
  zBias,
  children,
}: {
  id: string;
  name: string;
  bx: number;
  by: number;
  bw: number;
  bh: number;
  zBias: number;
  children: ReactNode;
}): ReactNode {
  const turn = useEntityTurn(id);
  return (
    <EditableSprite
      id={id}
      name={name}
      defaultX={bx + bw / 2}
      defaultY={by + bh}
      width={bw}
      height={bh}
      flip={turn % 2 === 1}
      zBias={zBias}
    >
      <pixiContainer x={-(bx + bw / 2)} y={-(by + bh / 2)}>
        {children}
      </pixiContainer>
    </EditableSprite>
  );
}

function Lounge(): ReactNode {
  // Issue 246 follow-up: pool table + two couches (isometric Graphics), each a
  // normal editable object. Old flat rug/sofa/table were removed.
  return (
    <>
      <LoungePiece id="pool-table" name="Pool Table" bx={540} by={436} bw={200} bh={134} zBias={0}>
        <pixiGraphics draw={(g) => drawPoolTable(g, 640, 520)} />
      </LoungePiece>
      <LoungePiece id="couch-left" name="Couch (left)" bx={435} by={403} bw={130} bh={100} zBias={0}>
        <pixiGraphics draw={(g) => drawCouch(g, 500, 470, true)} />
      </LoungePiece>
      <LoungePiece id="couch-right" name="Couch (right)" bx={715} by={403} bw={130} bh={100} zBias={0}>
        <pixiGraphics draw={(g) => drawCouch(g, 780, 470, false)} />
      </LoungePiece>
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
      <DecorSprite
        id="decor-monstera-main"
        name="Monstera Plant"
        path="/sprites/decoration/monstera-plant.png"
        art={[46.9, 45.2]}
        h={71}
      />
      <DecorSprite
        id="decor-snake-main"
        name="Snake Plant"
        path="/sprites/decoration/snake-plant.png"
        art={[69.3, 48.3]}
        h={63}
      />
      <DecorSprite
        id="decor-cat-bandit-main"
        name="Cat Bandit"
        path="/sprites/cats/cat-bandit.png"
        art={[59.0, 52.0]}
        h={34}
      />
      {DECOR.map((d, i) => (
        <DecorSprite
          key={`decor-${i}`}
          id={`decor-${i}`}
          name={
            d.path
              .split("/")
              .pop()
              ?.replace(".png", "")
              ?.replace(/[-_]/g, " ") ?? `Decor ${i + 1}`
          }
          path={d.path}
          art={d.art}
          h={d.h}
        />
      ))}
    </>
  );
}

/** Owner name per PINNED_DESKS entry (Sol Docker uses the boss desk). */
const PINNED_DESK_OWNERS = [
  "Sol Webserver",
  "GhostReporting",
] as const;

/** Persistent-identity workstations (issue 226 R5) - only when present. */
export function SolDesks({ present }: { present: Set<string> }): ReactNode {
  return (
    <>
      {PINNED_DESKS.map((desk, i) =>
        present.has(PINNED_DESK_OWNERS[i]) ? (
          <DeskSprite
            key={`pinned-desk-${i}`}
            id={`desk-${PINNED_DESK_OWNERS[i].toLowerCase().replace(/\s+/g, "-")}`}
            name={`${PINNED_DESK_OWNERS[i]}'s Desk`}
            desk={desk}
          />
        ) : null,
      )}
    </>
  );
}

/** Michael's workstation (additional desk, drawn behind the boss sprite). */
export function BossDesk(): ReactNode {
  return <DeskSprite id="boss-desk" name="Boss Desk" desk={BOSS_DESK} boss />;
}
