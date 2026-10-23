# backend/tests/test_room_orchestrator.py
"""Tests for RoomOrchestrator: session merging, character types, kanban aggregation."""

from datetime import UTC, datetime, timedelta

from app.core.room_orchestrator import (
    OFFICE_IDLE_TIMEOUT,
    OFFICE_MAX_SEATED,
    PERSISTENT_AGENT_IDS,
    RoomOrchestrator,
    build_overview,
    office_session_name,
    office_subagent_name,
    office_title,
)
from app.core.state_machine import StateMachine
from app.models.agents import Agent, AgentState, BossState
from app.models.common import TodoItem, TodoStatus
from app.models.events import AnyEvent, EventAdapter, EventType


def _make_sm(
    team_name: str | None = None, teammate_name: str | None = None, is_lead: bool = False
) -> StateMachine:
    sm = StateMachine()
    sm.team_name = team_name
    sm.teammate_name = teammate_name
    sm.is_lead = is_lead
    sm.floor_id = "floor-1"
    sm.room_id = "room-1"
    return sm


def _task_created(task_id: str, subject: str) -> AnyEvent:
    return EventAdapter.validate_python(
        {
            "event_type": EventType.TASK_CREATED,
            "session_id": "s",
            "data": {"task_id": task_id, "task_subject": subject},
        }
    )


def _task_completed(task_id: str) -> AnyEvent:
    return EventAdapter.validate_python(
        {
            "event_type": EventType.TASK_COMPLETED,
            "session_id": "s",
            "data": {"task_id": task_id},
        }
    )


class TestSoloPassThrough:
    def test_solo_merge_returns_game_state(self) -> None:
        orch = RoomOrchestrator("room-1")
        sm = _make_sm()
        sm.boss_state = BossState.IDLE
        orch.add_session("sess-1", sm)
        state = orch.merge()
        assert state is not None
        assert state.session_id == "sess-1"

    def test_solo_merge_is_pass_through(self) -> None:
        """Solo sessions: no character_type assigned, original agents unchanged."""
        orch = RoomOrchestrator("room-1")
        sm = _make_sm()
        orch.add_session("sess-1", sm)
        state = orch.merge()
        assert state is not None
        # For solo, agents list has no teammates injected
        teammate_agents = [a for a in state.agents if a.character_type == "teammate"]
        assert len(teammate_agents) == 0

    def test_empty_orchestrator_returns_none(self) -> None:
        orch = RoomOrchestrator("room-1")
        assert orch.merge() is None


class TestTeamMerge:
    def test_lead_boss_stays_as_boss(self) -> None:
        orch = RoomOrchestrator("room-1")
        lead_sm = _make_sm(team_name="squad", is_lead=True)
        lead_sm.boss_state = BossState.WORKING
        orch.add_session("lead-sess", lead_sm)

        tm_sm = _make_sm(team_name="squad", teammate_name="implementer")
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        assert state is not None
        assert state.boss.state == BossState.WORKING

    def test_teammate_boss_appears_as_agent_with_teammate_type(self) -> None:
        orch = RoomOrchestrator("room-1")
        orch.add_session("lead-sess", _make_sm(team_name="squad", is_lead=True))
        tm_sm = _make_sm(team_name="squad", teammate_name="implementer")
        tm_sm.last_activity_at = datetime(2026, 10, 21, 8, 0, tzinfo=UTC)
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        assert state is not None
        teammate_agents = [a for a in state.agents if a.character_type == "teammate"]
        assert len(teammate_agents) == 1
        assert teammate_agents[0].name == "implementer"
        assert teammate_agents[0].last_activity_at == tm_sm.last_activity_at

    def test_lead_subagents_have_subagent_type(self) -> None:
        from app.models.agents import Agent

        orch = RoomOrchestrator("room-1")
        lead_sm = _make_sm(team_name="squad", is_lead=True)
        lead_sm.agents["sub-1"] = Agent(
            id="sub-1", color="#aaa", number=0, state=AgentState.WORKING
        )
        orch.add_session("lead-sess", lead_sm)
        orch.add_session("tm-sess", _make_sm(team_name="squad", teammate_name="tm"))

        state = orch.merge()
        assert state is not None
        subagent_agents = [a for a in state.agents if a.character_type == "subagent"]
        assert any(a.id == "sub-1" for a in subagent_agents)

    def test_teammate_subagents_linked_to_parent(self) -> None:
        from app.models.agents import Agent

        orch = RoomOrchestrator("room-1")
        orch.add_session("lead-sess", _make_sm(team_name="squad", is_lead=True))
        tm_sm = _make_sm(team_name="squad", teammate_name="tm")
        tm_sm.agents["sub-tm"] = Agent(
            id="sub-tm", color="#aaa", number=0, state=AgentState.WORKING
        )
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        assert state is not None
        tm_sub = next((a for a in state.agents if a.id == "sub-tm"), None)
        assert tm_sub is not None
        assert tm_sub.character_type == "subagent"
        assert tm_sub.parent_id is not None


class TestOfficeMergeAgentlessSession:
    """Regression (issue 246 follow-up): an agent-less session must not crash
    the office room merge.

    The synthetic session-level character built in ``_merge_office`` needs the
    required ``color`` field; omitting it raised a pydantic ValidationError on
    every merge, which killed the room WebSocket (browser showed DISCONNECTED
    with no worker information).
    """

    def test_office_merge_with_agentless_session(self) -> None:
        orch = RoomOrchestrator("office")
        orch.add_session("oc-ses_agentless", _make_sm())

        state = orch.merge()
        assert state is not None
        assert state.session_id == "office"
        teammates = [a for a in state.agents if a.character_type == "teammate"]
        assert len(teammates) == 1
        assert teammates[0].color  # required field must be populated


class TestOfficeIdleSweep:
    """Issue 714 / operator requirement: five idle minutes clears an agent.

    The backend applies the same predicate as the frontend so an always-on
    display cannot keep stale agents alive with a cached bundle.
    """

    def test_agent_stale_beyond_timeout_is_swept(self) -> None:
        orch = RoomOrchestrator("office")
        sm = _make_sm()
        stale_at = datetime.now(UTC) - OFFICE_IDLE_TIMEOUT - timedelta(seconds=1)
        sm.last_activity_at = stale_at
        sm.agents["stale"] = Agent(
            id="stale",
            name="Worker",
            color="#fff",
            number=0,
            state=AgentState.IDLE,
            last_activity_at=stale_at,
        )
        orch.add_session("oc-ses_stale", sm)

        state = orch.merge()
        assert state is not None
        assert all(a.id != "stale" for a in state.agents)

    def test_agent_inside_timeout_is_kept(self) -> None:
        orch = RoomOrchestrator("office")
        sm = _make_sm()
        fresh_at = datetime.now(UTC) - OFFICE_IDLE_TIMEOUT + timedelta(minutes=1)
        sm.last_activity_at = fresh_at
        sm.agents["fresh"] = Agent(
            id="fresh",
            name="Worker",
            color="#fff",
            number=0,
            state=AgentState.WORKING,
            last_activity_at=fresh_at,
        )
        orch.add_session("oc-ses_fresh", sm)

        state = orch.merge()
        assert state is not None
        assert any(a.id == "fresh" for a in state.agents)

    def test_persistent_identities_never_expire(self) -> None:
        orch = RoomOrchestrator("office")
        sm = _make_sm()
        old = datetime.now(UTC) - timedelta(days=1)
        sm.last_activity_at = old
        sm.agents = {
            "gateway-dockerhost": Agent(
                id="gateway-dockerhost",
                name="Sol Docker",
                color="#fff",
                number=0,
                state=AgentState.IDLE,
                last_activity_at=old,
            ),
            "gateway-webserver": Agent(
                id="gateway-webserver",
                name="Sol Webserver",
                color="#fff",
                number=1,
                state=AgentState.IDLE,
                last_activity_at=old,
            ),
            "ai-companion": Agent(
                id="ai-companion",
                name="Ghost Protocol",
                color="#fff",
                number=2,
                state=AgentState.IDLE,
                last_activity_at=old,
            ),
        }
        orch.add_session("oc-ses_persistent", sm)

        state = orch.merge()
        assert state is not None
        ids = {a.id for a in state.agents}
        assert ids == {"gateway-dockerhost", "gateway-webserver", "ai-companion"}

    def test_stale_agentless_session_is_swept(self) -> None:
        orch = RoomOrchestrator("office")
        sm = _make_sm()
        sm.last_activity_at = datetime.now(UTC) - OFFICE_IDLE_TIMEOUT - timedelta(seconds=1)
        orch.add_session("oc-ses_stale_agentless", sm)

        state = orch.merge()
        assert state is not None
        # Only the three always-present identities remain.
        assert {a.id for a in state.agents} == PERSISTENT_AGENT_IDS

    def test_missing_persistent_sessions_are_synthesized(self) -> None:
        # After a restart a gateway session may not have been restored yet.
        # The floor must still show the two Sol characters and Ghost Protocol.
        orch = RoomOrchestrator("office")
        sm = _make_sm()
        sm.last_activity_at = datetime.now(UTC) - OFFICE_IDLE_TIMEOUT - timedelta(seconds=1)
        orch.add_session("oc-ses_fresh_only", sm)

        state = orch.merge()
        assert state is not None
        by_name = {a.name: a.id for a in state.agents}
        assert by_name["Sol Docker"] == "gateway-dockerhost"
        assert by_name["Sol Webserver"] == "gateway-webserver"
        assert by_name["Ghost Protocol"] == "ai-companion"

    def test_unknown_activity_timestamp_is_not_hidden(self) -> None:
        # Older state (or a session whose first work event has not arrived) has
        # no watermark; do not make a new agent vanish before it can be seen.
        orch = RoomOrchestrator("office")
        sm = _make_sm()
        sm.agents["unknown"] = Agent(
            id="unknown",
            name="Worker",
            color="#fff",
            number=0,
            state=AgentState.WORKING,
        )
        orch.add_session("oc-ses_unknown", sm)

        state = orch.merge()
        assert state is not None
        assert any(a.id == "unknown" for a in state.agents)


class TestKanbanAggregation:
    def test_kanban_tasks_merged_from_all_sessions(self) -> None:
        orch = RoomOrchestrator("room-1")
        lead_sm = _make_sm(team_name="squad", is_lead=True)
        lead_sm.transition(_task_created("t1", "Lead task"))
        orch.add_session("lead-sess", lead_sm)

        tm_sm = _make_sm(team_name="squad", teammate_name="tm")
        tm_sm.teammate_name = "tm"
        tm_sm.transition(_task_created("t2", "TM task"))
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        assert state is not None
        task_ids = {t.task_id for t in state.whiteboard_data.kanban_tasks}
        assert "t1" in task_ids
        assert "t2" in task_ids

    def test_completed_task_status_preserved(self) -> None:
        orch = RoomOrchestrator("room-1")
        sm = _make_sm(team_name="squad", is_lead=True)
        sm.transition(_task_created("t1", "Work"))
        sm.transition(_task_completed("t1"))
        orch.add_session("lead-sess", sm)
        orch.add_session("tm-sess", _make_sm(team_name="squad", teammate_name="tm"))

        state = orch.merge()
        assert state is not None
        task = next(t for t in state.whiteboard_data.kanban_tasks if t.task_id == "t1")
        assert task.status == "completed"


class TestSessionLifecycle:
    def test_remove_session(self) -> None:
        orch = RoomOrchestrator("room-1")
        orch.add_session("sess-1", _make_sm())
        orch.remove_session("sess-1")
        assert orch.merge() is None

    def test_update_session(self) -> None:
        orch = RoomOrchestrator("room-1")
        sm = _make_sm()
        orch.add_session("sess-1", sm)
        sm2 = _make_sm()
        sm2.boss_state = BossState.WORKING
        orch.update_session("sess-1", sm2)
        state = orch.merge()
        assert state is not None
        assert state.boss.state == BossState.WORKING


class TestBuildOverview:
    def test_empty(self) -> None:
        ov = build_overview({})
        assert ov.entries == []

    def test_one_peer_per_session(self) -> None:
        a, b = _make_sm(), _make_sm()
        a.boss_state = BossState.WORKING
        b.boss_state = BossState.IDLE
        ov = build_overview({"s-a": a, "s-b": b})
        by_id = {e.session_id: e for e in ov.entries}
        assert set(by_id) == {"s-a", "s-b"}

    def test_bucket_mapping(self) -> None:
        cases = {
            BossState.WAITING_PERMISSION: "needs_you",
            BossState.PHONE_RINGING: "needs_you",
            BossState.WORKING: "working",
            BossState.DELEGATING: "working",
            BossState.REVIEWING: "working",
            BossState.IDLE: "done",
            BossState.COMPLETING: "done",
        }
        for state, expected in cases.items():
            sm = _make_sm()
            sm.boss_state = state
            ov = build_overview({"s": sm})
            assert ov.entries[0].bucket == expected
            assert ov.entries[0].state == state

    def test_idle_mid_turn_stays_working(self) -> None:
        # The boss drops to IDLE between tool calls; while the turn is still
        # running the terminal must not flicker into the "done" zone.
        sm = _make_sm()
        sm.boss_state = BossState.IDLE
        sm.turn_active = True
        assert build_overview({"s": sm}).entries[0].bucket == "working"

    def test_idle_with_live_subagents_stays_working(self) -> None:
        # A subagent stop flips the boss to IDLE, but if children are still
        # present the parent counts as working.
        sm = _make_sm()
        sm.boss_state = BossState.IDLE
        sm.turn_active = False
        sm.agents = {"x": Agent(id="x", color="#fff", number=0, state=AgentState.WORKING)}
        assert build_overview({"s": sm}).entries[0].bucket == "working"

    def test_idle_after_turn_is_done(self) -> None:
        # No active turn and no subagents -> genuinely idle/waiting.
        sm = _make_sm()
        sm.boss_state = BossState.IDLE
        sm.turn_active = False
        assert build_overview({"s": sm}).entries[0].bucket == "done"

    def test_needs_you_wins_over_turn_active(self) -> None:
        # Blocked-on-user states must surface even mid-turn.
        sm = _make_sm()
        sm.boss_state = BossState.WAITING_PERMISSION
        sm.turn_active = True
        assert build_overview({"s": sm}).entries[0].bucket == "needs_you"

    def test_todo_counts_and_subagents(self) -> None:
        sm = _make_sm()
        sm.boss_state = BossState.WORKING
        sm.boss_current_task = "refactor auth"
        sm.todos = [
            TodoItem(content="a", status=TodoStatus.COMPLETED),
            TodoItem(content="b", status=TodoStatus.IN_PROGRESS),
            TodoItem(content="c", status=TodoStatus.PENDING),
        ]
        sm.agents = {
            "x": Agent(id="x", color="#fff", number=0, state=AgentState.WORKING),
            "y": Agent(id="y", color="#fff", number=1, state=AgentState.WORKING),
        }
        entry = build_overview({"s": sm}).entries[0]
        assert entry.current_task == "refactor auth"
        assert (entry.todo_done, entry.todo_total) == (1, 3)
        assert entry.subagent_count == 2


class TestOfficeNaming360:
    """Issue 360: 20-char floor names, sub_ prefix, conversation titles."""

    def test_session_name_uses_20_chars(self) -> None:
        assert (
            office_session_name("oc-ses_x", "A very long conversation name here")
            == "A very long conversa"
        )

    def test_subagent_name_has_sub_prefix(self) -> None:
        name = office_subagent_name("oc-ses_x", "My conversation")
        assert name == "sub_My conversation"
        assert len(name) <= 20

    def test_subagent_name_truncates_to_20(self) -> None:
        name = office_subagent_name("oc-ses_x", "A very long conversation name")
        assert name.startswith("sub_")
        assert len(name) == 20

    def test_subagent_name_falls_back_without_title(self) -> None:
        name = office_subagent_name("oc-ses_x", None)
        assert name.startswith("sub_")
        assert len(name) <= 20

    def test_office_title_is_full_name(self) -> None:
        assert office_title("  My conversation  ") == "My conversation"
        assert office_title(None) is None
        assert office_title("   ") is None

    def test_merge_carries_title(self) -> None:
        orch = RoomOrchestrator("office")
        sm = _make_sm()
        sm.display_name = "Fix the dashboard bug"
        sm.agents = {
            "w": Agent(
                id="w", color="#fff", number=0, state=AgentState.WORKING
            )
        }
        orch.add_session("oc-ses_titled", sm)
        state = orch.merge()
        assert state is not None
        sub = next(a for a in state.agents if a.character_type == "subagent")
        assert sub.name == "sub_Fix the dashboar"
        assert sub.title == "Fix the dashboard bug"

    def test_overflow_seats_beyond_ten(self) -> None:
        orch = RoomOrchestrator("office")
        # 20 sessions: more than the old 16-number ceiling (OFFICE_MAX_SEATED
        # plus 6 overflow spots), so the removed cap is actually exercised.
        count = OFFICE_MAX_SEATED + 10
        for i in range(count):
            sm = _make_sm()
            sm.agents = {
                f"w{i}": Agent(
                    id=f"w{i}", color="#fff", number=0, state=AgentState.WORKING
                )
            }
            orch.add_session(f"oc-ses_{i:02d}", sm)
        state = orch.merge()
        assert state is not None
        desks = sorted(
            a.desk
            for a in state.agents
            if a.desk and a.id not in PERSISTENT_AGENT_IDS
        )
        # No backend ceiling: every subagent gets its own desk number. Seat
        # capacity is enforced by the frontend seat policy. The three
        # synthesized persistent stand-ins are excluded from this pool count.
        assert len(desks) == count
        assert len(set(desks)) == len(desks)
        assert max(desks) == count

    def test_sessions_sharing_a_ten_char_prefix_stay_distinct(self) -> None:
        # Issue 714 follow-up 3: the teammate key used to be the first 10
        # characters of the session id, so every session started in one window
        # collapsed into one character on one desk (live: 12 rows, one desk).
        orch = RoomOrchestrator("office")
        orch.add_session("oc-ses_eb2AAAAAAA01", _make_sm())
        orch.add_session("oc-ses_eb2BBBBBBB02", _make_sm())
        state = orch.merge()
        assert state is not None
        teammates = [a for a in state.agents if a.character_type == "teammate"]
        assert len({a.id for a in teammates}) == 2
        assert len({a.desk for a in teammates}) == 2
