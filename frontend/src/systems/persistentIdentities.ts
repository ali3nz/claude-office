/**
 * Persistent identities (issue 226 R7/R8).
 *
 * The four identities that must ALWAYS render with the same seat and the same
 * avatar: the two Sol gateway characters and the two ai-agents. The backend
 * room drops a session between event bursts, so the renderer keeps a cache of
 * the last real state (real backend id) and re-draws a missing identity from
 * that cache - or from the seed, on a cold load.
 *
 * Extracted as a PURE function so the missing-agent branch can be exercised
 * directly (Sol evidence request, turn 10) without a live failure.
 */

export interface PersistentAgent {
  id: string;
  name: string | null;
}

/** The four identities, with the backend's stable agent ids. */
export const PERSISTENT_SEEDS: readonly { name: string; id: string }[] = [
  { name: "Sol Docker", id: "gateway-dockerhost" },
  { name: "Sol Webserver", id: "gateway-webserver" },
  { name: "GhostReporting", id: "ai-companion" },
  { name: "TruFreedom", id: "ai-explorer" },
] as const;

const SEED_NAMES = new Set(PERSISTENT_SEEDS.map((s) => s.name));

/**
 * Stand-in list for identities the live feed is currently missing. Updates the
 * cache from the live input first. Disjoint from `real` by construction, so a
 * live identity can never be duplicated.
 */
export function buildStandIns<T extends PersistentAgent>(
  real: readonly T[],
  cache: Map<string, T>,
  makeSeed: (name: string, id: string) => T,
): T[] {
  const present = new Set<string>();
  for (const a of real) {
    if (a.name && SEED_NAMES.has(a.name)) {
      cache.set(a.name, a);
      present.add(a.name);
    }
  }
  const out: T[] = [];
  for (const seed of PERSISTENT_SEEDS) {
    if (present.has(seed.name)) continue;
    let cached = cache.get(seed.name);
    if (!cached) {
      cached = makeSeed(seed.name, seed.id);
      cache.set(seed.name, cached);
    }
    out.push(cached);
  }
  return out;
}

/** Live agents + stand-ins for any missing persistent identity. */
export function withPersistentIdentities<T extends PersistentAgent>(
  real: readonly T[],
  cache: Map<string, T>,
  makeSeed: (name: string, id: string) => T,
): T[] {
  return [...real, ...buildStandIns(real, cache, makeSeed)];
}
