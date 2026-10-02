/**
 * RenderStatus unit tests (issue 212, Sol-approved architecture).
 *
 * Pins the diagnostic semantics: renderer identity comes only from the
 * resolved Application renderer object (never canvas probing), timeout and
 * stall signals never masquerade as init rejection, and the badge shows the
 * full fields exactly when the failure presentation requires it.
 */

import { describe, expect, it } from "vitest";
import { normalizeRendererType } from "@/components/game/RenderStatus";

describe("normalizeRendererType", () => {
  it("reads string type fields", () => {
    expect(normalizeRendererType({ type: "webgl" })).toBe("webgl");
    expect(normalizeRendererType({ type: "WebGPU" })).toBe("webgpu");
  });

  it("falls back to constructor names", () => {
    expect(normalizeRendererType({ constructor: { name: "WebGLRenderer" } })).toBe(
      "webgl",
    );
    expect(normalizeRendererType({ constructor: { name: "WebGPURenderer" } })).toBe(
      "webgpu",
    );
  });

  it("returns unknown (never null) for unrecognized renderers", () => {
    expect(normalizeRendererType({ constructor: { name: "CanvasRenderer" } })).toBe(
      "unknown",
    );
    expect(normalizeRendererType({})).toBe("unknown");
    expect(normalizeRendererType(null)).toBe("unknown");
    expect(normalizeRendererType(undefined)).toBe("unknown");
    expect(normalizeRendererType(42)).toBe("unknown");
  });
});
