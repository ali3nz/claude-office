/**
 * coMark — diagnostics-only render breadcrumb (issue 212, Sol C-first).
 *
 * Appends a bounded label to window.__co.seq so the last component to start
 * rendering before a crash is identifiable. No behavior change; best-effort,
 * never throws.
 */
export function coMark(label: string): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as { __co?: Record<string, unknown> };
    const d = (w.__co = w.__co ?? {});
    const s = (d["seq"] = d["seq"] ?? []);
    if (Array.isArray(s) && s.length < 80) (s as string[]).push(label);
  } catch {
    // diagnostics must never break the app
  }
}
