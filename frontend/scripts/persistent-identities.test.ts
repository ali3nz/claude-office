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

const THREE: A[] = [
  live("gateway-dockerhost", "Sol Docker", 3),
  live("gateway-webserver", "Sol Webserver", 1),
  live("ai-companion", "GhostReporting", 2),
];

const count = (xs: A[], name: string) => xs.filter((x) => x.name === name).length;
const fatal: string[] = [];
const check = (cond: boolean, msg: string) => {
  console.log((cond ? "PASS  " : "FAIL  ") + msg);
  if (!cond) fatal.push(msg);
};

// ---- scenario A: all three live (steady state)
let cache = new Map<string, A>();
let out = withPersistentIdentities(THREE, cache, makeSeed);
check(out.length === 3, "A: three live identities render exactly three characters");
check(PERSISTENT_SEEDS.every((s) => count(out, s.name) === 1), "A: exactly one instance of each identity");

// ---- scenario B: ai-companion (GhostReporting) DISAPPEARS from the live list
const withoutGhost = THREE.filter((a) => a.name !== "GhostReporting");
out = withPersistentIdentities(withoutGhost, cache, makeSeed);
const ghost = out.filter((a) => a.name === "GhostReporting");
check(ghost.length === 1, "B: missing identity still renders exactly one stand-in");
check(ghost[0]?.id === "ai-companion", "B: stand-in keeps the SAME backend id (ai-companion)");
check(ghost[0]?.desk === 2, "B: stand-in keeps the last known desk (2)");
check(out.length === 3, "B: floor still shows all three identities");

// ---- scenario C: ai-companion RETURNS while the stand-in is on the floor
cache = new Map<string, A>();
out = withPersistentIdentities(withoutGhost, cache, makeSeed); // stand-in present
out = withPersistentIdentities(THREE, cache, makeSeed);         // live returns
check(count(out, "GhostReporting") === 1, "C: returning identity produces NO duplicate");
check(out.filter((a) => a.name === "GhostReporting")[0]?.id === "ai-companion", "C: id unchanged after return");
check(out.length === 3, "C: exactly three characters after the return");

// ---- scenario D: cold load (empty live list) seeds all three
const cold = withPersistentIdentities([], new Map<string, A>(), makeSeed);
check(cold.length === 3, "D: cold load renders all three identities before any event");

console.log("");
console.log(fatal.length === 0 ? "RESULT: ALL CHECKS PASSED" : "RESULT: FAILURES: " + fatal.length);
process.exit(fatal.length === 0 ? 0 : 1);
