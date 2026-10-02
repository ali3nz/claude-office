/**
 * RenderStatus — tiny DOM render-status readout (issue 212, Sol-approved).
 *
 * Lives OUTSIDE the <Application> tree so it stays visible even when the
 * Pixi stage fails. Permanent but unobtrusive: one badge line normally,
 * auto-expanded full fields on failure. Diagnostic only — nothing here is
 * transmitted anywhere, and timeout/stall signals never masquerade as
 * init rejection (see RenderInitState semantics).
 */

"use client";

import { memo, useEffect, useState, type ReactNode } from "react";

export type RendererKind = "webgl" | "webgpu" | "unknown" | null;

export interface RenderInitState {
  entered: boolean;
  enteredAt: number;
  resolved: boolean;
  rejected: boolean;
  errorStep: string | null;
  errorMessage: string | null;
}

export interface RenderAssetState {
  spritesLoaded: boolean;
  texturesLoaded: number;
  texturesFailed: number;
  timeoutFired: boolean;
}

/** Derive renderer kind from a resolved Pixi Application renderer object. */
export function normalizeRendererType(renderer: unknown): Exclude<RendererKind, null> {
  if (!renderer || typeof renderer !== "object") return "unknown";
  const t = (renderer as { type?: unknown }).type;
  if (typeof t === "string") {
    const lowered = t.toLowerCase();
    if (lowered.includes("webgl")) return "webgl";
    if (lowered.includes("webgpu")) return "webgpu";
  }
  const ctorName = (renderer as { constructor?: { name?: unknown } })
    .constructor?.name;
  if (typeof ctorName === "string") {
    if (/webgl/i.test(ctorName)) return "webgl";
    if (/webgpu/i.test(ctorName)) return "webgpu";
  }
  return "unknown";
}

const FAIL_AFTER_MS = 30000;

interface RenderStatusProps {
  init: RenderInitState;
  rendererType: RendererKind;
  assets: RenderAssetState;
  buildCommit: string;
}

function RenderStatusComponent({
  init,
  rendererType,
  assets,
  buildCommit,
}: RenderStatusProps): ReactNode {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (init.resolved || init.rejected) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [init.resolved, init.rejected]);

  const stalled =
    init.entered && !init.resolved && !init.rejected && now - init.enteredAt > FAIL_AFTER_MS;
  const failed = init.rejected || stalled;
  const dot = !init.entered ? "⚪" : init.rejected ? "🔴" : init.resolved ? "🟢" : stalled ? "🟠" : "🟡";
  const summary = !init.entered
    ? "render: not started"
    : init.rejected
      ? "render: init FAILED"
      : init.resolved
        ? `render:${rendererType ?? "unknown"}`
        : stalled
          ? "render: init stalled"
          : "render: starting…";

  return (
    <div
      data-testid="render-status"
      className="absolute top-2 left-2 z-30 pointer-events-none font-mono text-[11px] leading-tight"
    >
      <div className="px-2 py-1 rounded bg-slate-900/85 border border-slate-700 text-slate-300">
        {dot} {summary} · assets {assets.texturesLoaded}/
        {assets.texturesLoaded + assets.texturesFailed}
        {assets.timeoutFired ? " · ASSET-TIMEOUT" : ""} · {buildCommit}
      </div>
      {failed && (
        <div className="mt-1 px-2 py-1 rounded bg-slate-900/90 border border-red-800 text-slate-300 whitespace-pre-wrap max-w-[330px]">
          {`init: entered=${String(init.entered)} resolved=${String(init.resolved)} rejected=${String(init.rejected)}${stalled ? " STALLED>30s" : ""}\nstep: ${init.errorStep ?? "—"}\nerror: ${init.errorMessage ?? "—"}\nrenderer: ${rendererType ?? "null"}\nassets: loaded=${assets.spritesLoaded} ok=${assets.texturesLoaded} failed=${assets.texturesFailed} timeout=${String(assets.timeoutFired)}\nbuild: ${buildCommit}`}
        </div>
      )}
    </div>
  );
}

export const RenderStatus = memo(RenderStatusComponent);
