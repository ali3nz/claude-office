/**
 * W17ant Office theme — the real Dunder Mifflin port (issue 212).
 *
 * Ported from github://W17ant/Claude-Office (reference clone:
 * dockerhost:/home/ali3nz/docker/reference/claude-office-w17ant, src/theme.ts).
 * Cast sprites: /sprites/office/characters/{slug}-{front|rear}-{left|right}.png
 * Room art:     /rooms/office-day-dm.png | /rooms/office-night-dm.png
 */

export type OfficeFacing =
  | "front-left"
  | "front-right"
  | "rear-left"
  | "rear-right";

/** The 27 Office cast members shipped by W17ant. */
export const OFFICE_CHARACTERS = [
  "andy-bernard",
  "angela-martin",
  "bob-vance",
  "carol-stills",
  "creed-bratton",
  "darryl-philbin",
  "david-wallace",
  "dwight-schrute",
  "erin-hannon",
  "gabe-lewis",
  "holly-flax",
  "jan-levinson",
  "jim-halpert",
  "karen-filippelli",
  "kelly-kapoor",
  "kevin-malone",
  "meredith-palmer",
  "michael-scott",
  "nellie-bertram",
  "oscar-martinez",
  "pam-beesly",
  "phyllis-vance",
  "robert-california",
  "roy-anderson",
  "ryan-howard",
  "stanley-hudson",
  "toby-flenderson",
] as const;

export type OfficeCharacter = (typeof OFFICE_CHARACTERS)[number];

/** Fixed casting (W17ant rule): boss is Michael, the assistant is Jim. */
const FIXED_ROLE_CASTING: Record<string, string> = {
  boss: "michael-scott",
  assistant: "jim-halpert",
};

/** Stable hash so a role always gets the same cast member (fleet display stays consistent). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const castByRole = new Map<string, string>();

/**
 * Assign (or return the existing) Office character for a role.
 * Deterministic: same role string → same character across reloads.
 */
export function getCharacterBaseForRole(role: string): string {
  const existing = castByRole.get(role);
  if (existing) return existing;

  const fixed = FIXED_ROLE_CASTING[role];
  if (fixed) {
    castByRole.set(role, fixed);
    return fixed;
  }

  const used = new Set(castByRole.values());
  const reservedNotYetUsed = new Set(
    Object.values(FIXED_ROLE_CASTING).filter((c) => !used.has(c)),
  );
  const pool = OFFICE_CHARACTERS.filter(
    (c) => !used.has(c) && !reservedNotYetUsed.has(c),
  );
  const chosen =
    pool.length > 0
      ? pool[hashString(role) % pool.length]
      : OFFICE_CHARACTERS[hashString(role) % OFFICE_CHARACTERS.length];
  castByRole.set(role, chosen);
  return chosen;
}

/** Reset casting (tests / HMR). */
export function resetCast(): void {
  castByRole.clear();
}

/**
 * Cast a floor agent (no role concept in the deployed backend) to an Office
 * character. Stable per agent id (same agent = same character across
 * reloads); Michael Scott is reserved for the boss.
 */
export function getCastForAgent(agentId: string): string {
  const existing = castByRole.get(`agent:${agentId}`);
  if (existing) return existing;
  const pool = OFFICE_CHARACTERS.filter((c) => c !== "michael-scott");
  const chosen = pool[hashString(agentId) % pool.length];
  castByRole.set(`agent:${agentId}`, chosen);
  return chosen;
}

/**
 * Facing from movement delta (W17ant Character.tsx getDirectionFromDelta,
 * isometric mapping):
 *   up-right → front-left, up-left → front-right,
 *   down-right → rear-left, down-left → front-left.
 */
export function getFacingFromDelta(dx: number, dy: number): OfficeFacing {
  if (dy < 0 && dx >= 0) return "front-left";
  if (dy < 0 && dx < 0) return "front-right";
  if (dy >= 0 && dx >= 0) return "rear-left";
  return "front-left";
}

/** True once the port is active (callers gate legacy capsule-only extras). */
export const W17ANT_CAST_MODE = true;

/** Human name for a slug: "pam-beesly" → "Pam Beesly". */
export function displayNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Sprite URL for a cast member facing a direction. */
export function officeSpritePath(
  slug: string,
  facing: OfficeFacing = "front-right",
): string {
  return `/sprites/office/characters/${slug}-${facing}.png`;
}

/** Boss (Michael Scott) sprite — always front-right at the desk. */
export const BOSS_SLUG = "michael-scott";
export const BOSS_SPRITE_PATH = officeSpritePath(BOSS_SLUG, "front-right");

/** Room art for the time of day (DM variant = the real Dunder Mifflin floor). */
export function getRoomImage(date: Date = new Date()): string {
  const hour = date.getHours();
  const night = hour < 7 || hour >= 19;
  return night ? "/rooms/office-night-dm.png" : "/rooms/office-day-dm.png";
}

// ===== Themed chatter (ported pools from W17ant src/theme.ts) =====

const OFFICE_SPAWN = [
  "Identity theft is not a joke, Jim!",
  "reporting to Scranton branch",
  "paper, paper, paper",
  "Bears. Beets. Battlestar Galactica.",
  "clocked in, Dunder Mifflin style",
];
const OFFICE_WORK = [
  "selling paper",
  "processing reams",
  "filing TPS reports",
  "negotiating with corporate",
  "Finer Things Club newsletter",
];
const OFFICE_DONE = [
  "that's what she said",
  "boom. roasted.",
  "World's Best Boss approves",
  "merged — Jim-approved",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function themedSpawn(): string {
  return pick(OFFICE_SPAWN);
}
export function themedWork(): string {
  return pick(OFFICE_WORK);
}
export function themedDone(): string {
  return pick(OFFICE_DONE);
}
