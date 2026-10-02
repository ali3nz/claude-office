#!/usr/bin/env python3
"""claude-office-bridge: Orchestra observer feeds -> Claude Office ingest.

One-way, disposable, read-only toward Orchestra. Reads sanitized observer
feeds (kit schema:2 + OpenChamber/Claude office-vocab), translates to Claude
Office event envelopes, POSTs to the backend. Never writes to Orchestra,
never blocks producers: all failures are local log lines, cursors advance
only past posted or explicitly skipped lines.
"""

import hashlib
import re
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime

BACKEND_URL = os.environ.get("CO_BACKEND", "http://claude-office:8000/api/v1/events")
API_KEY = os.environ.get("CO_API_KEY", "")
STATE_DIR = os.environ.get("CO_STATE_DIR", "/state")
POLL_SEC = float(os.environ.get("CO_POLL_SEC", "5"))
HTTP_TIMEOUT = float(os.environ.get("CO_HTTP_TIMEOUT", "10"))
POST_DELAY = float(os.environ.get("CO_POST_DELAY", "0.3"))
MAX_BACKLOG = int(os.environ.get("CO_MAX_BACKLOG", "5000"))
SENT_CAP = int(os.environ.get("CO_SENT_CAP", "20000"))

FEED_KIT = os.environ.get("CO_FEED_KIT", "/feeds/kit.jsonl")
FEED_OC = os.environ.get("CO_FEED_OC", "/feeds/openchamber.jsonl")
FEED_FB = os.environ.get("CO_FEED_FB", "/feeds/claude.jsonl")
FEED_AG = os.environ.get("CO_FEED_AG", "/feeds/agdir/events.jsonl")

# Pixel-Agents parity (issue 221 S3): exactly TWO persistent catgpt gateway
# characters are surfaced from the agenthome feed. This is a fixed whitelist —
# session id -> (agent id, display name, curated agent type). Every other
# agenthome session is ignored, and NO free text from the feed crosses this
# boundary (only the fixed strings below are emitted).
GATEWAY_WHITELIST = {
    "agentchat-sol-dockerhost": {
        "agent_id": "gateway-dockerhost",
        "name": "Sol Docker",
        "agent_type": "gateway-dockerhost",
    },
    "agentchat-sol-webserver": {
        "agent_id": "gateway-webserver",
        "name": "Sol Webserver",
        "agent_type": "gateway-webserver",
    },
}
GATEWAY_EVENTS = frozenset(["session_start", "tool_start", "tool_end"])

STATE_FILE = os.path.join(STATE_DIR, "bridge-state.json")

KIT_START = frozenset(["run_allocated", "case_started", "agent_allocated"])
KIT_END_OK = frozenset(["run_completed"])
KIT_END_FAIL = frozenset(["run_failed"])


def log(msg):
    sys.stderr.write("[bridge] " + msg + "\n")
    sys.stderr.flush()


def clip(text, limit):
    text = str(text or "")
    return text[:limit]


def sanitize_sid(raw):
    cleaned = []
    for ch in str(raw or ""):
        if ch.isalnum() or ch in ("-", "_"):
            cleaned.append(ch)
        else:
            cleaned.append("-")
    out = "".join(cleaned).strip("-")[:128]
    return out or "unknown-session"


def office_name(display_name, visual_role, engine, run_number):
    raw = str(display_name or visual_role or "agent")
    eng = str(engine or "")
    lowered = eng.lower()
    is_sol = ("sol" in lowered or "codex" in lowered or "cursor" in lowered
              or "luna" in lowered or "openrouter" in lowered
              or visual_role == "CONSULTANT")
    seats = ("ceo", "coordinator", "alpha", "beta", "gamma", "delta",
             "epsilon", "zeta", "eta", "theta")
    if is_sol:
        name = "Sol"
    elif raw.lower() in seats:
        name = "Buffy"
    else:
        name = raw
    try:
        run_no = " R%03d" % int(run_number)
    except (TypeError, ValueError):
        run_no = ""
    return name, name + run_no


def department_for(visual_role, engine, state, phase, transition):
    role = str(visual_role or "")
    eng = str(engine or "").lower()
    if role == "CEO":
        return "executive"
    if role == "CONSULTANT" or "sol" in eng:
        return "consultation"
    st = str(state or "")
    ph = str(phase or "")
    if st == "WAITING_FOR_OPERATOR" or (transition or "").startswith("operator_wait"):
        return "boardroom"
    if "REVIEW" in st or "REVIEW" in ph:
        return "review"
    if "VALIDAT" in st or "VALIDAT" in ph:
        return "validation"
    if st == "FAILED":
        return "review"
    if st == "IDLE":
        return "lounge"
    return "implementation"


def orch_sid(run_number, agent_session):
    run_part = str(run_number) if run_number is not None else "x"
    return sanitize_sid("orch-" + run_part + "-" + str(agent_session or "x"))


def iso_from_ts(ts):
    try:
        return datetime.fromtimestamp(float(ts), UTC).isoformat()
    except (TypeError, ValueError, OverflowError, OSError):
        return datetime.now(UTC).isoformat()


def dedup_key(source, *parts):
    blob = "|".join(str(p or "") for p in parts)
    return source + ":" + hashlib.sha256(blob.encode("utf-8")).hexdigest()[:24]


def translate_kit(ev, live):
    """Map one kit schema:2 observer event to (envelope, dedup, sid)."""
    if not isinstance(ev, dict) or "event" in ev and "transition" not in ev:
        return None, None, None
    transition = ev.get("transition")
    if not transition:
        return None, None, None
    run_number = ev.get("runNumber")
    agent_session = ev.get("agentSessionId") or "x"
    sid = orch_sid(run_number, agent_session)
    key = dedup_key("kit", ev.get("eventId"), transition, run_number,
                    ev.get("caseId"), ev.get("caseRev"), agent_session)
    name, label = office_name(ev.get("displayName"), ev.get("visualRole"),
                              ev.get("engine"), run_number)
    phase = ev.get("phase")
    state = ev.get("state")
    engine = ev.get("engine")
    stamp = iso_from_ts(ev.get("ts"))

    dept = department_for(ev.get("visualRole"), engine, state, phase, transition)
    def base(extra):
        payload = dict(extra)
        payload.setdefault("project_dir", "/orchestra/" + dept)
        body = {
            "session_id": sid,
            "timestamp": stamp,
            "data": payload,
        }
        return body

    if transition in KIT_START or (transition == "phase_started" and sid not in live):
        env = base({
            "project_name": clip("Run %s %s" % (run_number, ev.get("caseId") or ""), 120),
            "reason": clip(transition, 64),
        })
        env["event_type"] = "session_start"
        return env, key, sid
    if transition == "sol_consult_started":
        sol_sid = sanitize_sid("orch-%s-sol" % (run_number,))
        env = {
            "session_id": sol_sid,
            "timestamp": stamp,
            "event_type": "session_start",
            "data": {"agent_name": clip("Sol R%s" % (run_number,), 64),
                     "task_description": clip("consultation", 120),
                     "project_dir": "/orchestra/consultation"},
        }
        return env, dedup_key("kit", ev.get("eventId"), transition, run_number), sol_sid
    if transition == "sol_consult_finished":
        sol_sid = sanitize_sid("orch-%s-sol" % (run_number,))
        env = {
            "session_id": sol_sid,
            "timestamp": stamp,
            "event_type": "session_end",
            "data": {"reason": "consultation complete", "success": True},
        }
        return env, dedup_key("kit", ev.get("eventId"), transition, run_number), sol_sid
    if transition == "operator_wait_started":
        env = base({"tool_name": "operator-approval",
                    "result_summary": clip("waiting: %s" % (phase or state or ""), 120)})
        env["event_type"] = "permission_request"
        return env, key, sid
    if transition == "operator_wait_finished":
        env = base({"task_description": "operator wait cleared"})
        env["event_type"] = "agent_update"
        return env, key, sid
    if transition == "retry_started":
        env = base({"task_description": clip("retrying %s" % (phase or ""), 120)})
        env["event_type"] = "agent_update"
        return env, key, sid
    if transition == "phase_started":
        env = base({"task_description": clip("phase %s" % (phase or ""), 120)})
        env["event_type"] = "agent_update"
        return env, key, sid
    if transition == "phase_completed":
        env = base({"task_description": clip("phase complete %s" % (phase or ""), 120)})
        env["event_type"] = "agent_update"
        return env, key, sid
    if transition == "agent_released":
        env = base({"reason": "released", "success": True})
        env["event_type"] = "session_end"
        return env, key, sid
    if transition == "run_paused":
        env = base({"reason": "paused"})
        env["event_type"] = "waiting"
        return env, key, sid
    if transition == "run_resumed":
        env = base({"task_description": "resumed"})
        env["event_type"] = "agent_update"
        return env, key, sid
    if transition in KIT_END_OK:
        env = base({"reason": "completed", "success": True})
        env["event_type"] = "session_end"
        return env, key, sid
    if transition in KIT_END_FAIL:
        env = base({"reason": "failed", "success": False})
        env["event_type"] = "session_end"
        return env, key, sid
    return None, key, sid


def sanitize_display_name(raw):
    """Bounded presentation-only title (issue 226 R1, Sol guardrails).

    Source is exclusively the OpenChamber session title: control characters and
    line breaks stripped, whitespace collapsed/trimmed, capped at 40 chars.
    Never derived from prompts/messages/tool output; never parsed.
    """
    txt = re.sub(r"[\x00-\x1f\x7f]+", " ", str(raw or ""))
    txt = re.sub(r"\s+", " ", txt).strip()
    return txt[:40]


def translate_vocab(line, source, prefix, live_agents):
    """Map one office-vocab line (openchamber/claude feeds). Strips free text."""
    if not isinstance(line, dict) or "event" not in line:
        return None, None, None
    event = line.get("event")
    raw_sid = str(line.get("session_id") or "x")
    if raw_sid in live_agents:
        sid = live_agents[raw_sid]
    else:
        sid = sanitize_sid(prefix + raw_sid)
    key = dedup_key(source, raw_sid, event, line.get("tool_name"),
                    line.get("activity"), line.get("ts"))
    stamp = iso_from_ts(line.get("ts"))
    tool = clip(line.get("tool_name") or "", 64)
    activity = clip(line.get("activity") or "", 32)

    def base(event_type, extra):
        payload = dict(extra)
        payload.setdefault("project_dir", "/orchestra/implementation")
        return {"session_id": sid, "timestamp": stamp,
                "event_type": event_type, "data": payload}

    if event == "tool_start":
        return base("pre_tool_use", {"tool_name": tool or "tool"}), key, sid
    if event == "tool_end":
        return base("post_tool_use", {"tool_name": tool or "tool",
                                      "success": activity != "blocked"}), key, sid
    if event == "approval_request":
        return base("permission_request", {"tool_name": "approval"}), key, sid
    if event == "session_start":
        extra = {"reason": "observed"}
        label = sanitize_display_name(line.get("label"))
        if label:
            extra["display_name"] = label
        parent = str(line.get("parent_session_id") or "").strip()
        if parent:
            extra["parent_session_id"] = parent[:64]
        return base("session_start", extra), key, sid
    if event == "session_end":
        return base("session_end", {"reason": "observed"}), key, sid
    return None, key, sid


def translate_gateway(line, seen=None):
    """Narrow agenthome -> gateway-character translation (issue 221 S3).

    Only the two whitelisted catgpt gateway sessions are accepted; only the
    lifecycle vocabulary needed for presence (session_start) and working state
    (tool_start/tool_end) is translated; the agent identity/name/type are the
    fixed whitelist values, so no feed free text is propagated.

    ``seen`` is the set of gateway session ids already bootstrapped by this
    bridge. The presence watcher emits its own session_start only once in the
    gateway's lifetime, so on the FIRST observed pulse for a gateway the
    session boundary + character spawn are emitted here; a live pulse is proof
    that the gateway exists, so this is presence bootstrapping, not invention.
    """
    if not isinstance(line, dict) or "event" not in line:
        return None, None, None
    raw_sid = str(line.get("session_id") or "x")
    meta = GATEWAY_WHITELIST.get(raw_sid)
    if meta is None:
        return None, None, None
    event = line.get("event")
    if event not in GATEWAY_EVENTS:
        return None, None, None
    sid = sanitize_sid("ag-" + raw_sid)
    key = dedup_key("ag", raw_sid, event, line.get("ts"))
    stamp = iso_from_ts(line.get("ts"))
    data = {"agent_id": meta["agent_id"], "project_dir": "/orchestra/gateway"}
    envs = []
    if event == "session_start" or (seen is not None and raw_sid not in seen):
        data.update({"agent_name": meta["name"], "agent_type": meta["agent_type"],
                     "task_description": "catgpt gateway"})
        envs.append({"session_id": sid, "timestamp": stamp,
                     "event_type": "session_start", "data": data})
        envs.append({"session_id": sid, "timestamp": stamp,
                     "event_type": "subagent_start", "data": data})
    if event == "tool_start":
        data.update({"tool_name": "catgpt-gateway"})
        envs.append({"session_id": sid, "timestamp": stamp,
                     "event_type": "pre_tool_use", "data": data})
    elif event == "tool_end":
        activity = str(line.get("activity") or "")
        data.update({"tool_name": "catgpt-gateway",
                     "success": activity != "blocked"})
        envs.append({"session_id": sid, "timestamp": stamp,
                     "event_type": "post_tool_use", "data": data})
    if not envs:
        return None, key, sid
    return (envs if len(envs) != 1 else envs[0]), key, sid


def post_envelope(envelope):
    payload = json.dumps(envelope).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["X-API-Key"] = API_KEY
    req = urllib.request.Request(BACKEND_URL, data=payload,
                                 headers=headers,
                                 method="POST")
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        log("post failed: %.120s" % (exc,))
        return False


START_AT_END = os.environ.get("CO_START_AT_END", "0") == "1"


def load_state():
    try:
        with open(STATE_FILE, encoding="utf-8") as fh:
            state = json.load(fh)
        if isinstance(state, dict):
            state.setdefault("cursors", {})
            state.setdefault("sent", [])
            state.setdefault("live", {})
            state.setdefault("gateways", {})
            # A feed that was ADDED after the state file existed has no cursor
            # yet: with START_AT_END, start it at the current live edge instead
            # of replaying the whole file (issue 221: adding FEED_AG must not
            # backfill days of historical gateway pulses).
            if START_AT_END:
                for path in (FEED_KIT, FEED_OC, FEED_FB, FEED_AG):
                    if path in state["cursors"]:
                        continue
                    try:
                        with open(path, encoding="utf-8") as fh:
                            state["cursors"][path] = sum(1 for _ in fh)
                        log("new feed %s starts at live edge" % path)
                    except OSError:
                        pass
            return state
    except (OSError, ValueError):
        pass
    return fresh_state()


def fresh_state():
    state = {"cursors": {}, "sent": [], "live": {}, "gateways": {}}
    if START_AT_END:
        for path in (FEED_KIT, FEED_OC, FEED_FB, FEED_AG):
            try:
                with open(path, encoding="utf-8") as fh:
                    state["cursors"][path] = sum(1 for _ in fh)
            except OSError:
                pass
        log("starting at live edge; historical lines skipped")
    return state


def save_state(state):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
        os.replace(tmp, STATE_FILE)
    except OSError as exc:
        log("state save failed: %.120s" % (exc,))


def read_new_lines(path, consumed):
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return [], consumed
    fresh = lines[consumed:consumed + MAX_BACKLOG + 1]
    return fresh, consumed


def run_once(state):
    sent_set = set(state["sent"])
    live = state["live"]
    live_agents = {}
    for sid, meta in live.items():
        agent = (meta or {}).get("agent")
        if agent:
            live_agents[agent] = sid
    posted = skipped = failed = 0
    for path, source in ((FEED_KIT, "kit"), (FEED_OC, "oc"),
                        (FEED_FB, "fb"), (FEED_AG, "ag")):
        consumed = int(state["cursors"].get(path, 0))
        fresh, _ = read_new_lines(path, consumed)
        advanced = consumed
        for raw in fresh:
            advanced += 1
            try:
                item = json.loads(raw)
            except ValueError:
                continue
            if source == "kit":
                env, key, sid = translate_kit(item, live)
            elif source == "ag":
                env, key, sid = translate_gateway(item, set(state.get("gateways", {})))
            else:
                prefix = "oc-" if source == "oc" else "fb-"
                env, key, sid = translate_vocab(item, source, prefix, live_agents)
            if key is None:
                continue
            if key in sent_set:
                continue
            if env is None:
                continue
            envs = env if isinstance(env, list) else [env]
            post_failed = False
            for one in envs:
                if not post_envelope(one):
                    post_failed = True
                    break
                time.sleep(POST_DELAY)
                posted += 1
            if post_failed:
                advanced -= 1
                failed += 1
                break
            sent_set.add(key)
            if len(sent_set) > SENT_CAP:
                sent_set = set(list(sent_set)[-SENT_CAP:])
            env = envs[-1]
            if source == "ag":
                raw_gw = str(item.get("session_id") or "x")
                if raw_gw in GATEWAY_WHITELIST:
                    state.setdefault("gateways", {})[raw_gw] = True
            if any(e["event_type"] == "session_start" for e in envs):
                live[sid] = {"agent": item.get("agentSessionId") or item.get("session_id"),
                             "source": source,
                             "run": item.get("runNumber")}
                if source != "kit":
                    live_agents[str(item.get("session_id") or "x")] = sid
            if env["event_type"] == "session_end":
                live.pop(sid, None)
            if source == "kit" and item.get("transition") in ("run_completed", "run_failed"):
                run_no = item.get("runNumber")
                done = item.get("transition") == "run_completed"
                for other in [k for k, meta in live.items() if (meta or {}).get("run") == run_no and k != sid]:
                    sweep_env = {"session_id": other, "timestamp": iso_from_ts(item.get("ts")),
                                 "event_type": "session_end",
                                 "data": {"reason": "run end sweep", "success": done,
                                          "project_dir": "/orchestra/implementation"}}
                    sweep_key = dedup_key("kit-sweep", item.get("eventId"), other)
                    if sweep_key in sent_set:
                        continue
                    if not post_envelope(sweep_env):
                        failed += 1
                        break
                    sent_set.add(sweep_key)
                    posted += 1
                    live.pop(other, None)
        state["cursors"][path] = advanced
    state["sent"] = list(sent_set)[-SENT_CAP:]
    state["live"] = live
    return posted, skipped, failed


def selftest():
    live = {}
    env, key, sid = translate_kit({"transition": "case_started", "runNumber": 7,
                                   "caseId": "demo", "caseRev": 1,
                                   "agentSessionId": "e2e-coordinator",
                                   "displayName": "CEO", "visualRole": "CEO",
                                   "phase": "TEST", "state": "COORDINATING",
                                   "engine": "coordinator", "status": "starting",
                                   "ts": 1790831900.0}, live)
    assert env["event_type"] == "session_start", env
    assert sid == "orch-7-e2e-coordinator", sid
    assert key.startswith("kit:"), key
    env2, key2, _ = translate_kit({"transition": "agent_thinking", "runNumber": 7,
                                   "agentSessionId": "x",
                                   "ts": 1790831901.0}, {"orch-7-x": {}})
    assert env2 is None and key2 is not None
    vocab = {"session_id": "chat-fb-abc", "platform": "openchamber",
             "ts": 1790831904.0, "event": "approval_request",
             "label": "Buffy CHAT", "command": "waiting: SECRET-PROMPT-TEXT",
             "preview": "SECRET-PROMPT-TEXT", "detail": "SECRET"}
    env3, key3, sid3 = translate_vocab(vocab, "oc", "oc-", {})
    assert env3["event_type"] == "permission_request", env3
    blob = json.dumps(env3)
    assert "SECRET" not in blob, blob
    assert sid3 == "oc-chat-fb-abc", sid3
    vocab4 = {"session_id": "e2e-coordinator", "platform": "openchamber",
              "ts": 1790831905.0, "event": "tool_end", "tool_name": "bash",
              "activity": "running"}
    env4, _, sid4 = translate_vocab(vocab4, "oc", "oc-",
                                    {"e2e-coordinator": "orch-7-e2e-coordinator"})
    assert sid4 == "orch-7-e2e-coordinator", sid4
    assert env4["event_type"] == "post_tool_use", env4
    assert department_for("CEO", "coordinator", "COORDINATING", "TEST", "case_started") == "executive"
    assert department_for("CONSULTANT", "openai-sol", "x", "y", "sol_consult_started") == "consultation"
    assert department_for("WORKER", "freebuff", "WAITING_FOR_OPERATOR", "REVIEW", "x") == "boardroom"
    assert department_for("WORKER", "freebuff", "REVIEWING", "REVIEW", "x") == "review"
    assert department_for("WORKER", "freebuff", "VALIDATING", "VALIDATION", "x") == "validation"
    assert department_for("WORKER", "freebuff", "IDLE", "x", "x") == "lounge"
    assert department_for("WORKER", "freebuff", "IMPLEMENTING", "IMPLEMENT", "x") == "implementation"
    # --- gateway whitelist (issue 221 S3) -------------------------------
    gw = {"session_id": "agentchat-sol-webserver", "platform": "cli",
          "ts": 1790831906.0, "event": "session_start",
          "label": "SECRET-LABEL", "detail": "in use by SECRET-USER",
          "preview": "SECRET-PREVIEW"}
    env5, key5, sid5 = translate_gateway(gw)
    assert isinstance(env5, list) and len(env5) == 2, env5
    assert [e["event_type"] for e in env5] == ["session_start", "subagent_start"], env5
    assert key5 is not None, key5
    assert sid5 == "ag-agentchat-sol-webserver", sid5
    assert env5[1]["data"]["agent_id"] == "gateway-webserver", env5[1]
    assert env5[1]["data"]["agent_name"] == "Sol Webserver", env5[1]
    assert env5[1]["data"]["agent_type"] == "gateway-webserver", env5[1]
    blob = json.dumps(env5)
    assert "SECRET" not in blob, blob
    gw2 = {"session_id": "agentchat-sol-dockerhost", "platform": "cli",
           "ts": 1790831907.0, "event": "tool_start", "activity": "working",
           "detail": "in use by sol-x", "preview": "SECRET-PREVIEW"}
    env6, _, _ = translate_gateway(gw2, set())
    assert isinstance(env6, list) and len(env6) == 3, env6
    assert [e["event_type"] for e in env6] == ["session_start", "subagent_start",
                                               "pre_tool_use"], env6
    assert env6[2]["data"]["agent_id"] == "gateway-dockerhost", env6
    assert "SECRET" not in json.dumps(env6), env6
    env6b, _, _ = translate_gateway(gw2, {"agentchat-sol-dockerhost"})
    assert env6b["event_type"] == "pre_tool_use", env6b
    gw3 = {"session_id": "agentchat-sol-dockerhost", "platform": "cli",
           "ts": 1790831908.0, "event": "tool_end", "activity": "idle",
           "detail": "available"}
    env7, _, _ = translate_gateway(gw3, {"agentchat-sol-dockerhost"})
    assert env7["event_type"] == "post_tool_use", env7
    assert env7["data"]["success"] is True, env7
    # unrelated agenthome sessions are rejected outright
    for sid in ("orch-042-sol-1", "agentchat-buffy", "some-other"):
        other = {"session_id": sid, "platform": "orchestra-sol",
                 "ts": 1790831909.0, "event": "tool_start"}
        envX, keyX, sidX = translate_gateway(other)
        assert envX is None and keyX is None and sidX is None, (sid, envX, keyX, sidX)
    print("selftest: 6 groups OK")
    return 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    once = "--once" in argv
    state = load_state()
    if once:
        posted, _, failed = run_once(state)
        save_state(state)
        print("once: posted=%d failed=%d" % (posted, failed))
        return 0 if failed == 0 else 2
    log("bridge up backend=%.80s" % (BACKEND_URL,))
    while True:
        state = load_state()
        posted, _, failed = run_once(state)
        save_state(state)
        if posted or failed:
            log("poll posted=%d failed=%d" % (posted, failed))
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
