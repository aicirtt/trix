"""Shared state passed between the mission orchestrator, team orchestrators and agents.
(LangGraph keeps only declared keys, so every key used anywhere is declared here.)"""
from typing import TypedDict


class State(TypedDict, total=False):
    # event in
    case_id: str
    event: str              # reading | checkin | alert | symptom | pharmacy | report | devices | privacy
    who: str
    location: str           # iss | moon | mars
    vitals: dict
    readings: dict          # daily check-in values
    flags: list
    symptoms: str
    helper: str
    helper_skill: str
    request: dict           # operations request details
    # routing / tracing
    team: str
    handoff: bool
    _parent: str
    _prev: str
    # results
    trace: list
    assessments: list
    body_map: dict
    coach: dict
    reminder: dict
    urgency: str
    route: str
    specialist_plan: dict
    decision: dict
    procedure: dict
    safety: dict
    report: dict
    ops: dict
