/**
 * AmbientStaff — render-only ambient cast (issue 212, Sol-approved variant).
 *
 * Keeps the floor populated with W17ant Office characters when no real
 * session agents exist. Deliberately NON-authoritative: ambient agents live
 * only in this component's local state and are rendered directly — they
 * are never inserted into the game store, never sent to the backend, session
 * APIs, machine state, queue logic, or persistence. When real agents exist
 * (store agents.size > 0) this renders nothing.
 */

"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useCastTexture } from "@/hooks/useCastTexture";
import { AgentLabel } from "./AgentSprite";
import {
  getCastForAgent,
  displayNameFromSlug,
  getFacingFromDelta,
  type OfficeFacing,
} from "@/themes/w17ant-cast";
import { DESK_SPOTS } from "@/themes/w17ant-spots";
import type { Position } from "@/types";
import { coMark } from "@/utils/coMark";

const AMBIENT_COUNT = 5;
const TICK_MS = 120;
const SPEED_PX_PER_SEC = 90;
const IDLE_MIN_MS = 4000;
const IDLE_MAX_MS = 14000;
const SPRITE_HEIGHT = 127;

const AMBIENT_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ec4899"];

interface AmbientAgent {
  id: string;
  name: string;
  slug: string;
  color: string;
  number: number;
  position: Position;
  facing: OfficeFacing;
  targetIndex: number;
  idleUntil: number;
  moving: boolean;
}

function makeAmbient(i: number, now: number): AmbientAgent {
  const id = `ambient-${i + 1}`;
  const slug = getCastForAgent(id);
  const spot = DESK_SPOTS[(i * 2) % DESK_SPOTS.length];
  return {
    id,
    name: displayNameFromSlug(slug),
    slug,
    color: AMBIENT_COLORS[i % AMBIENT_COLORS.length],
    number: i + 1,
    position: { x: spot.position.x, y: spot.position.y },
    facing: spot.facing,
    targetIndex: (i * 2) % DESK_SPOTS.length,
    idleUntil: now + 1500 + i * 900,
    moving: false,
  };
}

function AmbientFigure({ agent }: { agent: AmbientAgent }): ReactNode {
  coMark("ambfig");
  const texture = useCastTexture(agent.slug, agent.facing);
  if (!texture) return null;
  const scale = SPRITE_HEIGHT / texture.height;
  return (
    <pixiContainer x={agent.position.x} y={agent.position.y} zIndex={Math.round(agent.position.y)}>
      <pixiSprite texture={texture} anchor={{ x: 0.5, y: 1 }} y={6} scale={scale} />
      <AgentLabel
        name={agent.name}
        position={{ x: agent.position.x, y: agent.position.y - 75 }}
      />
    </pixiContainer>
  );
}

function AmbientStaffComponent(): ReactNode {
  coMark("amb");
  const realCount = useGameStore((s) => s.agents.size);
  const [agents, setAgents] = useState<AmbientAgent[]>(() => {
    const now = Date.now();
    return Array.from({ length: AMBIENT_COUNT }, (_, i) => makeAmbient(i, now));
  });

  useEffect(() => {
    if (realCount > 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setAgents((prev) =>
        prev.map((a) => {
          if (!a.moving && now >= a.idleUntil) {
            let idx = Math.floor(Math.random() * DESK_SPOTS.length);
            if (idx === a.targetIndex) idx = (idx + 1) % DESK_SPOTS.length;
            return { ...a, targetIndex: idx, moving: true };
          }
          if (!a.moving) return a;
          const target = DESK_SPOTS[a.targetIndex].position;
          const dx = target.x - a.position.x;
          const dy = target.y - a.position.y;
          const dist = Math.hypot(dx, dy);
          const step = (SPEED_PX_PER_SEC * TICK_MS) / 1000;
          if (dist <= step) {
            return {
              ...a,
              position: { x: target.x, y: target.y },
              facing: DESK_SPOTS[a.targetIndex].facing,
              moving: false,
              idleUntil:
                now + IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS),
            };
          }
          return {
            ...a,
            position: {
              x: a.position.x + (dx / dist) * step,
              y: a.position.y + (dy / dist) * step,
            },
            facing: getFacingFromDelta(dx, dy),
          };
        }),
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [realCount]);

  if (realCount > 0) return null;
  return (
    <>
      {agents.map((a) => (
        <AmbientFigure key={a.id} agent={a} />
      ))}
    </>
  );
}

export const AmbientStaff = memo(AmbientStaffComponent);
