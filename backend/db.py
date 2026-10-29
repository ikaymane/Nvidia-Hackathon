"""SQLite storage for tasks, memory facts, the activity log and undo snapshots.

Everything lives in one file (vox.db) next to this script.
Set VOX_DB to use a different file (the tests do this).
"""

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(os.getenv("VOX_DB", Path(__file__).parent / "vox.db"))

TASK_FIELDS = ("title", "notes", "due", "time", "priority", "project", "place", "done")


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # rows behave like dicts
    return conn


def init():
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                notes TEXT DEFAULT '',
                due TEXT,              -- YYYY-MM-DD or NULL
                time TEXT,             -- HH:MM or NULL
                priority TEXT DEFAULT 'normal',  -- low | normal | high
                project TEXT,
                done INTEGER DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS memory (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT,
                data TEXT NOT NULL,    -- JSON copy of all tasks + memory before a change
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,    -- what the user said
                reply TEXT,            -- what Vox answered
                model TEXT,            -- which Nemotron model handled it
                latency_ms INTEGER,
                changes INTEGER,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                transcript TEXT NOT NULL,
                summary TEXT,          -- JSON from Nemotron, NULL until summarized
                created_at TEXT
            );
            """
        )
        # Older databases: add the "place" column (where a task happens, for the map).
        cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)")]
        if "place" not in cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN place TEXT")


def now():
    return datetime.now().isoformat(timespec="seconds")


# ---------- tasks ----------

def list_tasks():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM tasks ORDER BY done, due IS NULL, due, time, id").fetchall()
    return [_task(r) for r in rows]


def get_task(task_id):
    with connect() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return _task(row) if row else None


def add_task(title, **fields):
    fields = _clean(fields)
    fields["title"] = title.strip()
    fields["created_at"] = fields["updated_at"] = now()
    cols = ", ".join(fields)
    marks = ", ".join("?" for _ in fields)
    with connect() as conn:
        cur = conn.execute(f"INSERT INTO tasks ({cols}) VALUES ({marks})", list(fields.values()))
        task_id = cur.lastrowid
    return get_task(task_id)


def update_task(task_id, **fields):
    fields = _clean(fields)
    if not fields:
        return get_task(task_id)
    fields["updated_at"] = now()
    sets = ", ".join(f"{k} = ?" for k in fields)
    with connect() as conn:
        conn.execute(f"UPDATE tasks SET {sets} WHERE id = ?", [*fields.values(), task_id])
    return get_task(task_id)


def delete_task(task_id):
    task = get_task(task_id)
    with connect() as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return task


def _clean(fields):
    """Keep only known columns, never allow an empty title, and store `done` as 0/1."""
    out = {k: v for k, v in fields.items() if k in TASK_FIELDS}
    if "title" in out:
        out["title"] = str(out["title"] or "").strip()
        if not out["title"]:
            del out["title"]
    if "done" in out:
        out["done"] = 1 if out["done"] else 0
    return out


def _task(row):
    task = dict(row)
    task["done"] = bool(task["done"])
    return task


# ---------- memory ----------

def list_memory():
    with connect() as conn:
        rows = conn.execute("SELECT key, value FROM memory ORDER BY key").fetchall()
    return [dict(r) for r in rows]


def remember(key, value):
    with connect() as conn:
        conn.execute(
            "INSERT INTO memory (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key.strip().lower(), value.strip()),
        )


def forget(key):
    with connect() as conn:
        conn.execute("DELETE FROM memory WHERE key = ?", (key.strip().lower(),))


# ---------- activity log ----------

def log_activity(text, reply, model, latency_ms, changes):
    with connect() as conn:
        conn.execute(
            "INSERT INTO activity (text, reply, model, latency_ms, changes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (text, reply, model, latency_ms, changes, now()),
        )
        conn.execute("DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 100)")


def list_activity(limit=50):
    with connect() as conn:
        rows = conn.execute("SELECT * FROM activity ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]


# ---------- meetings ----------

def add_meeting(transcript, title=None):
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO meetings (title, transcript, created_at) VALUES (?, ?, ?)",
            (title, transcript, now()),
        )
        meeting_id = cur.lastrowid
    return get_meeting(meeting_id)


def get_meeting(meeting_id):
    with connect() as conn:
        row = conn.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,)).fetchone()
    return _meeting(row) if row else None


def list_meetings(limit=20):
    with connect() as conn:
        rows = conn.execute("SELECT * FROM meetings ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [_meeting(r) for r in rows]


def save_summary(meeting_id, title, summary):
    with connect() as conn:
        conn.execute(
            "UPDATE meetings SET title = ?, summary = ? WHERE id = ?",
            (title, json.dumps(summary, ensure_ascii=False), meeting_id),
        )
    return get_meeting(meeting_id)


def delete_meeting(meeting_id):
    with connect() as conn:
        conn.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))


def _meeting(row):
    m = dict(row)
    m["summary"] = json.loads(m["summary"]) if m["summary"] else None
    return m


# ---------- undo ----------
# Before every change we save a full copy of the tasks and the memory.
# Undo simply puts the last copy back. The lists are small, so this is cheap and very safe.

def snapshot(label):
    data = json.dumps({"tasks": list_tasks(), "memory": list_memory()})
    with connect() as conn:
        conn.execute(
            "INSERT INTO snapshots (label, data, created_at) VALUES (?, ?, ?)",
            (label, data, now()),
        )
        # keep only the last 30 snapshots
        conn.execute("DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 30)")


def undo():
    """Restore the most recent snapshot. Returns its label, or None if nothing to undo."""
    with connect() as conn:
        row = conn.execute("SELECT * FROM snapshots ORDER BY id DESC LIMIT 1").fetchone()
        if not row:
            return None
        data = json.loads(row["data"])
        if isinstance(data, list):  # snapshots from before memory was included
            data = {"tasks": data, "memory": None}

        conn.execute("DELETE FROM tasks")
        for t in data["tasks"]:
            t["done"] = 1 if t["done"] else 0
            cols = ", ".join(t)
            marks = ", ".join("?" for _ in t)
            conn.execute(f"INSERT INTO tasks ({cols}) VALUES ({marks})", list(t.values()))
        if data["memory"] is not None:
            conn.execute("DELETE FROM memory")
            conn.executemany("INSERT INTO memory (key, value) VALUES (:key, :value)", data["memory"])

        conn.execute("DELETE FROM snapshots WHERE id = ?", (row["id"],))
    return row["label"]
