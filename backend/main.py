"""Web server. Run with:  uvicorn main:app --reload

The React app talks to these /api routes. In production this server also serves
the built React files, so the whole app is one deploy.
"""

from datetime import datetime
from pathlib import Path

import openai
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import agent
import db

db.init()
app = FastAPI(title="Vox")


class Command(BaseModel):
    text: str = Field(max_length=4000)
    now: str | None = None  # the user's local time, e.g. "2026-10-21T18:30"


class Meeting(BaseModel):
    transcript: str = Field(default="", max_length=60000)
    now: str | None = None


class Chat(BaseModel):
    text: str = Field(max_length=2000)
    history: list[dict] = []
    trip: dict = {}
    now: str | None = None


class Confirmation(BaseModel):
    pending_id: str
    yes: bool


class TaskPatch(BaseModel):
    title: str | None = None
    done: bool | None = None
    due: str | None = None
    time: str | None = None
    priority: str | None = None
    place: str | None = None


@app.get("/api/state")
def state():
    """Everything the screen shows: tasks, memory, activity, and which models are in use."""
    return {
        "tasks": db.list_tasks(),
        "memory": db.list_memory(),
        "activity": db.list_activity(),
        "meetings": db.list_meetings(),
        "models": agent.MODELS,
        "mock": agent.MOCK,
    }


@app.post("/api/command")
def command(cmd: Command):
    if not cmd.text.strip():
        raise HTTPException(400, "Empty command")
    try:
        now = datetime.fromisoformat(cmd.now) if cmd.now else None
    except ValueError:
        now = None
    try:
        result = agent.run_command(cmd.text, now)
    except openai.APITimeoutError:
        raise HTTPException(504, "Nemotron took too long to answer. Please try again.")
    except openai.AuthenticationError:
        raise HTTPException(502, "Token Factory rejected the API key. Check NEBIUS_API_KEY in backend/.env.")
    except openai.APIError as e:
        raise HTTPException(502, f"Token Factory error: {e.message}")
    except ValueError:
        raise HTTPException(502, "I couldn't understand the model's answer. Please say it another way.")
    return {**result, **state()}


@app.post("/api/confirm")
def confirm(c: Confirmation):
    return {**agent.confirm(c.pending_id, c.yes), **state()}


@app.post("/api/undo")
def undo():
    label = db.undo()
    if label and len(label) > 60:
        label = label[:57] + "…"
    reply = f'Undid "{label}".' if label else "Nothing to undo."
    return {"reply": reply, **state()}


# Co-pilot: small talk with Nemotron Nano while you drive.

@app.post("/api/chat")
def chat(c: Chat):
    try:
        now = datetime.fromisoformat(c.now) if c.now else None
    except ValueError:
        now = None
    try:
        return agent.copilot(c.text, c.history, c.trip, now)
    except openai.APIError as e:
        raise HTTPException(502, f"Token Factory error: {e.message}")


# Meeting mode: the browser records a transcript, Nemotron summarizes it when asked.

@app.post("/api/meetings")
def add_meeting(m: Meeting):
    if not m.transcript.strip():
        raise HTTPException(400, "Nothing was recorded")
    meeting = db.add_meeting(m.transcript.strip())
    return {"meeting": meeting, **state()}


@app.post("/api/meetings/{meeting_id}/summary")
def summarize(meeting_id: int, m: Meeting):
    try:
        now = datetime.fromisoformat(m.now) if m.now else None
    except ValueError:
        now = None
    try:
        meeting = agent.summarize_meeting(meeting_id, now)
    except openai.APIError as e:
        raise HTTPException(502, f"Token Factory error: {e.message}")
    except ValueError:
        raise HTTPException(502, "I couldn't read the model's summary. Please try again.")
    if not meeting:
        raise HTTPException(404, "No such meeting")
    return {"meeting": meeting, **state()}


@app.post("/api/meetings/{meeting_id}/tasks")
def meeting_tasks(meeting_id: int):
    applied = agent.meeting_to_tasks(meeting_id)
    n = len(applied)
    reply = f"Added {n} task{'s' if n != 1 else ''} from the meeting." if n else "No action items for you in that meeting."
    return {"reply": reply, "applied": applied, **state()}


@app.delete("/api/meetings/{meeting_id}")
def remove_meeting(meeting_id: int):
    db.delete_meeting(meeting_id)
    return state()


# Small manual controls (clicking a checkbox, editing a title, the delete button)

@app.patch("/api/tasks/{task_id}")
def patch_task(task_id: int, patch: TaskPatch):
    if not db.get_task(task_id):
        raise HTTPException(404, "No such task")
    db.snapshot("edit by hand")
    db.update_task(task_id, **patch.model_dump(exclude_none=True))
    return state()


@app.delete("/api/tasks/{task_id}")
def remove_task(task_id: int):
    if not db.get_task(task_id):
        raise HTTPException(404, "No such task")
    db.snapshot("delete by hand")
    db.delete_task(task_id)
    return state()


@app.delete("/api/memory/{key}")
def remove_memory(key: str):
    db.snapshot(f"forget {key}")
    db.forget(key)
    return state()


# Serve the built React app (frontend/dist) when it exists.
DIST = (Path(__file__).parent.parent / "frontend" / "dist").resolve()
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        file = (DIST / path).resolve()
        # Security: only ever serve files that are really inside dist/.
        # Without this check, "/..%2f..%2fbackend%2f.env" would leak the API key.
        if path and file.is_file() and file.is_relative_to(DIST):
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
