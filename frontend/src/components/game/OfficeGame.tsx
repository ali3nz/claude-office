/**
 * OfficeGame - Main Game Canvas
 *
 * Main visualization component using:
 * - Centralized Zustand store
 * - XState state machines
 * - Single animation tick loop
 *
 * The component is purely for rendering - all state logic is in the store/machines.
 */

"use client";

import { Application, extend } from "@pixi/react";
import {
  Container,
  Text,
  Graphics,
  Sprite,
  Application as PixiApplication,
} from "pixi.js";
import {
  Component,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { useTick } from "@pixi/react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { useShallow } from "zustand/react/shallow";
import { performSoftReset, getHmrVersion } from "@/systems/hmrCleanup";

import {
  useGameStore,
  selectAgents,
  selectBoss,
  selectTodos,
  selectDebugMode,
  selectShowPaths,
  selectShowQueueSlots,
  selectShowPhaseLabels,
  selectShowObstacles,
  selectElevatorState,
  selectContextUtilization,
  selectIsCompacting,
  selectPrintReport,
} from "@/stores/gameStore";
import { useAnimationSystem } from "@/systems/animationSystem";
import { wireGameRuntime, unwireGameRuntime } from "@/systems/gameRuntime";
import { useCompactionAnimation } from "@/systems/compactionAnimation";
import { useOfficeTextures } from "@/hooks/useOfficeTextures";
import {
  getSpotForDesk,
  COFFEE_SPOT,
  WATER_SPOT,
  PINNED_SEATS,
} from "@/themes/w17ant-spots";
import { setBehavior, tickBehaviors, getOffset } from "@/systems/officeBehavior";
import { coMark } from "@/utils/coMark";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BACKGROUND_COLOR,
} from "@/constants/canvas";
import {
  EMPLOYEE_OF_MONTH_POSITION,
  CITY_WINDOW_POSITION,
  SAFETY_SIGN_POSITION,
  WALL_CLOCK_POSITION,
  WALL_OUTLET_POSITION,
  WHITEBOARD_POSITION,
  WATER_COOLER_POSITION,
  COFFEE_MACHINE_POSITION,
  PRINTER_STATION_POSITION,
  PLANT_POSITION,
  BOSS_RUG_POSITION,
  TRASH_CAN_OFFSET,
  DESKS_PER_ROW,
  MIN_DESK_COUNT,
} from "@/constants/positions";
import {
  AgentSprite,
  AgentArms,
  AgentHeadset,
  AgentLabel,
  Bubble as AgentBubble,
} from "./AgentSprite";
import { BossSprite, BossBubble, MobileBoss } from "./BossSprite";
import { useNavigationStore } from "@/stores/navigationStore";
import { LOBBY_FLOOR_ID } from "@/types/navigation";
import { ELEVATOR_POSITION, isInElevatorZone } from "@/systems/queuePositions";
import { TrashCanSprite } from "./TrashCanSprite";
import { WallClock } from "./WallClock";
import { Whiteboard } from "./Whiteboard";
import { SafetySign } from "./SafetySign";
import { CityWindow } from "./CityWindow";
import { EmployeeOfTheMonth } from "./EmployeeOfTheMonth";
import { Elevator, isAgentInElevator } from "./Elevator";
import { PrinterStation } from "./PrinterStation";
import { DebugOverlays } from "./DebugOverlays";
import {
  DeskSurfacesBase,
  DeskSurfacesTop,
  useDeskPositions,
} from "./DeskGrid";
import { ZoomControls } from "./ZoomControls";
import { LoadingScreen } from "./LoadingScreen";
import { OfficeBackground } from "./OfficeBackground";
import { DeskCluster, SolDesks, BossDesk } from "./OfficeDesks";
import {
  W17ANT_CAST_MODE,
  type OfficeFacing,
} from "@/themes/w17ant-cast";

// Application lifecycle sequencing for the black-floor diagnosis (issue 212,
// Sol-approved instrumentation only — no behavior change). Module scope so
// instance ids stay unique across remounts of this component.

// ---- Diagnostics probes (issue 212, Sol APPROVE C-first) -------------------
// Window-level breadcrumbs so a screenshot/console can answer: did the app
// initialize, was a renderer created, does its canvas match the DOM canvas,
// did the office subtree render/mount, and did any error occur. Write-only,
// no behaviour change.
type CoDiag = Record<string, unknown>;
function coDiag(): CoDiag | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __co?: CoDiag };
  if (!w.__co) w.__co = {};
  return w.__co;
}
function coSet(key: string, value: unknown): void {
  const d = coDiag();
  if (d && d[key] === undefined) d[key] = value;
}

if (typeof window !== "undefined") {
  const w = window as unknown as { __coListeners?: boolean };
  if (!w.__coListeners) {
    w.__coListeners = true;
    const d = coDiag();
    if (d) {
      d["errors"] = d["errors"] ?? [];
      const arr = d["errors"] as string[];
      const push = (s: string) => {
        if (arr.length < 24) arr.push(s.slice(0, 460));
      };
      const serialize = (x: unknown): string => {
        if (x instanceof Error) {
          const st =
            typeof x.stack === "string" ? x.stack.replace(/\s+/g, " ") : "";
          return (
            "Error:" +
            String(x.message).slice(0, 160) +
            (st ? " @ " + st.slice(0, 340) : "")
          );
        }
        if (typeof x === "object" && x !== null) {
          const info = x as { componentStack?: unknown };
          if (typeof info.componentStack === "string") {
            return "CS:" + info.componentStack.replace(/\s+/g, " ").slice(0, 400);
          }
          try {
            return JSON.stringify(x).slice(0, 340);
          } catch {
            return "[obj]";
          }
        }
        return String(x);
      };
      window.addEventListener("error", (e) =>
        push("win:" + serialize((e as ErrorEvent).error ?? e.message)),
      );
      window.addEventListener("unhandledrejection", (e) =>
        push("rej:" + serialize((e as PromiseRejectionEvent).reason)),
      );
      const orig = console.error;
      console.error = (...a: unknown[]) => {
        push("cerr:" + a.map(serialize).join(" | "));
        // Full React component stack kept separately (diagnostics): the joined
        // entry above is capped, the stack is the locator.
        for (const x of a) {
          if (
            x !== null &&
            typeof x === "object" &&
            typeof (x as { componentStack?: unknown }).componentStack === "string"
          ) {
            const cs = (x as { componentStack: string }).componentStack;
            const d2 = coDiag();
            if (d2 && d2["last_cs"] === undefined) {
              d2["last_cs"] = cs.slice(0, 4000);
            }
          }
        }
        return orig.apply(console, a);
      };
    }
  }
}

// Register PixiJS components
extend({ Container, Text, Graphics, Sprite });

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SubagentDotProps {
  x: number;
  y: number;
  color: string;
}

function SubagentDot({ x, y, color }: SubagentDotProps): ReactNode {
  const drawDot = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(0, 0, 4);
      // Safe hex parsing with fallback
      const hex = /^#[0-9a-fA-F]{6}$/.test(color)
        ? parseInt(color.slice(1), 16)
        : 0xf59e0b;
      g.fill({ color: hex });
      g.circle(0, 0, 4);
      g.stroke({ color: 0xffffff, alpha: 0.4, width: 1 });
    },
    [color],
  );

  return <pixiGraphics draw={drawDot} x={x} y={y} />;
}

function FloorSign({
  label,
  accent,
}: {
  label: string;
  accent: string;
}): ReactNode {
  coMark("floorsign");
  const w = 120;
  const h = 24;
  const drawSign = useCallback(
    (g: Graphics) => {
      g.clear();
      // Backing plate
      g.roundRect(-w / 2, -h / 2, w, h, 4);
      g.fill({ color: 0x1e1e1e, alpha: 0.9 });
      // Border
      g.roundRect(-w / 2, -h / 2, w, h, 4);
      const hex = /^#[0-9a-fA-F]{6}$/.test(accent)
        ? parseInt(accent.slice(1), 16)
        : 0x6366f1;
      g.stroke({ color: hex, width: 1.5, alpha: 0.7 });
    },
    [accent],
  );

  return (
    <pixiContainer x={ELEVATOR_POSITION.x} y={ELEVATOR_POSITION.y - 88}>
      <pixiGraphics draw={drawSign} />
      <pixiContainer scale={0.5}>
        <pixiText
          text={label}
          anchor={0.5}
          resolution={2}
          style={{
            fontSize: 18,
            fill: "#ffffff",
            fontFamily: "monospace",
            fontWeight: "bold",
          }}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

// Departing agents walk the old elevator/queue path, which is off the visible
// room now that the elevator art is gone: hide only those until they despawn.
// (Do NOT filter by position: arriving agents legitimately sit at (0,0) until
// the walk-in animation places them.)
const DEPARTING_PHASES = new Set([
  "departing",
  "in_departure_queue",
  "walking_to_elevator",
  "in_elevator",
]);

/**
 * Display position (issue 226): a settled agent (idle at its desk) is ALWAYS
 * drawn at its assigned workstation seat, so nobody can be left standing off
 * the floor by a stale animation position. Agents still walking/arriving keep
 * their animated position.
 */
function agentDisplayPosition(agent: {
  id: string;
  phase: string;
  name?: string | null;
  desk?: number | null;
  currentPosition: { x: number; y: number };
}): { x: number; y: number } {
  // Issue 226 R5: the two Sol gateway characters always sit at their own
  // corner workstations, outside the normal desk pool.
  if (agent.name && SOL_SEATS[agent.name]) {
    return SOL_SEATS[agent.name];
  }
  // Any agent with an assigned desk is ALWAYS drawn at that workstation. This
  // is deterministic and immune to arrival/animation timing: a fresh load can
  // never leave an assigned agent invisible at a spawn point. Agents the
  // backend did not desk get a computed free workstation (issue 226 R5).
  const deskNum = deskAssignmentCache.get(agent.id) ?? agent.desk;
  if (deskNum) {
    return getSpotForDesk(deskNum).position;
  }
  return agent.currentPosition;
}

/**
 * Issue 226 R4 (Sol): compact on-character state cue. isTyping is used as an
 * ACTIVITY cue (it wins); otherwise the authoritative backend state. Reuses
 * existing state - no new data source, no second panel.
 */
function agentStateGlyph(agent: {
  isTyping: boolean;
  backendState: string;
}): string | null {
  if (agent.isTyping) return "\u2328\ufe0f";
  switch (agent.backendState) {
    case "working":
      return "\u2699\ufe0f";
    case "thinking":
      return "\ud83e\udd14";
    case "waiting_permission":
      return "\u23f3";
    case "waiting":
    case "idle":
      return "\ud83d\udca4";
    case "reporting":
    case "reporting_done":
      return "\ud83d\udce3";
    case "completed":
      return "\u2705";
    default:
      return null;
  }
}

/**
 * Issue 226 R5 (operator): idle agents leave the floor after 10 minutes
 * without activity ("they can remain idle for only 10 minutes then
 * disappear unless the chat is reactivated"). The two Sol gateway characters
 * are ALWAYS present - they are infrastructure, not sessions.
 */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const ALWAYS_PRESENT = new Set([
  "Sol Docker",
  "Sol Webserver",
  "GhostReporting",
  "TruFreedom",
]);

function isRecentlyActive(
  agent: { name: string | null; lastActivityAt?: number },
  now: number,
): boolean {
  if (agent.name && ALWAYS_PRESENT.has(agent.name)) return true;
  if (!agent.lastActivityAt) return true;
  return now - agent.lastActivityAt < IDLE_TIMEOUT_MS;
}

/**
 * Issue 226 R5 (operator): desk-less agents used to stand on bare floor.
 * OfficeGame computes a deterministic desk per visible agent each render
 * (backend desk when valid, otherwise the lowest free workstation) and this
 * render-scoped cache lets the position helpers see it.
 */
let deskAssignmentCache = new Map<string, number>();

/** Dedicated corner seat per Sol gateway character (issue 226 R5). */
const SOL_SEATS: Record<string, { x: number; y: number }> = PINNED_SEATS;

/** Seat facing for an agent (Sol characters face into the room). */
function seatFacingFor(agent: {
  id: string;
  name: string | null;
  desk?: number | null;
}): OfficeFacing | undefined {
  if (agent.name === "Sol Docker") return "front-right";
  if (agent.name === "Sol Webserver") return "front-left";
  if (agent.name === "GhostReporting") return "front-right";
  if (agent.name === "TruFreedom") return "front-left";
  const deskNum = deskAssignmentCache.get(agent.id) ?? agent.desk;
  if (deskNum) return getSpotForDesk(deskNum).facing;
  return undefined;
}

/** Only agents on the room floor are drawn (departures and strays hidden). */
function isVisibleAgent(agent: {
  id: string;
  phase: string;
  name?: string | null;
  desk?: number | null;
  currentPosition: { x: number; y: number };
}): boolean {
  if (DEPARTING_PHASES.has(agent.phase)) return false;
  // Sol gateway corner workstations sit outside the main floor box on purpose.
  if (agent.name && SOL_SEATS[agent.name]) return true;
  // Agents with a desk are seated at a known-good workstation by construction
  // (issue 226 R5: this must actually SKIP the region test, or seats outside
  // the box - e.g. the Sol corners - are hidden). The computed assignment
  // counts too, so a backend desk-less agent still gets a real workstation.
  if (agent.desk || deskAssignmentCache.has(agent.id)) return true;
  const p = agentDisplayPosition(agent);
  return p.x >= 280 && p.x <= 1000 && p.y >= 400 && p.y <= 850;
}

// Issue 226 R3/R4: display-only movement group. Reads the behavior engine's
// current offset for an agent and applies it every frame (no React re-render),
// so the sprite and its label/bubble stay aligned.
function BehaviorGroup({
  id,
  baseX,
  baseY,
  zIndex,
  children,
}: {
  id: string;
  baseX: number;
  baseY: number;
  zIndex?: number;
  children: ReactNode;
}): ReactNode {
  const ref = useRef<Container | null>(null);
  useTick(() => {
    const off = getOffset(id);
    const node = ref.current;
    if (node) {
      node.x = baseX + off.x;
      node.y = baseY + off.y;
      // Issue 226 R4 (Sol): depth must follow the DISPLAYED world Y while an
      // agent walks across furniture rows, not the static seat Y.
      if (zIndex !== undefined) node.zIndex = zIndex + off.y;
    }
  });
  return (
    <pixiContainer ref={ref} x={baseX} y={baseY} zIndex={zIndex}>
      {children}
    </pixiContainer>
  );
}

/** Advances the display-only behavior engine once per rendered frame. */
function BehaviorTicker(): null {
  useTick((ticker) => tickBehaviors(ticker.deltaMS));
  return null;
}

// Office-subtree probe (Sol C-first): distinguishes render from mount.
function CoTreeProbe(): null {
  coSet("tree_render", "render");
  coMark("probe");
  useEffect(() => {
    coSet("tree_state", "mounted");
  }, []);
  return null;
}

// Catches render/lifecycle errors inside the office subtree (H2 evidence).
class CoErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    const key = this.props.label
      ? `pixi_error_${this.props.label}`
      : "pixi_error";
    coSet(key, String(error).slice(0, 300));
    coMark(`caught:${this.props.label ?? "outer"}`);
  }
  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OfficeGame(): ReactNode {
  // Track PixiJS app for cleanup
  const appRef = useRef<PixiApplication | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  // Keep the floor populated when nothing is connected (issue 212)
  // Ambient cast renders itself (render-only, Sol-approved); nothing to call here.

  // HMR version for forcing remount
  const hmrVersion = getHmrVersion();

  // Load all office textures
  const { textures, loaded: spritesLoaded } = useOfficeTextures();

  // Start animation system
  useAnimationSystem();

  // Wire the animation tick's listener to the agent-machine service (ARC-017).
  // Lives here rather than in useAnimationSystem so animationSystem never
  // imports agentMachineService at runtime (breaks the machines↔systems cycle).
  useEffect(() => {
    wireGameRuntime();
    return () => unwireGameRuntime();
  }, []);

  // Cleanup on unmount (HMR or navigation)
  useEffect(() => {
    return () => {
      // @pixi/react Application handles Pixi app destruction.
      // Only reset game systems to avoid double-destroy of the WebGL context.
      appRef.current = null;
      performSoftReset();
    };
  }, []);

  // Subscribe to store state
  const agents = useGameStore(useShallow(selectAgents));
  const boss = useGameStore(selectBoss);
  const todos = useGameStore(selectTodos);
  const debugMode = useGameStore(selectDebugMode);
  const showPaths = useGameStore(selectShowPaths);
  const showQueueSlots = useGameStore(selectShowQueueSlots);
  const showPhaseLabels = useGameStore(selectShowPhaseLabels);
  const showObstacles = useGameStore(selectShowObstacles);
  const elevatorState = useGameStore(selectElevatorState);
  const contextUtilization = useGameStore(selectContextUtilization);
  const isCompacting = useGameStore(selectIsCompacting);
  const printReport = useGameStore(selectPrintReport);

  // Floor info for elevator label
  const floorId = useNavigationStore((s) => s.floorId);
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const floor = useMemo(() => {
    if (floorId === LOBBY_FLOOR_ID) {
      return { name: "Lobby", icon: "\u{1F6AA}", accent: "#94a3b8" };
    }
    return buildingConfig?.floors.find((f) => f.id === floorId) ?? null;
  }, [floorId, buildingConfig]);

  // Compaction animation state
  const compactionAnimation = useCompactionAnimation();

  // Use store's elevator state (controlled by state machine)
  const isElevatorOpen = elevatorState === "open";

  // Calculate occupied desks
  const occupiedDesks = useMemo(() => {
    const desks = new Set<number>();
    for (const agent of agents.values()) {
      if (agent.desk && agent.phase === "idle") {
        desks.add(agent.desk);
      }
    }
    return desks;
  }, [agents]);

  // Calculate desk tasks for marquee display
  const deskTasks = useMemo(() => {
    const tasks = new Map<number, string>();
    for (const agent of agents.values()) {
      if (agent.desk && agent.phase === "idle") {
        const label = agent.currentTask || agent.name || "";
        if (label) tasks.set(agent.desk, label);
      }
    }
    return tasks;
  }, [agents]);

  // Desk count
  const deskCount = useMemo(() => {
    return Math.max(
      MIN_DESK_COUNT,
      Math.ceil(agents.size / DESKS_PER_ROW) * DESKS_PER_ROW,
    );
  }, [agents.size]);

  // Desk positions for Y-sorted rendering
  const deskPositions = useDeskPositions(deskCount, occupiedDesks);

  // Keyboard shortcuts for debug
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      if (e.key === "d" || e.key === "D") {
        useGameStore.getState().setDebugMode(!debugMode);
      }
      if (debugMode) {
        if (e.key === "p" || e.key === "P") {
          useGameStore.getState().toggleDebugOverlay("paths");
        }
        if (e.key === "q" || e.key === "Q") {
          useGameStore.getState().toggleDebugOverlay("queueSlots");
        }
        if (e.key === "l" || e.key === "L") {
          useGameStore.getState().toggleDebugOverlay("phaseLabels");
        }
        if (e.key === "o" || e.key === "O") {
          useGameStore.getState().toggleDebugOverlay("obstacles");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [debugMode]);

  // Reset pan/zoom only on actual window resize — NOT on container reflows.
  // ResizeObserver was causing progressive canvas drift because the event log
  // and sidebar content changes triggered micro-resizes on every update.
  useEffect(() => {
    const handleResize = () => transformRef.current?.resetTransform(0);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Diagnostics (Sol C-first): first gate-open marker for evidence ordering.
  if (typeof window !== "undefined" && spritesLoaded) coSet("gate_open", "yes");
  if (typeof window !== "undefined" && spritesLoaded) coMark("gate-render");

  // Issue 226 R5: periodic re-render so agents idle >10 min leave the floor
  // without needing an unrelated store update to trigger a render.
  const [idleTick, setIdleTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setIdleTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const visibleAgents = useMemo(
    () =>
      Array.from(agents.values()).filter((a) =>
        isRecentlyActive(a, idleTick),
      ),
    [agents, idleTick],
  );

  // Issue 226 R5 (operator): render only OCCUPIED desks, and only the desks
  // belonging to pinned identities that are actually on the floor.
  const deskAssignments = useMemo(() => {
    const used = new Set<number>();
    const map = new Map<string, number>();
    const freeDesk = (): number | null => {
      for (let n = 1; n <= 10; n++) if (!used.has(n)) return n;
      return null;
    };
    for (const a of visibleAgents) {
      if (a.name && PINNED_SEATS[a.name]) continue; // pinned: own desk/seat
      if (a.desk && !used.has(a.desk)) {
        used.add(a.desk);
        map.set(a.id, a.desk);
      }
    }
    for (const a of visibleAgents) {
      if (map.has(a.id) || (a.name && PINNED_SEATS[a.name])) continue;
      const n = freeDesk();
      if (n !== null) {
        used.add(n);
        map.set(a.id, n);
      }
    }
    return map;
  }, [visibleAgents]);
  deskAssignmentCache = deskAssignments;
  const occupiedDeskNumbers = useMemo(
    () => new Set<number>(deskAssignments.values()),
    [deskAssignments],
  );
  const presentPinned = useMemo(() => {
    const s = new Set<string>();
    for (const a of visibleAgents) {
      if (a.name && PINNED_SEATS[a.name]) s.add(a.name);
    }
    return s;
  }, [visibleAgents]);

  // Issue 226 R3/R4: derive each real agent's display behavior from state it
  // already has (no new authoritative source): consult agents walk to a Sol
  // gateway character; idle agents take coffee/water breaks; everyone else
  // stays at their workstation. Presentation only.
  useEffect(() => {
    const list = Array.from(agents.values());
    const sols = list.filter(
      (a) => a.name === "Sol Docker" || a.name === "Sol Webserver",
    );
    const hashId = (id: string) => {
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
      return Math.abs(h);
    };
    for (const a of list) {
      // Issue 226 R4 (Sol): the behavior engine's seat MUST be the same
      // absolute coordinate the render anchor uses (agentDisplayPosition =
      // desk seat), never the animated currentPosition. Offsets stay relative
      // to that seat; targets stay absolute.
      const seat = agentDisplayPosition(a);
      const hay = `${a.name ?? ""} ${a.currentTask ?? ""} ${
        a.bubble.content?.text ?? ""
      }`.toLowerCase();
      const isSol = a.name === "Sol Docker" || a.name === "Sol Webserver";
      const consulting = !isSol && /consult|\bsol\b/.test(hay) && sols.length > 0;
      if (consulting) {
        const sol = sols[hashId(a.id) % sols.length];
        const solSeat = agentDisplayPosition(sol);
        setBehavior(a.id, {
          mode: "consult",
          seat,
          target: { x: solSeat.x + 30, y: solSeat.y + 8 },
        });
      } else if (!isSol && a.phase === "idle") {
        setBehavior(a.id, {
          mode: "break",
          seat,
          target: hashId(a.id) % 2 === 0 ? COFFEE_SPOT : WATER_SPOT,
        });
      } else {
        setBehavior(a.id, { mode: "seat", seat, target: null });
      }
    }
  }, [agents]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative">
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={1}
        maxScale={3}
        centerZoomedOut={false}
        limitToBounds={false}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ mode: "reset" }}
        onTransform={(ref, state) => {
          // Auto-reset pan offset when zooming back out to 1:1
          if (
            state.scale <= 1 &&
            (state.positionX !== 0 || state.positionY !== 0)
          ) {
            ref.resetTransform(0);
          }
        }}
      >
        <ZoomControls />
        <TransformComponent
          wrapperClass="w-full h-full"
          contentClass="w-full h-full"
        >
          <div className="pixi-canvas-container w-full h-full relative">
            <Application
              key={`pixi-app-${hmrVersion}`}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              backgroundColor={BACKGROUND_COLOR}
              autoDensity={true}
              resolution={
                typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
              }
              onInit={(app) => {
                appRef.current = app;
                // Diagnostics (Sol C-first, invisible): app/canvas identity.
                try {
                  const appCanvas = (app as unknown as { canvas?: unknown })
                    .canvas;
                  const domCanvas = document.querySelector(
                    ".pixi-canvas-container canvas",
                  );
                  const allCanvases = document.querySelectorAll("canvas");
                  coSet("app_state", "initialized");
                  coSet(
                    "renderer_canvas_is_dom_canvas",
                    appCanvas != null && appCanvas === domCanvas,
                  );
                  coSet(
                    "app_canvas_tag",
                    (appCanvas as HTMLElement)?.tagName ?? "none",
                  );
                  coSet("dom_canvas_count", allCanvases.length);
                } catch (err) {
                  coSet("oninit_probe_error", String(err).slice(0, 200));
                }
              }}
            >
              {/* Loading screen - shown while sprites are loading */}
              {!spritesLoaded && <LoadingScreen />}

              {/* Office content - hidden while loading */}
              {spritesLoaded && (
                <CoErrorBoundary>
                  <>
                  <CoTreeProbe />
                  <BehaviorTicker />
                  {/* Floor and walls */}
                  <CoErrorBoundary label="bg">
                    <OfficeBackground floorTileTexture={textures.floorTile} />
                  </CoErrorBoundary>

                  {/* Boss area rug (legacy theme) - rendered right after floor */}
                  {!W17ANT_CAST_MODE && textures.bossRug && (
                    <pixiSprite
                      texture={textures.bossRug}
                      anchor={0.5}
                      x={BOSS_RUG_POSITION.x}
                      y={BOSS_RUG_POSITION.y}
                      scale={0.3}
                    />
                  )}

                  {/* Wall decorations (legacy theme; hidden under DM room art) */}
                  {W17ANT_CAST_MODE ? null : (
                    <>
                      <pixiContainer
                        x={EMPLOYEE_OF_MONTH_POSITION.x}
                        y={EMPLOYEE_OF_MONTH_POSITION.y}
                      >
                        <EmployeeOfTheMonth />
                      </pixiContainer>
                      <pixiContainer
                        x={CITY_WINDOW_POSITION.x}
                        y={CITY_WINDOW_POSITION.y}
                      >
                        <CityWindow />
                      </pixiContainer>
                      <pixiContainer
                        x={SAFETY_SIGN_POSITION.x}
                        y={SAFETY_SIGN_POSITION.y}
                      >
                        <SafetySign />
                      </pixiContainer>
                      <pixiContainer
                        x={WALL_CLOCK_POSITION.x}
                        y={WALL_CLOCK_POSITION.y}
                      >
                        <WallClock />
                      </pixiContainer>
                      {/* Wall outlet below clock */}
                      {textures.wallOutlet && (
                        <pixiSprite
                          texture={textures.wallOutlet}
                          anchor={0.5}
                          x={WALL_OUTLET_POSITION.x}
                          y={WALL_OUTLET_POSITION.y}
                          scale={0.04}
                        />
                      )}
                      <pixiContainer
                        x={WHITEBOARD_POSITION.x}
                        y={WHITEBOARD_POSITION.y}
                      >
                        <Whiteboard todos={todos} />
                      </pixiContainer>
                      {textures.waterCooler && (
                        <pixiSprite
                          texture={textures.waterCooler}
                          anchor={0.5}
                          x={WATER_COOLER_POSITION.x}
                          y={WATER_COOLER_POSITION.y}
                          scale={0.198}
                        />
                      )}
                      {/* Coffee machine - to the right of water cooler */}
                      {textures.coffeeMachine && (
                        <pixiSprite
                          texture={textures.coffeeMachine}
                          anchor={0.5}
                          x={COFFEE_MACHINE_POSITION.x}
                          y={COFFEE_MACHINE_POSITION.y}
                          scale={0.1}
                        />
                      )}

                      {/* Printer station - bottom left corner */}
                      {/* Only print after boss delivers the completion message */}
                      <PrinterStation
                        x={PRINTER_STATION_POSITION.x}
                        y={PRINTER_STATION_POSITION.y}
                        isPrinting={
                          printReport && !isCompacting && !!boss.bubble.content
                        }
                        deskTexture={textures.desk}
                        printerTexture={textures.printer}
                      />

                      {/* Plant - to the right of printer */}
                      {textures.plant && (
                        <pixiSprite
                          texture={textures.plant}
                          anchor={0.5}
                          x={PLANT_POSITION.x}
                          y={PLANT_POSITION.y}
                          scale={0.1}
                        />
                      )}
                    </>
                  )}

                  {/* Elevator art + floor sign removed (issue 226): they sat
                      oddly on the DM wall. Arrival/departure logic is unchanged. */}

                  {/* Y-sorted layer: chairs and agents sorted by Y position (higher Y = in front) */}
                  <CoErrorBoundary label="ysort">
                  <pixiContainer sortableChildren={true}>
                    {/* W17ant workstations (desks with computers), z-sorted with agents */}
                    {W17ANT_CAST_MODE && (
                      <DeskCluster occupied={occupiedDeskNumbers} />
                    )}
                    {/* Desk chairs (legacy theme; the DM art has its own desks) */}
                    {!W17ANT_CAST_MODE &&
                      deskPositions.map((desk, i) => {
                        const chairZIndex = desk.y + 20;
                        return (
                          <pixiContainer
                            key={`chair-${i}`}
                            x={desk.x}
                            y={desk.y}
                            zIndex={chairZIndex}
                          >
                            {textures.chair && (
                              <pixiSprite
                                texture={textures.chair}
                                anchor={0.5}
                                x={0}
                                y={30}
                                scale={0.1386}
                              />
                            )}
                          </pixiContainer>
                        );
                      })}

                    {/* Agents outside elevator - zIndex based on feet Y position */}
                    {visibleAgents
                      .filter((agent) => isVisibleAgent(agent))
                      .map((agent) => (
                        <BehaviorGroup
                          key={agent.id}
                          id={agent.id}
                          baseX={agentDisplayPosition(agent).x}
                          baseY={agentDisplayPosition(agent).y}
                          zIndex={
                            agentDisplayPosition(agent).y +
                            (agent.phase === "idle" ? 60 : 0)
                          }
                        >
                          <AgentSprite
                            id={agent.id}
                            name={agent.name}
                            color={agent.color}
                            number={agent.number}
                            position={{ x: 0, y: 0 }}
                            worldPosition={agentDisplayPosition(agent)}
                            phase={agent.phase}
                            bubble={agent.bubble.content}
                            headsetTexture={textures.headset}
                            sunglassesTexture={textures.sunglasses}
                            renderBubble={false}
                            renderLabel={false}
                            isTyping={agent.isTyping}
                            seatFacing={seatFacingFor(agent)}
                          />
                        </BehaviorGroup>
                      ))}
                  </pixiContainer>
                  </CoErrorBoundary>
                  {/* Desk surfaces and keyboards (legacy theme; DM art has its own) */}
                  {!W17ANT_CAST_MODE && (
                    <DeskSurfacesBase
                      deskCount={deskCount}
                      occupiedDesks={occupiedDesks}
                      deskTexture={textures.desk}
                      keyboardTexture={textures.keyboard}
                    />
                  )}

                  {/* Agent arms - rendered after desk/keyboard, before headsets */}
                  {/* Hidden under the DM art: cast sprites already include arms */}
                  {!W17ANT_CAST_MODE &&
                    visibleAgents
                      .filter((agent) => agent.phase === "idle")
                      .map((agent) => (
                        <AgentArms
                          key={`arms-${agent.id}`}
                          position={agent.currentPosition}
                          isTyping={agent.isTyping}
                        />
                      ))}

                  {/* Agent headsets (legacy theme; cast sprites have their own) */}
                  {!W17ANT_CAST_MODE &&
                    textures.headset &&
                    visibleAgents
                      .filter((agent) => agent.phase === "idle")
                      .map((agent) => (
                        <AgentHeadset
                          key={`headset-${agent.id}`}
                          position={agent.currentPosition}
                          headsetTexture={textures.headset!}
                        />
                      ))}

                  {/* Monitors and decorations (legacy theme; DM art has its own) */}
                  {!W17ANT_CAST_MODE && (
                    <DeskSurfacesTop
                      deskCount={deskCount}
                      occupiedDesks={occupiedDesks}
                      deskTasks={deskTasks}
                      monitorTexture={textures.monitor}
                      coffeeMugTexture={textures.coffeeMug}
                      staplerTexture={textures.stapler}
                      deskLampTexture={textures.deskLamp}
                      penHolderTexture={textures.penHolder}
                      magic8BallTexture={textures.magic8Ball}
                      rubiksCubeTexture={textures.rubiksCube}
                      rubberDuckTexture={textures.rubberDuck}
                      thermosTexture={textures.thermos}
                    />
                  )}

                  {/* Boss desk (W17ant workstation, drawn behind the boss) */}
                  {W17ANT_CAST_MODE && <BossDesk />}

                  {/* Persistent-identity workstations (issue 226 R5) */}
                  {W17ANT_CAST_MODE && <SolDesks present={presentPinned} />}

                  {/* Boss character removed (issue 226): only real agents
                      appear on the floor. His workstation stays as furniture. */}

                  {/* Mobile boss removed (issue 226): not a real agent. */}

                  {/* Trash Can (Context Utilization Indicator) - follows boss desk */}
                  <CoErrorBoundary label="trash">
                    <TrashCanSprite
                      x={boss.position.x + TRASH_CAN_OFFSET.x * 0.4}
                      y={boss.position.y + TRASH_CAN_OFFSET.y * 0.4}
                      contextUtilization={
                        compactionAnimation.phase !== "idle"
                          ? compactionAnimation.animatedContextUtilization
                          : contextUtilization
                      }
                      isCompacting={isCompacting}
                      isStomping={compactionAnimation.isStomping}
                    />
                  </CoErrorBoundary>

                  {/* Debug overlays */}
                  {debugMode && (
                    <DebugOverlays
                      showPaths={showPaths}
                      showQueueSlots={showQueueSlots}
                      showPhaseLabels={showPhaseLabels}
                      showObstacles={showObstacles}
                    />
                  )}

                  {/* Debug mode indicator */}
                  {debugMode && (
                    <pixiText
                      text="DEBUG MODE (D=toggle, P=paths, Q=queue, L=labels, O=obstacles, T=time)"
                      x={10}
                      y={10}
                      style={{
                        fontSize: 12,
                        fill: 0x00ff00,
                        fontFamily: "monospace",
                      }}
                    />
                  )}

                  {/* Labels Layer - rendered on top of most things */}
                  {visibleAgents
                    .filter((agent) => agent.name && isVisibleAgent(agent))
                    .map((agent) => (
                      <BehaviorGroup
                        key={`label-${agent.id}`}
                        id={agent.id}
                        baseX={agentDisplayPosition(agent).x}
                        baseY={agentDisplayPosition(agent).y}
                      >
                        <AgentLabel
                          name={agent.name!}
                          position={{ x: 0, y: 0 }}
                          glyph={agentStateGlyph(agent)}
                        />
                      </BehaviorGroup>
                    ))}

                  {/* Character Type Overlays - crown/badge/dot per agent type */}
                  {visibleAgents
                    .filter(
                      (agent) =>
                        agent.characterType &&
                        !isInElevatorZone(agent.currentPosition),
                    )
                    .map((agent) => (
                      <pixiContainer
                        key={`chartype-${agent.id}`}
                        zIndex={agent.currentPosition.y + 20}
                      >
                        {/* Lead crown overlay */}
                        {agent.characterType === "lead" && (
                          <pixiText
                            text="👑"
                            style={{ fontSize: 14 }}
                            x={agent.currentPosition.x - 8}
                            y={agent.currentPosition.y - 52}
                          />
                        )}

                        {/* Teammate badge + nameplate overlay */}
                        {agent.characterType === "teammate" && (
                          <>
                            <pixiText
                              text="🎖️"
                              style={{ fontSize: 10 }}
                              x={agent.currentPosition.x - 6}
                              y={agent.currentPosition.y - 46}
                            />
                            {agent.name && (
                              <pixiText
                                text={agent.name}
                                style={{
                                  fontSize: 7,
                                  fill: agent.color ?? "#3b82f6",
                                  fontFamily: "monospace",
                                  fontWeight: "bold",
                                }}
                                x={agent.currentPosition.x - 18}
                                y={agent.currentPosition.y - 34}
                              />
                            )}
                          </>
                        )}

                        {/* Subagent shoulder dot */}
                        {agent.characterType === "subagent" &&
                          (() => {
                            const parentAgent = agent.parentId
                              ? Array.from(agents.values()).find(
                                  (a) => a.id === agent.parentId,
                                )
                              : null;
                            const dotColor = parentAgent?.color ?? "#f59e0b";
                            return (
                              <SubagentDot
                                key={`dot-${agent.id}`}
                                x={agent.currentPosition.x + 10}
                                y={agent.currentPosition.y - 28}
                                color={dotColor}
                              />
                            );
                          })()}
                      </pixiContainer>
                    ))}

                  {/* Bubbles Layer - rendered on top of everything */}
                  {visibleAgents
                    .filter(
                      (agent) =>
                        agent.bubble.content &&
                        !isInElevatorZone(agent.currentPosition),
                    )
                    .map((agent) => (
                      <BehaviorGroup
                        key={`bubble-${agent.id}`}
                        id={agent.id}
                        baseX={agentDisplayPosition(agent).x}
                        baseY={agentDisplayPosition(agent).y}
                      >
                        <AgentBubble
                          content={agent.bubble.content!}
                          yOffset={-80}
                        />
                      </BehaviorGroup>
                    ))}
                  {/* Boss bubble removed with the boss character (issue 226). */}
                  </>
                </CoErrorBoundary>
              )}
            </Application>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
