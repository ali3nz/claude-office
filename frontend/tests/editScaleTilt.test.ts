import { describe, it, expect, beforeEach } from "vitest";
import {
  useOfficeEditStore,
  clampEntityScale,
  clampEntityTilt,
  MIN_ENTITY_SCALE,
  MAX_ENTITY_SCALE,
  MAX_ENTITY_TILT,
} from "@/stores/officeEditStore";

describe("entity scale/tilt clamps (issue 361)", () => {
  it("clamps sizes into range and recovers from garbage", () => {
    expect(clampEntityScale(1)).toBe(1);
    expect(clampEntityScale(0.1)).toBe(MIN_ENTITY_SCALE);
    expect(clampEntityScale(5)).toBe(MAX_ENTITY_SCALE);
    expect(clampEntityScale(Number.NaN)).toBe(1);
  });

  it("clamps slants into range and recovers from garbage", () => {
    expect(clampEntityTilt(10)).toBe(10);
    expect(clampEntityTilt(-45)).toBe(-MAX_ENTITY_TILT);
    expect(clampEntityTilt(45)).toBe(MAX_ENTITY_TILT);
    expect(clampEntityTilt(Number.NaN)).toBe(0);
  });
});

describe("resizeEntity / tiltEntity (issue 361)", () => {
  beforeEach(() => {
    useOfficeEditStore.setState({ overrides: {}, insertedEntities: [] });
  });

  it("grows and shrinks an inserted sprite within bounds", () => {
    const id = useOfficeEditStore
      .getState()
      .insertEntity("/sprites/interactive/whiteboard", 500, 500, "Board");
    const get = () =>
      useOfficeEditStore.getState().insertedEntities.find((e) => e.id === id)!;
    expect(get().scale ?? 1).toBe(1);
    useOfficeEditStore.getState().resizeEntity(id, -1);
    expect(get().scale).toBeCloseTo(0.9, 5);
    for (let i = 0; i < 30; i++) useOfficeEditStore.getState().resizeEntity(id, -1);
    expect(get().scale).toBe(MIN_ENTITY_SCALE);
    for (let i = 0; i < 40; i++) useOfficeEditStore.getState().resizeEntity(id, 1);
    expect(get().scale).toBe(MAX_ENTITY_SCALE);
  });

  it("tilts a built-in override both ways within bounds", () => {
    const store = useOfficeEditStore.getState();
    store.tiltEntity("desk-1", 1);
    expect(useOfficeEditStore.getState().overrides["desk-1"]?.tilt).toBe(5);
    store.tiltEntity("desk-1", -1);
    store.tiltEntity("desk-1", -1);
    expect(useOfficeEditStore.getState().overrides["desk-1"]?.tilt).toBe(-5);
    for (let i = 0; i < 20; i++) store.tiltEntity("desk-1", -1);
    expect(useOfficeEditStore.getState().overrides["desk-1"]?.tilt).toBe(
      -MAX_ENTITY_TILT,
    );
  });
});
