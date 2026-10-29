"""Accuracy check against the REAL Nemotron models. Run:  python evals.py

Each scenario sets up some tasks/memory, says something, and checks the result.
The clock is frozen to Wednesday 2026-10-21 10:00 so date answers are predictable.
Uses a throwaway database, so your real tasks are never touched.
"""

import os
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

os.environ["VOX_DB"] = str(Path(tempfile.mkdtemp()) / "eval.db")

import agent  # noqa: E402  (must come after VOX_DB is set)
import db  # noqa: E402

NOW = datetime(2026, 10, 21, 10, 0)  # a Wednesday


def reset():
    for table in ("tasks", "memory", "snapshots", "activity"):
        with db.connect() as conn:
            conn.execute(f"DELETE FROM {table}")
    agent._history.clear()
    agent._pending.clear()


def say(text):
    return agent.run_command(text, NOW)


def titles():
    return [t["title"].lower() for t in db.list_tasks()]


def find(word):
    return next((t for t in db.list_tasks() if word in t["title"].lower()), None)


# ---------- scenarios: (name, function that returns (passed, detail)) ----------

def brain_dump():
    say("ok so I need to finish the hackathon video by Friday, oh and call my mom this weekend, "
        "and the dentist on Monday, no wait cancel that, and remind me to buy coffee")
    video = find("video")
    ok = len(db.list_tasks()) == 3 and not find("dentist") and video and video["due"] == "2026-10-23"
    return ok, titles()


def remember_fact():
    say("remember my sister is called Sara")
    mem = db.list_memory()
    return any("sara" in m["value"].lower() for m in mem), mem


def complete_via_memory():
    db.remember("mom", "The user's mother is called Fatima")
    db.add_task("Call mom")
    say("I already called Fatima")
    return find("mom")["done"], db.list_tasks()


def reschedule_and_prioritize():
    db.add_task("Write report", due="2026-10-22")
    say("push the report to Monday, it's urgent")
    t = find("report")
    return t["due"] == "2026-10-26" and t["priority"] == "high", t


def question_changes_nothing():
    db.add_task("Gym", due="2026-10-21")
    before = db.list_tasks()
    r = say("what do I have today?")
    return db.list_tasks() == before and "gym" in r["reply"].lower(), r["reply"]


def follow_up_uses_context():
    say("add a dentist appointment on Friday")
    say("actually make it Thursday")
    dentists = [t for t in db.list_tasks() if "dentist" in t["title"].lower()]
    return len(dentists) == 1 and dentists[0]["due"] == "2026-10-22", dentists


def bulk_delete_asks_first():
    db.add_task("Go to the gym")
    db.add_task("Buy groceries")
    r = say("delete the gym and the groceries")
    return r["needs_confirm"] and len(db.list_tasks()) == 2, r["reply"]


def french_command():
    say("ajoute acheter du pain demain")
    t = find("pain") or find("bread")
    return bool(t) and t["due"] == "2026-10-22", titles()


def plan_a_goal():
    say("plan my algorithms exam revision, the exam is on November 10")
    tasks = db.list_tasks()
    ok = (
        len(tasks) >= 3
        and all(t["due"] and "2026-10-21" <= t["due"] <= "2026-11-10" for t in tasks)
        and len({t["project"] for t in tasks}) == 1
    )
    return ok, [(t["title"], t["due"], t["project"]) for t in tasks]


def complete_only_today():
    db.add_task("Laundry", due="2026-10-21")
    db.add_task("Email professor", due="2026-10-21")
    db.add_task("Pay rent", due="2026-10-22")
    say("I finished everything for today")
    done = {t["title"]: t["done"] for t in db.list_tasks()}
    return done == {"Laundry": True, "Email professor": True, "Pay rent": False}, done


SCENARIOS = [
    brain_dump, remember_fact, complete_via_memory, reschedule_and_prioritize, question_changes_nothing,
    follow_up_uses_context, bulk_delete_asks_first, french_command, plan_a_goal, complete_only_today,
]


if __name__ == "__main__":
    if agent.MOCK:
        sys.exit("No API key / models configured in backend/.env, so there is nothing real to evaluate.")
    db.init()
    passed = 0
    for scenario in SCENARIOS:
        reset()
        start = time.time()
        try:
            ok, detail = scenario()
        except Exception as e:  # a crash counts as a failure, keep going
            ok, detail = False, f"error: {e}"
        passed += bool(ok)
        models = sorted({a["model"].split("/")[-1] for a in db.list_activity()})
        print(f"{'PASS' if ok else 'FAIL'}  {scenario.__name__:<28} {time.time() - start:5.1f}s  {', '.join(models)}")
        if not ok:
            print(f"      got: {detail}")
    print(f"\n{passed}/{len(SCENARIOS)} scenarios passed")
