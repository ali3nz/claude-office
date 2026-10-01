/**
 * Orchestra Office theme — isolated visual customization for the Duo
 * deployment (plan sections 16/23). All Duo palette choices live here;
 * scene components import from this module instead of hardcoding colors,
 * so future upstream merges only ever conflict in this one file.
 *
 * Warm isometric palette inspired by W17ant/Claude-Office (MIT, 2026 W17ANT:
 * floor #2a2520, wall #1a1510, trim #4a3a28). No W17ant assets are copied;
 * only color values in the spirit of its atmosphere are referenced, with
 * attribution retained here per the MIT license notice requirement.
 */

export const ORCHESTRA_PALETTE = {
  /** Page/canvas backdrop behind the office scene. */
  background: 0x14100c,
  /** Office floor base. */
  floor: 0x2a2520,
  /** Office walls. */
  wall: 0x1a1510,
  /** Wall trim line. */
  wallTrim: 0x4a3a28,
} as const;

export type OrchestraPalette = typeof ORCHESTRA_PALETTE;
