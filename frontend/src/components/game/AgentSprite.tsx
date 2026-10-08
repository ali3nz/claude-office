/**
 * AgentSprite Component
 *
 * W17ant Office cast rendering (issue 212): each agent is drawn as a real
 * Office character sprite facing its movement direction, falling back to the
 * legacy colored capsule while textures load or if a sprite is missing.
 * Bubble/label/headset layers unchanged.
 */

"use client";

import {
  memo,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useTick } from "@pixi/react";
import { Container, Graphics, TextStyle, Texture } from "pixi.js";
import type { Position, BubbleContent } from "@/types";
import type { AgentPhase } from "@/stores/gameStore";
import { useAttentionStore } from "@/stores/attentionStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { isInElevatorZone } from "@/systems/queuePositions";
import { ICON_MAP } from "./shared/iconMap";
import { drawBubble, drawIconBadge } from "./shared/drawBubble";
import { drawRightArm, drawLeftArm } from "./shared/drawArm";
import { truncateBubbleText } from "@/utils/bubbleText";
import { useCastTexture } from "@/hooks/useCastTexture";
import { usePixiTexture } from "@/hooks/usePixiTexture";
import { coMark } from "@/utils/coMark";
import {
  getCastForAgent,
  getFacingFromDelta,
  type OfficeFacing,
} from "@/themes/w17ant-cast";
import { getOffset } from "@/systems/officeBehavior";
import { useOfficeEditStore } from "@/stores/officeEditStore";
import { avatarFacingForTurn } from "@/systems/facingCycle";

// ============================================================================
// TYPES
// ============================================================================

export interface AgentSpriteProps {
  id: string;
  name: string | null;
  color: string;
  number: number;
  position: Position;
  phase: AgentPhase;
  bubble: BubbleContent | null;
  headsetTexture?: Texture | null;
  sunglassesTexture?: Texture | null;
  renderBubble?: boolean; // Whether to render bubble (default true)
  renderLabel?: boolean; // Whether to render name label (default true)
  isTyping?: boolean; // Whether agent is typing (animates arms)
  /** Issue 226 R2: facing to use while seated at the workstation (not moving). */
  seatFacing?: OfficeFacing;
  /**
   * Issue 226 R3: absolute on-floor position. When the sprite is wrapped in a
   * BehaviorGroup the container `position` is LOCAL (0,0) and the group carries
   * the world offset; facing + click still need the world coordinates. Defaults
   * to `position` for direct (Elevator) usage.
   */
  worldPosition?: Position;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_WIDTH = 48; // 1.5 blocks × 32px (matches boss)
const AGENT_HEIGHT = 80; // 2.5 blocks × 32px (matches boss)
const STROKE_WIDTH = 4;

/** Cast sprite display height on the canvas (W17ant ratio-preserving). */
const CAST_SPRITE_HEIGHT = 133;

/**
 * Issue 226 R4 (Sol): idle glance is a LOOK to the other side, not a turn
 * away from the desk, so left/right are mirrored.
 */
/** Permanent avatar pins by display name (issue 226 R5). */
const PINNED_CAST_BY_NAME: Record<string, string> = {
  "Sol Docker": "michael-scott",
};

const MIRROR_FACING: Record<OfficeFacing, OfficeFacing> = {
  "front-left": "front-right",
  "front-right": "front-left",
  "rear-left": "rear-right",
  "rear-right": "rear-left",
};

/** Global cap so idle glances never turn into synchronized floor motion. */
let lastGlanceAt = 0;

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

function drawAgent(g: Graphics, color: string): void {
  g.clear();

  // Convert hex color string to number
  const colorNum = parseInt(color.replace("#", ""), 16) || 0xff6b6b;

  // Agent body (colored capsule with white border)
  // Position is at CENTER OF BOTTOM CIRCLE, so capsule extends from -54 to +22
  // Inset by half stroke width so total size matches AGENT_WIDTH × AGENT_HEIGHT
  const innerWidth = AGENT_WIDTH - STROKE_WIDTH;
  const innerHeight = AGENT_HEIGHT - STROKE_WIDTH;
  const agentRadius = innerWidth / 2; // 22px - radius of top/bottom circles
  g.roundRect(
    -innerWidth / 2,
    -innerHeight + agentRadius, // Bottom circle center at y=0
    innerWidth,
    innerHeight,
    agentRadius,
  );
  g.fill(colorNum);
  g.stroke({ width: STROKE_WIDTH, color: 0xffffff });
}

// ============================================================================
// BUBBLE COMPONENT
// ============================================================================

interface BubbleProps {
  content: BubbleContent;
  yOffset: number;
}

function Bubble({ content, yOffset }: BubbleProps): ReactNode {
  const { type = "thought", icon } = content;
  const text = truncateBubbleText(content.text);

  // Convert icon name to emoji if needed
  const iconEmoji = icon ? (ICON_MAP[icon] ?? icon) : undefined;

  // Icon badge constants
  const badgeRadius = 16; // Radius of the circular badge

  // Calculate bubble dimensions (at display scale) - icon is outside bubble now
  const charWidth = 7.5;
  const paddingH = 30;
  const maxW = 220;
  const rawWidth = text.length * charWidth + paddingH;
  const bWidth = Math.min(maxW, Math.max(80, rawWidth));
  const capacity = (bWidth - paddingH) / charWidth;
  const lines = Math.max(1, Math.ceil(text.length / capacity));
  const bHeight = 35 + lines * 14;

  // Text style at 2x for sharp rendering
  const textStyle = useMemo<Partial<TextStyle>>(
    () => ({
      fontFamily:
        '"Courier New", Courier, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", monospace',
      fontSize: 20,
      fill: "#000000",
      fontWeight: "bold",
      wordWrap: true,
      wordWrapWidth: (bWidth - 30) * 2,
      breakWords: true,
      align: "left",
      lineHeight: 28,
      stroke: { width: 0, color: 0x000000 },
    }),
    [bWidth],
  );

  // Icon style - larger emoji
  const iconStyle = useMemo<Partial<TextStyle>>(
    () => ({
      fontFamily:
        '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
      fontSize: 40, // Large emoji for badge
      fill: "#000000",
    }),
    [],
  );

  return (
    <pixiContainer y={yOffset} x={45}>
      <pixiGraphics draw={(g) => drawBubble(g, bWidth, bHeight, type)} />
      {/* Icon badge on top-left corner of bubble */}
      {iconEmoji && (
        <pixiContainer x={-bWidth / 2 - 6} y={-bHeight + 6}>
          <pixiGraphics draw={(g) => drawIconBadge(g, badgeRadius)} />
          <pixiContainer scale={0.5} x={0} y={1}>
            <pixiText
              text={iconEmoji}
              anchor={0.5}
              style={iconStyle}
              resolution={2}
            />
          </pixiContainer>
        </pixiContainer>
      )}
      {/* Text rendered at 2x and scaled down for sharpness */}
      <pixiContainer x={-bWidth / 2 + 15} y={-bHeight / 2} scale={0.5}>
        <pixiText
          text={text}
          anchor={{ x: 0, y: 0.5 }}
          style={textStyle}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function AgentSpriteComponent({
  id,
  name,
  color,
  number: _number,
  position,
  phase: _phase,
  bubble,
  headsetTexture: _headsetTexture,
  sunglassesTexture: _sunglassesTexture,
  renderBubble = true,
  renderLabel = true,
  seatFacing,
  worldPosition,
  isTyping: _isTyping = false,
}: AgentSpriteProps): ReactNode {
  const clickToFocusEnabled = usePreferencesStore((s) => s.clickToFocusEnabled);
  const openFocusPopup = useAttentionStore((s) => s.openFocusPopup);
  // Issue 246: while the office is unlocked for editing, clicks select/drag
  // sprites instead of opening the focus popup.
  const isEditMode = useOfficeEditStore((s) => s.isEditMode);
  const editTurn = useOfficeEditStore((s) => s.overrides[id]?.turn ?? 0);

  // ---- W17ant cast selection -------------------------------------------
  // Operator (issue 226 R5): Sol Docker is the BOSS - pin the Mike Scott
  // avatar so the role reads at a glance and never shuffles. Other persistent
  // identities keep their deterministic hash avatar (stable per agent id).
  const avatarOverride = useOfficeEditStore((s) => s.overrides[id]?.avatar);
  const slug =
    avatarOverride ||
    (name && PINNED_CAST_BY_NAME[name]) ||
    getCastForAgent(id);

  // Facing from movement. The animation loop moves agents between renders, so
  // the direction must be derived from the render-phase position delta — the
  // same pattern W17ant's Character.tsx uses (refs read/updated during render
  // by design; a one-frame-late effect update makes sprites face the wrong way
  // while walking). eslint-disable is deliberate and scoped to this block.
   
  const wp = worldPosition ?? position;
  const prevPosRef = useRef(wp);
   
  const facingRef = useRef<OfficeFacing>("front-right");
  // eslint-disable-next-line react-hooks/refs
  const dx = wp.x - prevPosRef.current.x;
  // eslint-disable-next-line react-hooks/refs
  const dy = wp.y - prevPosRef.current.y;
  const moving = Math.abs(dx) + Math.abs(dy) > 0.01;
  // eslint-disable-next-line react-hooks/refs
  prevPosRef.current = wp;

  // ---- Issue 226 R4: procedural aliveness (Sol-approved) ----------------
  // Walking facing for BEHAVIOR-driven walks: the engine moves the enclosing
  // BehaviorGroup through a pixi ticker (no React re-render), so direction is
  // read from the offset delta and React state changes only on a real turn.
  const [behaviorFacing, setBehaviorFacing] = useState<OfficeFacing | null>(null);
  const behaviorFacingRef = useRef<OfficeFacing | null>(null);
  const lastOffRef = useRef({ x: 0, y: 0 });
  const lastMoveAtRef = useRef(0);

  // Idle glance: a seated, genuinely idle agent occasionally looks to the
  // other side, then restores its workstation facing.
  const [glanceFacing, setGlanceFacing] = useState<OfficeFacing | null>(null);
  const glanceRef = useRef({
    nextAt: Date.now() + 8_000 + Math.random() * 12_000,
    untilAt: 0,
    active: false,
  });

  // Typing jitter + breathing bob are sprite-local (never the shared offset).
  const typingRef = useRef(_isTyping);
  useEffect(() => {
    typingRef.current = _isTyping;
  }, [_isTyping]);
  const microRef = useRef<Container | null>(null);
  const breathSeedRef = useRef<number | null>(null);
  if (breathSeedRef.current === null) {
    // Stable per-agent phase so breathing never synchronizes across the floor.
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    breathSeedRef.current = Math.abs(h % 6283) / 1000;
  }

  useTick(() => {
    const now = Date.now();
    // ---- walking facing (behavior walks only) ----
    const off = getOffset(id);
    const mdx = off.x - lastOffRef.current.x;
    const mdy = off.y - lastOffRef.current.y;
    lastOffRef.current = off;
    const walking = Math.abs(mdx) + Math.abs(mdy) > 0.5;
    if (walking) {
      lastMoveAtRef.current = now;
      const f = getFacingFromDelta(mdx, mdy);
      if (f !== behaviorFacingRef.current) {
        behaviorFacingRef.current = f;
        setBehaviorFacing(f);
      }
    } else if (
      behaviorFacingRef.current !== null &&
      now - lastMoveAtRef.current > 150
    ) {
      behaviorFacingRef.current = null;
      setBehaviorFacing(null);
    }

    // ---- idle glance ----
    const glance = glanceRef.current;
    const idleEnough = !!seatFacing && !walking && !typingRef.current;
    if (glance.active) {
      if (now >= glance.untilAt || !idleEnough) {
        glance.active = false;
        glance.nextAt = now + 15_000 + Math.random() * 25_000;
        lastGlanceAt = now;
        setGlanceFacing(null);
      }
    } else if (
      idleEnough &&
      now >= glance.nextAt &&
      now - lastGlanceAt > 4_000
    ) {
      glance.active = true;
      glance.untilAt = now + 1_500 + Math.random() * 2_500;
      lastGlanceAt = now;
      setGlanceFacing(MIRROR_FACING[seatFacing] ?? null);
    }

    // ---- sprite-local micro transform ----
    const node = microRef.current;
    if (node) {
      const t = now / 1000;
      const breathe =
        Math.sin((t * Math.PI * 2) / 5 + (breathSeedRef.current ?? 0)) * 1;
      let jx = 0;
      let jy = 0;
      if (typingRef.current) {
        // Issue 226 R6c (operator: "I don't see any typing"): a much more
        // visible key-tap - ~3 taps/second at 3px vertical + a small lean.
        jx = Math.sin(t * 19) * 0.8;
        jy = Math.sin(t * 19 + 0.6) * 3.0;
      }
      node.x = jx;
      node.y = breathe + jy;
    }
  });

  // ---- facing precedence (Sol): behavior walk > legacy walk > glance > seat
  // Issue 246 follow-up: an operator-chosen facing (edit-mode Rotate) wins.
  const forcedFacing = avatarFacingForTurn(editTurn);
  // eslint-disable-next-line react-hooks/refs
  const facing =
    forcedFacing ??
    behaviorFacing ??
    (moving ? getFacingFromDelta(dx, dy) : null) ??
    glanceFacing ??
    seatFacing ??
    facingRef.current;
  // eslint-disable-next-line react-hooks/refs
  facingRef.current = facing;

  const castTexture = useCastTexture(slug, facing);

  // Memoize draw callback (legacy capsule fallback)
  const drawCallback = useMemo(
    () => (g: Graphics) => drawAgent(g, color),
    [color],
  );

  // Click handler for focus popup
  const handlePointerTap = useCallback(() => {
    if (!clickToFocusEnabled || isEditMode) return;
    const canvas = document.querySelector(".pixi-canvas-container canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / 1280; // CANVAS_WIDTH = 1280
    const screenX = rect.left + wp.x * scale;
    const screenY = rect.top + wp.y * scale;
    openFocusPopup(id, screenX, screenY);
  }, [clickToFocusEnabled, isEditMode, id, wp.x, wp.y, openFocusPopup]);

  // Bubble offset for capsule rendering
  const bubbleOffset = -93;

  // Sprite is anchored bottom-center at the agent's feet (same origin as the
  // capsule's bottom-circle-center), so desk-spot positions stay valid.
  return (
    <pixiContainer
      x={position.x}
      y={position.y}
      onPointerTap={handlePointerTap}
      interactive={clickToFocusEnabled}
    >
      {/* W17ant Office cast sprite (fallback: legacy capsule) */}
      {/* Issue 226 R4: sprite-local micro animation container. The shared
          locomotion offset (BehaviorGroup) and the label/bubble layers are
          never touched by this transform. */}
      <pixiContainer ref={microRef}>
        {castTexture ? (
          <pixiSprite
            texture={castTexture}
            anchor={{ x: 0.5, y: 1 }}
            x={0}
            y={0}
            height={CAST_SPRITE_HEIGHT}
            width={castTexture.width * (CAST_SPRITE_HEIGHT / castTexture.height)}
          />
        ) : (
          <pixiGraphics draw={drawCallback} />
        )}
      </pixiContainer>

      {/* Agent name if present - hide when in elevator or when renderLabel is false */}
      {renderLabel && name && !isInElevatorZone(position) && (
        <pixiContainer y={-CAST_SPRITE_HEIGHT - 8} scale={0.5}>
          <pixiText
            text={name}
            anchor={0.5}
            style={{
              fontFamily: "monospace",
              fontSize: 24,
              fill: 0xffffff,
              fontWeight: "bold",
              stroke: { width: 4, color: 0x000000 },
            }}
            resolution={2}
          />
        </pixiContainer>
      )}

      {/* Bubble - hide when in elevator or when renderBubble is false */}
      {renderBubble && bubble && !isInElevatorZone(position) && (
        <Bubble content={bubble} yOffset={bubbleOffset} />
      )}
    </pixiContainer>
  );
}

// ============================================================================
// AGENT ARMS COMPONENT (rendered separately after desk surfaces)
// ============================================================================

export interface AgentArmsProps {
  position: Position;
  isTyping: boolean;
}

function AgentArmsComponent({ position, isTyping }: AgentArmsProps): ReactNode {
  // Animation state for typing
  const [typingTime, setTypingTime] = useState(0);

  // Animate typing - oscillate hands up/down
  useTick((ticker) => {
    if (isTyping) {
      setTypingTime((t) => t + ticker.deltaTime * 0.15);
    } else if (typingTime !== 0) {
      setTypingTime(0);
    }
  });

  // Calculate arm animation offsets (subtle, out of phase for natural look)
  const rightArmOffset = isTyping ? Math.sin(typingTime * 8) * 2 : 0;
  const leftArmOffset = isTyping
    ? Math.sin(typingTime * 8 + Math.PI * 0.7) * 2
    : 0;

  // Agent arm params: body half-width 22px, shoulder at y=-16, keyboard at y=16
  const agentArmParams = useMemo(
    () => ({
      bodyHalfWidth: (AGENT_WIDTH - STROKE_WIDTH) / 2,
      startY: -16,
      endY: 16,
      handColor: 0x1f2937,
    }),
    [],
  );

  // Arm draw callbacks
  const drawRightArmCallback = useCallback(
    (g: Graphics) =>
      drawRightArm(g, { ...agentArmParams, animOffset: rightArmOffset }),
    [agentArmParams, rightArmOffset],
  );

  const drawLeftArmCallback = useCallback(
    (g: Graphics) =>
      drawLeftArm(g, { ...agentArmParams, animOffset: leftArmOffset }),
    [agentArmParams, leftArmOffset],
  );

  return (
    <pixiContainer x={position.x} y={position.y}>
      <pixiGraphics draw={drawRightArmCallback} />
      <pixiGraphics draw={drawLeftArmCallback} />
    </pixiContainer>
  );
}

export const AgentArms = memo(AgentArmsComponent);

// ============================================================================
// AGENT HEADSET COMPONENT (rendered after arms for correct z-order)
// ============================================================================

export interface AgentHeadsetProps {
  position: Position;
  headsetTexture: Texture;
}

function AgentHeadsetComponent({
  position,
  headsetTexture,
}: AgentHeadsetProps): ReactNode {
  return (
    <pixiSprite
      texture={headsetTexture}
      anchor={0.5}
      x={position.x}
      y={position.y - 38}
      scale={{ x: 0.66825, y: 0.675 }}
    />
  );
}

export const AgentHeadset = memo(AgentHeadsetComponent);

// ============================================================================
// AGENT LABEL COMPONENT (rendered separately for z-ordering)
// ============================================================================

export interface AgentLabelProps {
  name: string;
  /** Full conversation name shown under the floor name (issue 360). */
  conversation?: string | null;
  position: Position;
  /** Issue 226 R4 (Sol): compact state/activity glyph above the name. */
  glyph?: string | null;
  /** Issue 226 R6 (operator): desk info + props. */
  task?: string | null;
  state?: string;
  isTyping?: boolean;
  /** ms since the agent's last real activity (idle -> sleeping Zzz). */
  idleMs?: number;
  /** true while the agent is away from its seat (break/consult -> coffee). */
  away?: boolean;
  /**
   * Issue 226 R6c (operator): the two Sol consultants always look busy -
   * permanent typing animation, no status text above them.
   */
  alwaysBusy?: boolean;
}

function AgentLabelComponent({
  name,
  conversation = null,
  position,
  glyph,
  task,
  state,
  isTyping = false,
  idleMs = 0,
  away = false,
  alwaysBusy = false,
}: AgentLabelProps): ReactNode {
  coMark("label");
  // Issue 226 R6 (operator): effect props from the upstream (MIT) effect set.
  const typingTex = usePixiTexture("/sprites/effects/typing.png");
  const sleepingTex = usePixiTexture("/sprites/effects/sleeping.png");
  const coffeeTex = usePixiTexture("/sprites/effects/need-coffee.png");

  const needsPermission = !alwaysBusy && state === "waiting_permission";
  const sleeping = !alwaysBusy && !isTyping && !away && idleMs > 3 * 60 * 1000;
  // Issue 226 R6d (operator): the Sols type only when they REALLY are -
  // permanent typing looks stupid. alwaysBusy still hides status text.
  const showTyping = isTyping;

  // Pulsing permission badge - driven straight on the node (no re-render).
  const alertRef = useRef<Container | null>(null);
  useTick((ticker) => {
    const node = alertRef.current;
    if (node) {
      node.alpha = 0.55 + 0.45 * Math.abs(Math.sin(ticker.lastTime / 550));
    }
  });

  const taskText = task ? (task.length > 34 ? task.slice(0, 33) + "\u2026" : task) : null;
  const convoText =
    conversation && conversation.length > 42
      ? conversation.slice(0, 41) + "\u2026"
      : conversation;
  const chipW = taskText ? Math.min(430, 60 + taskText.length * 12) : 0;

  return (
    // Issue 226 R4: label sits ABOVE the sprite head (133px tall) instead of
    // across the character's chest.
    <pixiContainer x={position.x} y={position.y - 152} scale={0.5}>
      <pixiText
        text={name}
        anchor={0.5}
        style={{
          fontFamily: "monospace",
          fontSize: 24,
          fill: 0xffffff,
          fontWeight: "bold",
          stroke: { width: 4, color: 0x000000 },
        }}
        resolution={2}
      />
      {convoText ? (
        <pixiText
          text={convoText}
          anchor={0.5}
          y={24}
          style={{
            fontFamily: "monospace",
            fontSize: 15,
            fill: 0x9fb3c8,
            stroke: { width: 3, color: 0x000000 },
          }}
          resolution={2}
        />
      ) : null}
      {convoText ? (
        <pixiText
          text={convoText}
          anchor={0.5}
          y={24}
          style={{
            fontFamily: "monospace",
            fontSize: 15,
            fill: 0x9fb3c8,
            stroke: { width: 3, color: 0x000000 },
          }}
          resolution={2}
        />
      ) : null}
      {glyph && !alwaysBusy ? (
        <pixiText
          text={glyph}
          anchor={0.5}
          y={-36}
          style={{ fontSize: 26 }}
          resolution={2}
        />
      ) : null}

      {/* Task chip - DARK MODE: muted text on a dark panel, never bright white
          on the room art (operator 2026-10-03). */}
      {taskText && !alwaysBusy ? (
        <pixiContainer y={-40}>
          <pixiGraphics
            draw={(g) => {
              g.clear();
              g.roundRect(-chipW / 2, -15, chipW, 30, 8);
              g.fill({ color: 0x0b0f16, alpha: 0.9 });
              g.stroke({ width: 2, color: 0x27313f });
            }}
          />
          <pixiText
            text={taskText}
            anchor={0.5}
            style={{
              fontFamily: "monospace",
              fontSize: 19,
              fill: 0x9fb0c3,
            }}
            resolution={2}
          />
        </pixiContainer>
      ) : null}

      {/* Permission-waiting alert: pulsing amber badge, the one state that
          needs the operator to act. */}
      {needsPermission ? (
        <pixiContainer ref={alertRef} y={-78}>
          <pixiGraphics
            draw={(g) => {
              g.clear();
              g.roundRect(-150, -19, 300, 38, 10);
              g.fill({ color: 0x2a1a05, alpha: 0.95 });
              g.stroke({ width: 3, color: 0xf59e0b });
            }}
          />
          <pixiText
            text="\u23f3 APPROVAL NEEDED"
            anchor={0.5}
            style={{
              fontFamily: "monospace",
              fontSize: 24,
              fill: 0xfbbf24,
              fontWeight: "bold",
            }}
            resolution={2}
          />
        </pixiContainer>
      ) : null}

      {/* Typing keyboard at the hands while tool-active. Local y 118 == seat
          y -34 (the container sits 152px above the feet). */}
      {/* Issue 226 R6c: big enough to actually read as typing. */}
      {showTyping && typingTex ? (
        <pixiSprite texture={typingTex} anchor={0.5} x={34} y={112} scale={0.85} />
      ) : null}

      {/* Coffee while away on a break / consult walk. */}
      {away && !isTyping && coffeeTex ? (
        <pixiSprite texture={coffeeTex} anchor={0.5} x={52} y={92} scale={0.45} />
      ) : null}

      {/* Sleeping Zzz after several idle minutes. */}
      {sleeping && sleepingTex ? (
        <pixiSprite texture={sleepingTex} anchor={0.5} x={56} y={-6} scale={0.45} />
      ) : null}
    </pixiContainer>
  );
}

export const AgentLabel = memo(AgentLabelComponent);

// Re-export Bubble (used by OfficeGame's top-level bubbles layer)
export { Bubble };

export const AgentSprite = memo(AgentSpriteComponent);
