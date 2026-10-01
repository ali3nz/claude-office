# claude-office-bridge

One-way observer: Orchestra sanitized feeds -> Claude Office `POST /api/v1/events`.
Reads feed files read-only; POSTs translated envelopes; persists cursors +
dedup set under its own state dir. Never writes to Orchestra. Never blocks
producers: backend downtime only stalls cursor advancement (retry next poll).

Sources: kit schema:2 feed (identity authority) + openchamber/claude
office-vocab feeds (tool enrichment; absent files are normal).

Identity: `orch-{run}-{agent}` (kit), `oc-{sid}` / `fb-{sid}` (vocab feeds),
exact-match merge onto live orch sessions. Display names are presentational
(`Buffy R014` / `Sol R014`); durable keys are run/agent/event ids.

Dedup: `{source}:{sha24(...)}`; kit uses the deterministic observer eventId.
Replay/backlog safe: reposts never occur (persisted sent-set); bursts are
paced (CO_POST_DELAY) because the backend applies same-session events via
concurrent background tasks (last-writer-wins on status under burst).

Dropped: vocab `preview`/`command`/`detail` free text (never forwarded);
unknown transitions; tool-only lines for unknown sessions (no ghosts).

Run end sweeps every live session of the same runNumber to session_end.
