# backend/app/core/room_orchestrator.py
"""Room-level session orchestration for Agent Teams support.

Merges multiple session StateMachines into a single GameState.
Solo sessions (one session, no team_name) get a trivial pass-through.
Team sessions get lead/teammate/subagent character allocation and a
merged kanban board.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.models.agents import Agent, AgentState, BossState, OfficeState
from app.models.common import TodoStatus
from app.models.overview import OverviewBucket, OverviewEntry, OverviewState
from app.models.sessions import GameState, KanbanTask, WhiteboardData

if TYPE_CHECKING:
    from app.core.state_machine import StateMachine

logger = logging.getLogger(__name__)

# Colors assigned to teammates in order of arrival (index 0 = first teammate)
# Single merged office floor (issue 221, operator directive 2026-10-02):
# every real session/agent is rendered in ONE office. Desk allocation is
# deterministic (insertion order) and capped at the W17ant workstation count;
# overflow stays in the sidebar but off the floor (no wrap, no collisions).
OFFICE_ROOM_ID = "office"
OFFICE_MAX_SEATED = 10  # number of W17ant workstations on the DM floor

_RUN_ID_RE = re.compile(r"^orch-(\d{1,4})-([a-z]+)")


def office_session_name(session_id: str) -> str:
    """Deterministic, human-readable floor name for an agent-less session."""
    sid = str(session_id or "")
    if "agentchat-sol-dockerhost" in sid:
        return "Sol Docker"
    if "agentchat-sol-webserver" in sid:
        return "Sol Webserver"
    m = _RUN_ID_RE.match(sid)
    if m:
        return f"Run {m.group(1)} {m.group(2).title()}"[:24]
    if sid.startswith("oc-"):
        return "OpenChamber " + sid[-4:]
    return sid[:16] or "Agent"


_TEAMMATE_COLORS = [
    "#3b82f6",  # blue
    "#22c55e",  # green
    "#a855f7",  # purple
    "#f97316",  # orange
    "#ec4899",  # pink
    "#14b8a6",  # teal
]

# Maps BossState to AgentState for teammate character rendering
_BOSS_TO_AGENT: dict[BossState, AgentState] = {
    BossState.IDLE: AgentState.IDLE,
    BossState.PHONE_RINGING: AgentState.WAITING,
    BossState.ON_PHONE: AgentState.WORKING,
    BossState.RECEIVING: AgentState.THINKING,
    BossState.WORKING: AgentState.WORKING,
    BossState.DELEGATING: AgentState.WORKING,
    BossState.WAITING_PERMISSION: AgentState.WAITING_PERMISSION,
    BossState.REVIEWING: AgentState.WORKING,
    BossState.COMPLETING: AgentState.COMPLETED,
}

# Maps BossState to a Command Center status bucket. "needs_you" surfaces the
# terminals that are blocked on the user; "done" covers idle/finished turns.
_BOSS_TO_BUCKET: dict[BossState, OverviewBucket] = {
    BossState.WAITING_PERMISSION: "needs_you",
    BossState.PHONE_RINGING: "needs_you",
    BossState.WORKING: "working",
    BossState.DELEGATING: "working",
    BossState.REVIEWING: "working",
    BossState.RECEIVING: "working",
    BossState.ON_PHONE: "working",
    BossState.IDLE: "done",
    BossState.COMPLETING: "done",
}


def _overview_bucket(sm: StateMachine) -> OverviewBucket:
    """Pick the Command Center zone for a session, smoothing out flicker.

    The boss drops to ``IDLE`` in the brief gap *between* tool calls and right
    after a subagent stops, even though the turn is still running. Mapping that
    transient idle straight to "done" makes the terminal jump out of the working
    zone and back every tool cycle. So a session counts as still working when
    its turn is in progress (``turn_active``) or it has live subagents — only a
    genuinely finished/waiting turn lands in "done".
    """
    bucket = _BOSS_TO_BUCKET.get(sm.boss_state)
    if bucket is None:
        # An unknown BossState should fail safe to "done" rather than silently
        # masking the session as "working"; flag it so the map can be updated.
        logger.warning("No overview bucket for BossState %s; defaulting to 'done'", sm.boss_state)
        bucket = "done"
    if bucket == "done" and (sm.turn_active or sm.agents):
        return "working"
    return bucket


@dataclass
class _SessionEntry:
    session_id: str
    sm: StateMachine
    is_lead: bool
    color: str
    teammate_name: str | None


class RoomOrchestrator:
    """Merges all sessions in a room into a single GameState.

    For solo sessions (one session, no team_name), passes through unchanged.
    For team sessions, builds character hierarchy and aggregates kanban board.
    """

    def __init__(self, room_id: str) -> None:
        self.room_id = room_id
        self.is_office = room_id == OFFICE_ROOM_ID
        self._sessions: dict[str, _SessionEntry] = {}

    # ------------------------------------------------------------------
    # Session registry
    # ------------------------------------------------------------------

    def add_session(self, session_id: str, sm: StateMachine) -> None:
        """Register a session. Call once when session first joins this room."""
        # Team session: lead has no teammate_name, or is explicitly flagged.
        # No team context -> solo session, always the lead. On the merged office
        # floor the FIRST session owns the boss; every other session becomes a
        # visible character (deterministic, insertion order).
        if self.is_office:
            is_lead = len(self._sessions) == 0
        else:
            is_lead = sm.is_lead or sm.teammate_name is None if sm.team_name else True

        color = "#f59e0b" if is_lead else self._next_teammate_color()

        self._sessions[session_id] = _SessionEntry(
            session_id=session_id,
            sm=sm,
            is_lead=is_lead,
            color=color,
            teammate_name=sm.teammate_name,
        )

    def remove_session(self, session_id: str) -> None:
        """Deregister a session."""
        self._sessions.pop(session_id, None)

    def update_session(self, session_id: str, sm: StateMachine) -> None:
        """Update the StateMachine reference for an existing session."""
        if session_id in self._sessions:
            self._sessions[session_id].sm = sm
        else:
            self.add_session(session_id, sm)

    @property
    def is_empty(self) -> bool:
        return len(self._sessions) == 0

    @property
    def _is_solo(self) -> bool:
        return len(self._sessions) <= 1

    # ------------------------------------------------------------------
    # Merge
    # ------------------------------------------------------------------

    def merge(self) -> GameState | None:
        """Return a merged GameState from all sessions, or None if empty."""
        if not self._sessions:
            return None
        if self.is_office:
            # The office floor must render even with a single session.
            return self._merge_office()

        lead_entry = self._lead_entry()
        if lead_entry is None:
            return None

        lead_state = lead_entry.sm.to_game_state(lead_entry.session_id)

        if self._is_solo:
            return lead_state

        return self._merge_team(lead_entry, lead_state)

    # ------------------------------------------------------------------
    # Merged office floor (issue 221, operator directive)
    # ------------------------------------------------------------------

    def _merge_office(self) -> GameState | None:
        """One floor for every real session/agent, deterministically seated.

        Every session's agents become characters (their real names/states).
        Sessions with no agents contribute one session-level character. The
        first OFFICE_MAX_SEATED characters get workstations 1..N; overflow is
        dropped from the floor (still present in the sidebar). No wrapping, no
        two characters on one workstation.
        """
        first_entry = next(iter(self._sessions.values()))
        first_state = first_entry.sm.to_game_state(first_entry.session_id)

        merged_agents: list[Agent] = []
        seated = 0
        for session_id, entry in self._sessions.items():
            if seated >= OFFICE_MAX_SEATED:
                break
            state = entry.sm.to_game_state(session_id)
            session_agents = list(state.agents)
            if session_agents:
                for agent in session_agents:
                    if seated >= OFFICE_MAX_SEATED:
                        break
                    seated += 1
                    merged_agents.append(
                        agent.model_copy(
                            update={
                                "character_type": "teammate",
                                "parent_session_id": session_id,
                                "number": seated,
                                "desk": seated,
                            }
                        )
                    )
            else:
                seated += 1
                merged_agents.append(
                    Agent(
                        id=f"off-{session_id[:10]}",
                        name=office_session_name(session_id),
                        color=_TEAMMATE_COLORS[(seated - 1) % len(_TEAMMATE_COLORS)],
                        number=seated,
                        state=_BOSS_TO_AGENT.get(
                            state.boss.state, AgentState.WORKING
                        ),
                        desk=seated,
                        bubble=state.boss.bubble,
                        current_task=state.boss.current_task,
                        character_type="teammate",
                        parent_session_id=session_id,
                    )
                )

        desk_count = max(8, len(merged_agents) + 2)
        return GameState(
            session_id=first_entry.session_id,
            floor_id=first_entry.sm.floor_id,
            room_id=OFFICE_ROOM_ID,
            boss=first_state.boss,
            agents=merged_agents,
            office=OfficeState(
                desk_count=desk_count,
                elevator_state=first_state.office.elevator_state,
                phone_state=first_state.office.phone_state,
                context_utilization=first_state.office.context_utilization,
                tool_uses_since_compaction=first_state.office.tool_uses_since_compaction,
                print_report=first_state.office.print_report,
            ),
            last_updated=datetime.now(UTC),
            history=first_state.history,
            todos=first_state.todos,
            arrival_queue=first_state.arrival_queue,
            departure_queue=first_state.departure_queue,
            whiteboard_data=first_state.whiteboard_data,
            conversation=first_state.conversation,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _lead_entry(self) -> _SessionEntry | None:
        for entry in self._sessions.values():
            if entry.is_lead:
                return entry
        # Fallback: first session if no explicit lead
        return next(iter(self._sessions.values()), None)

    def _next_teammate_color(self) -> str:
        teammate_count = sum(1 for e in self._sessions.values() if not e.is_lead)
        return _TEAMMATE_COLORS[teammate_count % len(_TEAMMATE_COLORS)]

    def _merge_team(self, lead_entry: _SessionEntry, lead_state: GameState) -> GameState:
        merged_agents: list[Agent] = []
        all_kanban: dict[str, KanbanTask] = {}

        # Lead's subagents -> character_type="subagent"
        for agent in lead_state.agents:
            merged_agents.append(
                agent.model_copy(
                    update={
                        "character_type": "subagent",
                        "parent_session_id": lead_entry.session_id,
                    }
                )
            )

        # Lead's kanban tasks
        for task in lead_entry.sm.kanban_tasks.values():
            all_kanban[task.task_id] = KanbanTask(
                task_id=task.task_id,
                subject=task.subject,
                status=task.status,
                assignee=task.assignee,
                linear_id=task.linear_id,
            )

        desk_number = 0
        for session_id, entry in self._sessions.items():
            if entry.is_lead:
                continue

            tm_state = entry.sm.to_game_state(session_id)
            tm_id = f"tm-{session_id[:8]}"
            agent_state = _BOSS_TO_AGENT.get(tm_state.boss.state, AgentState.WORKING)

            # Teammate's boss -> Agent with character_type="teammate"
            merged_agents.append(
                Agent(
                    id=tm_id,
                    name=entry.teammate_name or f"Teammate-{session_id[:4]}",
                    color=entry.color,
                    number=desk_number,
                    state=agent_state,
                    desk=desk_number,
                    bubble=tm_state.boss.bubble,
                    current_task=tm_state.boss.current_task,
                    character_type="teammate",
                    parent_session_id=session_id,
                )
            )

            # Teammate's subagents
            for agent in tm_state.agents:
                merged_agents.append(
                    agent.model_copy(
                        update={
                            "character_type": "subagent",
                            "parent_session_id": session_id,
                            "parent_id": tm_id,
                        }
                    )
                )

            # Teammate's kanban tasks
            for task in entry.sm.kanban_tasks.values():
                all_kanban[task.task_id] = KanbanTask(
                    task_id=task.task_id,
                    subject=task.subject,
                    status=task.status,
                    assignee=entry.teammate_name or task.assignee,
                    linear_id=task.linear_id,
                )

            desk_number += 1

        # Infer in_progress for active sessions
        self._infer_in_progress(all_kanban)

        merged_whiteboard = WhiteboardData(
            **lead_state.whiteboard_data.model_dump(exclude={"kanban_tasks"}),
            kanban_tasks=list(all_kanban.values()),
        )
        desk_count = max(8, len(merged_agents) + 2)

        return GameState(
            session_id=lead_entry.session_id,
            floor_id=lead_entry.sm.floor_id,
            room_id=lead_entry.sm.room_id,
            boss=lead_state.boss,
            agents=merged_agents,
            office=OfficeState(
                desk_count=desk_count,
                elevator_state=lead_state.office.elevator_state,
                phone_state=lead_state.office.phone_state,
                context_utilization=lead_state.office.context_utilization,
                tool_uses_since_compaction=lead_state.office.tool_uses_since_compaction,
                print_report=lead_state.office.print_report,
            ),
            last_updated=datetime.now(UTC),
            history=lead_state.history,
            todos=lead_state.todos,
            arrival_queue=lead_state.arrival_queue,
            departure_queue=lead_state.departure_queue,
            whiteboard_data=merged_whiteboard,
            conversation=lead_state.conversation,
        )

    def _infer_in_progress(self, tasks: dict[str, KanbanTask]) -> None:
        """Mark the first pending task as in_progress for each active session."""
        active_assignees: set[str] = set()
        for entry in self._sessions.values():
            if (
                entry.sm.boss_state not in (BossState.IDLE, BossState.COMPLETING)
                and entry.teammate_name is not None
            ):
                active_assignees.add(entry.teammate_name)

        promoted: set[str] = set()
        for task in tasks.values():
            if (
                task.status == "pending"
                and task.assignee is not None
                and task.assignee in active_assignees
                and task.assignee not in promoted
            ):
                task.status = "in_progress"
                promoted.add(task.assignee)


# ----------------------------------------------------------------------
# Command Center overview (cross-session, peer merge — no lead, no desks)
# ----------------------------------------------------------------------


def build_overview(sessions: dict[str, StateMachine]) -> OverviewState:
    """Build a compact cross-session overview for the Command Center.

    Every session is an equal peer: one boss snapshot each, mapped to a status
    bucket. The frontend joins ``session_id`` to a project label and applies the
    "ended" bucket from its session list, so neither is included here.
    """
    entries: list[OverviewEntry] = []
    # Snapshot the registry up front: the caller holds ``_sessions_lock`` so the
    # dict can't be resized mid-iteration here, but copy defensively in case a
    # caller passes an unlocked registry.
    for session_id, sm in list(sessions.items()):
        # Snapshot each StateMachine's mutable collections so an in-place
        # mutation by that session's handlers (e.g. ``del sm.agents[id]``)
        # can't raise "dict changed size during iteration" / torn counts.
        todos = list(sm.todos)
        todo_total = len(todos)
        todo_done = sum(1 for t in todos if t.status == TodoStatus.COMPLETED)
        entries.append(
            OverviewEntry(
                session_id=session_id,
                bucket=_overview_bucket(sm),
                state=sm.boss_state,
                current_task=sm.boss_current_task,
                todo_done=todo_done,
                todo_total=todo_total,
                subagent_count=len(list(sm.agents)),
            )
        )
    return OverviewState(entries=entries, last_updated=datetime.now(UTC))
