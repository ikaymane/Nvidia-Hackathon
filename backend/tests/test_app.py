"""Fast tests that never call the real model. Run:  python -m pytest -q

Each test gets its own empty database file, and the agent runs in offline (mock) mode.
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

import agent
import db
import main


@pytest.fixture(autouse=True)
def fresh(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(agent, "MOCK", True)
    agent._history.clear()
    agent._pending.clear()
    db.init()


@pytest.fixture
def client():
    return TestClient(main.app)


def plan(monkeypatch, actions, reply="ok"):
    """Make the fake model return exactly these actions."""
    monkeypatch.setattr(agent, "_mock_plan", lambda text: {"actions": actions, "reply": reply})


# ---------- API ----------

def test_add_complete_and_undo(client):
    client.post("/api/command", json={"text": "buy coffee"})
    r = client.post("/api/command", json={"text": "done coffee"}).json()
    assert r["tasks"][0]["done"] is True
    r = client.post("/api/undo").json()
    assert r["tasks"][0]["done"] is False


def test_undo_also_restores_memory(client, monkeypatch):
    db.remember("mom", "Fatima")
    plan(monkeypatch, [{"type": "forget", "key": "mom"}])
    assert client.post("/api/command", json={"text": "forget mom"}).json()["memory"] == []
    assert client.post("/api/undo").json()["memory"] == [{"key": "mom", "value": "Fatima"}]


def test_bulk_delete_waits_for_confirmation(client, monkeypatch):
    a, b = db.add_task("A"), db.add_task("B")
    plan(monkeypatch, [{"type": "delete", "id": a["id"]}, {"type": "delete", "id": b["id"]}])
    r = client.post("/api/command", json={"text": "delete both"}).json()
    assert r["needs_confirm"] and len(r["tasks"]) == 2  # nothing deleted yet
    r = client.post("/api/confirm", json={"pending_id": r["pending_id"], "yes": True}).json()
    assert r["tasks"] == []


def test_bulk_delete_can_be_refused(client, monkeypatch):
    a, b = db.add_task("A"), db.add_task("B")
    plan(monkeypatch, [{"type": "delete", "id": a["id"]}, {"type": "delete", "id": b["id"]}])
    r = client.post("/api/command", json={"text": "delete both"}).json()
    r = client.post("/api/confirm", json={"pending_id": r["pending_id"], "yes": False}).json()
    assert len(r["tasks"]) == 2


def test_empty_and_oversized_commands_rejected(client):
    assert client.post("/api/command", json={"text": "   "}).status_code == 400
    assert client.post("/api/command", json={"text": "x" * 5000}).status_code == 422


def test_activity_is_logged(client):
    client.post("/api/command", json={"text": "buy milk"})
    log = client.get("/api/state").json()["activity"]
    assert log[0]["text"] == "buy milk" and log[0]["changes"] == 1


def test_manual_edit_cannot_blank_a_title(client):
    t = db.add_task("Keep me")
    client.patch(f"/api/tasks/{t['id']}", json={"title": "  "})
    assert db.get_task(t["id"])["title"] == "Keep me"


def test_path_traversal_is_blocked(client):
    if not main.DIST.exists():
        pytest.skip("frontend not built")
    for evil in ["..%2f..%2fbackend%2f.env", "..%5c..%5cbackend%5c.env", "%2e%2e/%2e%2e/backend/.env"]:
        body = client.get(f"/{evil}").text
        assert "NEBIUS_API_KEY" not in body


# ---------- agent safety checks ----------

def test_validate_drops_bad_actions():
    t = db.add_task("Real")
    actions = agent._validate(
        [
            {"type": "delete", "id": 999},  # task doesn't exist
            {"type": "delete", "id": t["id"]},
            {"type": "delete", "id": str(t["id"])},  # duplicate
            {"type": "add", "title": "   "},  # empty
            {"type": "add", "title": "Ok", "due": "someday soon", "time": "6pm", "priority": "mega"},
            {"type": "explode"},  # unknown
            "garbage",
        ]
    )
    assert [a["type"] for a in actions] == ["delete", "add"]
    assert "due" not in actions[1] and "time" not in actions[1] and actions[1]["priority"] == "normal"


def test_bad_date_in_update_keeps_existing_date():
    t = db.add_task("Report", due="2026-10-22")
    [a] = agent._validate([{"type": "update", "id": t["id"], "due": "whenever"}])
    agent.apply_actions([a], "test")
    assert db.get_task(t["id"])["due"] == "2026-10-22"


WED = datetime(2026, 10, 21, 10, 0)  # a Wednesday
MON = datetime(2026, 10, 26, 10, 0)


@pytest.mark.parametrize(
    "word,now,expected",
    [
        ("today", WED, "2026-10-21"),
        ("tonight", WED, "2026-10-21"),
        ("tomorrow", WED, "2026-10-22"),
        ("friday", WED, "2026-10-23"),
        ("Friday", WED, "2026-10-23"),
        ("this friday", WED, "2026-10-23"),
        ("wednesday", WED, "2026-10-21"),
        ("monday", WED, "2026-10-26"),
        ("next monday", MON, "2026-11-02"),
        ("weekend", WED, "2026-10-24"),
        ("next week", WED, "2026-10-26"),
        ("in 3 days", WED, "2026-10-24"),
        ("2026-11-10", WED, "2026-11-10"),
        ("2026-02-30", WED, None),
        ("soonish", WED, None),
    ],
)
def test_resolve_date(word, now, expected):
    assert agent.resolve_date(word, now) == expected


def test_parse_json_handles_thinking_and_extra_text():
    raw = '<think>let me see</think> Sure! {"actions": [], "reply": "hi"} hope that helps'
    assert agent._parse_json(raw) == {"actions": [], "reply": "hi"}
    with pytest.raises(ValueError):
        agent._parse_json("no json here")


@pytest.mark.parametrize(
    "text,tier",
    [
        ("call mom", "fast"),
        ("plan my exam revision", "deep"),
        ("break it down for me", "deep"),
        ("buy milk, call mom and also book the dentist", "smart"),
        (" ".join(["word"] * 25), "smart"),
        ("give me a short briefing of my day: anything overdue, what's due today, and the focus", "fast"),
        ("what do I have this week and what is overdue and what is urgent?", "fast"),
    ],
)
def test_model_routing(text, tier):
    assert agent.pick_tier(text) == tier


def test_history_keeps_only_recent_turns():
    for i in range(10):
        agent._remember_turn(f"command {i}", "ok", [])
    assert len(agent._history) == agent.HISTORY_TURNS * 2
    assert agent._history[-2]["content"] == "command 9"


def test_briefing_facts_are_computed_by_code(client):
    db.add_task("Old thing", due="2026-10-20")
    db.add_task("Dentist", due="2026-10-22", time="15:00")
    db.add_task("Thesis", due="2026-11-01", priority="high")
    r = client.post("/api/command", json={"text": "brief me", "now": "2026-10-21T08:00:00"}).json()
    assert "overdue: Old thing" in r["reply"]
    assert "today: nothing" in r["reply"]
    assert "tomorrow: Dentist at 15:00" in r["reply"]
    assert "Thesis (urgent)" in r["reply"]
    assert r["applied"] == []


def test_prompt_uses_the_users_clock():
    prompt = agent._system_prompt(datetime(2026, 12, 31, 23, 0))
    assert "Thursday 2026-12-31 (today)" in prompt
    assert "Friday 2027-01-01 (tomorrow)" in prompt


def test_meeting_prompt_only_gets_facts_the_transcript_mentions():
    db.remember("exam start", "November 10")
    db.remember("user name", "Aymane")
    memory = agent.memory_for_transcript("Aymane will record the demo video by Friday.")
    assert "Aymane" in memory
    assert "November" not in memory
