/**
 * isoDraw (issue 246 follow-up) - tiny isometric box helper used to draw the
 * pool table and couches as hard-edged pixel-style Graphics. 2:1 isometry:
 * s runs down-right, t runs down-left, z is up.
 */
import type { Graphics } from "pixi.js";

export interface IsoColors {
  top: number;
  left: number;
  right: number;
  edge: number;
}

export function isoPt(
  ox: number,
  oy: number,
  s: number,
  t: number,
  z: number,
): [number, number] {
  return [ox + (s - t), oy + (s + t) * 0.5 - z];
}

function face(g: Graphics, pts: [number, number][], fill: number, edge: number): void {
  g.poly(pts.flat()).fill(fill).stroke({ width: 1, color: edge });
}

/** Draw one box; visible faces are top, the t1 side (left) and s1 side (right). */
export function isoBox(
  g: Graphics,
  ox: number,
  oy: number,
  s0: number,
  s1: number,
  t0: number,
  t1: number,
  z0: number,
  z1: number,
  c: IsoColors,
): void {
  const P = (s: number, t: number, z: number) => isoPt(ox, oy, s, t, z);
  face(g, [P(s0, t1, z0), P(s1, t1, z0), P(s1, t1, z1), P(s0, t1, z1)], c.left, c.edge);
  face(g, [P(s1, t0, z0), P(s1, t1, z0), P(s1, t1, z1), P(s1, t0, z1)], c.right, c.edge);
  face(g, [P(s0, t0, z1), P(s1, t0, z1), P(s1, t1, z1), P(s0, t1, z1)], c.top, c.edge);
}

const WOOD: IsoColors = { top: 0x7a5233, left: 0x5e3d27, right: 0x472d1c, edge: 0x2e1c10 };
const LEG: IsoColors = { top: 0x4e382b, left: 0x3f2d22, right: 0x30221a, edge: 0x1f150f };
const LEATHER: IsoColors = { top: 0xa66b3d, left: 0x8a5530, right: 0x6d4224, edge: 0x3d2412 };
const CUSHION: IsoColors = { top: 0xbd7f4c, left: 0x9a6339, right: 0x7b4b2a, edge: 0x3d2412 };

/** Pool table: footprint 130 x 70, height 34, centred on (ox, oy). */
export function drawPoolTable(g: Graphics, ox: number, oy: number): void {
  g.clear();
  const a = 65;
  const b = 35;
  for (const [s, t] of [
    [-a + 4, -b + 4],
    [a - 14, -b + 4],
    [-a + 4, b - 14],
    [a - 14, b - 14],
  ]) {
    isoBox(g, ox, oy, s, s + 10, t, t + 10, 0, 26, LEG);
  }
  isoBox(g, ox, oy, -a, a, -b, b, 24, 34, WOOD);
  const P = (s: number, t: number, z = 34) => isoPt(ox, oy, s, t, z);
  const fa = 57;
  const fb = 27;
  g.poly([P(-fa, -fb), P(fa, -fb), P(fa, fb), P(-fa, fb)].flat()).fill(0x2f8f5b);
  g.poly([P(-fa, -fb), P(fa, -fb), P(fa, -fb, 31), P(-fa, -fb, 31)].flat()).fill(0x1f6b43);
  g.poly([P(-fa, -fb), P(-fa, fb), P(-fa, fb, 31), P(-fa, -fb, 31)].flat()).fill(0x256f48);
  g.poly([P(-fa + 6, -fb + 4), P(fa - 6, -fb + 4), P(fa - 6, fb - 4), P(-fa + 6, fb - 4)].flat())
    .stroke({ width: 1, color: 0x3aa56d });
  for (const [s, t] of [
    [-fa, -fb],
    [fa, -fb],
    [-fa, fb],
    [fa, fb],
    [0, -fb],
    [0, fb],
  ]) {
    const [px, py] = P(s, t);
    g.ellipse(px, py, 6, 3).fill(0x0d0d0d);
  }
  const balls = [0xe5c100, 0x1f4fbf, 0xc62828, 0x6a1b9a, 0xef6c00, 0x2e7d32, 0x8d1c1c, 0x111111, 0xe5c100, 0x1f4fbf];
  let n = 0;
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row <= col; row++) {
      const [px, py] = P(26 + col * 6, (row - col / 2) * 6);
      g.circle(px, py - 2, 2.6).fill(balls[n++ % balls.length]);
    }
  }
  const [cx, cy] = P(-26, 0);
  g.circle(cx, cy - 2, 2.6).fill(0xffffff);
  const [q0x, q0y] = P(-34, 0, 36);
  const [q1x, q1y] = P(-62, -6, 40);
  g.moveTo(q0x, q0y).lineTo(q1x, q1y).stroke({ width: 2, color: 0xd9b27c });
}

/** Couch: 90 x 40 footprint, back at t- (swap=false) or s- (swap=true). */
export function drawCouch(g: Graphics, ox: number, oy: number, swap: boolean): void {
  g.clear();
  const box = (s0: number, s1: number, t0: number, t1: number, z0: number, z1: number, c: IsoColors) =>
    swap
      ? isoBox(g, ox, oy, t0, t1, s0, s1, z0, z1, c)
      : isoBox(g, ox, oy, s0, s1, t0, t1, z0, z1, c);
  box(-45, 45, -20, -8, 10, 34, LEATHER); // back
  box(-45, 45, -20, 20, 0, 12, LEATHER); // base
  box(-45, -35, -20, 20, 0, 24, LEATHER); // far arm
  box(-35, 35, -8, 20, 12, 18, CUSHION); // seat cushion
  box(35, 45, -20, 20, 0, 24, LEATHER); // near arm
}
