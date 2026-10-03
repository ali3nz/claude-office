/**
 * Controlled evidence for the missing-agent branch (Sol turn 10).
 * Exercises the SHIPPED pure function directly; no live failure needed.
 */
import {
  buildStandIns,
  withPersistentIdentities,
  PERSISTENT_SEEDS,
  type PersistentAgent,
} from "../src/systems/persistentIdentities";

interface A extends PersistentAgent {
  desk: number;
}

const makeSeed = (name: string, id: string): A => ({ id, name, desk: 0 });

const live = (id: string, name: string, desk: number): A => ({ id, name, desk });

const FOUR: A[] = [
  live("gateway-dockerhost", "Sol Docker", 3),
  live("gateway-webserver", "Sol Webserver", 1),
  live("ai-companion", "GhostReporting", 2),
  live("ai-explorer", "TruFreedom", 4),
];

const count = (xs: A[], name: string) => xs.filter((x) => x.name === name).length;
const fatal: string[] = [];
const check = (cond: boolean, msg: string) => {
  console.log((cond ? "PASS  " : "FAIL  ") + msg);
  if (!cond) fatal.push(msg);
};

// ---- scenario A: all four live (steady state)
let cache = new Map<string, A>();
let out = withPersistentIdentities(FOUR, cache, makeSeed);
check(out.length === 4, "A: four live identities render exactly four characters");
check(PERSISTENT_SEEDS.every((s) => count(out, s.name) === 1), "A: exactly one instance of each identity");

// ---- scenario B: ai-companion (GhostReporting) DISAPPEARS from the live list
const withoutGhost = FOUR.filter((a) => a.name !== "GhostReporting");
out = withPersistentIdentities(withoutGhost, cache, makeSeed);
const ghost = out.filter((a) => a.name === "GhostReporting");
check(ghost.length === 1, "B: missing identity still renders exactly one stand-in");
check(ghost[0]?.id === "ai-companion", "B: stand-in keeps the SAME backend id (ai-companion)");
check(ghost[0]?.desk === 2, "B: stand-in keeps the last known desk (2)");
check(out.length === 4, "B: floor still shows all four identities");

// ---- scenario C: ai-companion RETURNS while the stand-in is on the floor
cache = new Map<string, A>();
out = withPersistentIdentities(withoutGhost, cache, makeSeed); // stand-in present
out = withPersistentIdentities(FOUR, cache, makeSeed);         // live returns
check(count(out, "GhostReporting") === 1, "C: returning identity produces NO duplicate");
check(out.filter((a) => a.name === "GhostReporting")[0]?.id === "ai-companion", "C: id unchanged after return");
check(out.length === 4, "C: exactly four characters after the return");

// ---- scenario D: cold load (empty live list) seeds all four
const cold = withPersistentIdentities([], new Map<string, A>(), makeSeed);
check(cold.length === 4, "D: cold load renders all four identities before any event");

console.log("");
console.log(fatal.length === 0 ? "RESULT: ALL CHECKS PASSED" : "RESULT: FAILURES: " + fatal.length);
process.exit(fatal.length === 0 ? 0 : 1);
