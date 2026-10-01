/**
 * Orchestra Office theme — isolated visual customization for the Duo
 * deployment (plan sections 16/23). All Duo palette choices live here;
 * scene components import from this module instead of hardcoding colors,
 * so future upstream merges only ever conflict in this one file.
 *
 * Warm overhead-office palette ported from W17ant/Claude-Office (MIT,
 * 2026 W17ANT) — dark wood floor, deep walls with a warm desk band, soft
 * warm lamp pools and cool monitor glow. No W17ant assets are copied; only
 * color values in the spirit of its atmosphere are referenced, with
 * attribution retained here per the MIT license notice requirement.
 */

export const ORCHESTRA_PALETTE = {
  /** Page/canvas backdrop behind the office scene. */
  background: 0x14100c,
  /** Office floor base (W17ant --floor #2a2520). */
  floor: 0x2a2520,
  /** Checkerboard alternate-tile darkening (warm, not gray). */
  floorTileDark: 0x241f1b,
  /** Office walls (W17ant --wall #1a1510). */
  wall: 0x1a1510,
  /** Wall trim / border line (W17ant --wall-border #4a3a28). */
  wallTrim: 0x4a3a28,
  /** Desk band along the wall (W17ant --desk-wood #5c3d1e). */
  deskWood: 0x5c3d1e,
  /** Desk band top highlight (W17ant --desk-wood-light #7a5230). */
  deskWoodLight: 0x7a5230,
  /** Warm lamp glow along the desk band (W17ant --glow-warm). */
  glowWarm: 0xffb43c,
  glowWarmAlpha: 0.12,
  /** Cool monitor glow patches on desks (W17ant --glow-monitor). */
  glowMonitor: 0x2878ff,
  glowMonitorAlpha: 0.2,
} as const;

export type OrchestraPalette = typeof ORCHESTRA_PALETTE;
