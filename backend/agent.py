"""The brain: turns what the user said into a list of actions on their tasks.

Flow for one voice command:
  1. pick a Nemotron model (fast / smart / deep) based on the request
  2. send the user's words + their current tasks + their memory to the model
  3. the model answers with JSON: {"actions": [...], "reply": "..."}
  4. we check the actions and run them against the database
"""

import json
import os
import re
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI, BadRequestError

import db

load_dotenv(Path(__file__).parent / ".env")

API_KEY = os.getenv("NEBIUS_API_KEY", "").strip()
BASE_URL = os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/")
MODELS = {
    # Defaults are the Nemotron 3 models on Token Factory, so a deploy only needs the key.
    "fast": os.getenv("MODEL_FAST", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B").strip(),
    "smart": os.getenv("MODEL_SMART", "nvidia/nemotron-3-super-120b-a12b").strip(),
    "deep": os.getenv("MODEL_DEEP", "nvidia/Nemotron-3-Ultra-550b-a55b").strip(),
}
# If a tier is not configured, fall back to whichever one is.
_any = next((m for m in MODELS.values() if m), "")
MODELS = {tier: (m or _any) for tier, m in MODELS.items()}

MOCK = not (API_KEY and _any)  # no key -> simple offline rules, handy for UI work

# timeout: never let a voice command hang for minutes if the API is slow
client = None if MOCK else OpenAI(api_key=API_KEY, base_url=BASE_URL, timeout=30, max_retries=1)

# Commands that delete more than this many tasks wait for a "yes".
CONFIRM_DELETES_OVER = 1
_pending = {}  # pending_id -> list of actions waiting for confirmation

# Short-term conversation memory: the last few exchanges, so "move it to Friday"
# knows what "it" is. (Long-term facts live in the memory table instead.)
HISTORY_TURNS = 3
_history = []


SYSTEM_PROMPT = """You are Vox, a voice-first personal task assistant.
Today is {today}. The current time is {clock}.

Calendar for the next two weeks (use it, do not calculate dates yourself):
{calendar}

The user's words come from speech-to-text, so they are messy: filler words, repeats,
and self-corrections like "no wait", "actually", "cancel that", "scratch that".
When the user corrects themselves, only the final intention counts.
The user lives in Morocco. Speech-to-text can mangle Moroccan place names: if a name sounds
like a Moroccan city or station, write its correct spelling ("casa" = Casablanca). Never swap
one place for a different one.

Their current tasks (JSON):
{tasks}

Things you remember about the user:
{memory}

Answer with ONLY one JSON object, no other text:
{{"actions": [ ... ], "reply": "..."}}

Action shapes:
  {{"type": "add", "title": "...", "due": <a due value> or null, "time": "HH:MM" or null,
    "priority": "low" | "normal" | "high", "project": "..." or null, "notes": "...",
    "place": "where it happens, if the user names a real place" or null}}
  {{"type": "update", "id": <task id>, <only the fields that change>}}
  {{"type": "complete", "id": <task id>}}
  {{"type": "uncomplete", "id": <task id>}}
  {{"type": "delete", "id": <task id>}}
  {{"type": "remember", "key": "short name", "value": "the fact"}}
  {{"type": "forget", "key": "short name"}}
  {{"type": "navigate", "place": "the place to go, as a map search"}}

Rules:
- One spoken sentence can hold many tasks. Split them into separate "add" actions.
- Refer to existing tasks ONLY by their id from the list. Match by meaning, not exact words
  ("the dentist thing" -> the task about the dentist).
- If you are not sure which task the user means, take no action and ask in "reply".
- A due value is either a day word that the app converts exactly — "today", "tomorrow",
  "monday" ... "sunday", "weekend", "next week", "in 3 days" — or a "YYYY-MM-DD" date.
  ALWAYS use a day word for relative dates ("on Friday" -> "friday", "tonight" -> "today").
  Use "YYYY-MM-DD" only for named calendar dates ("November 10" -> "2026-11-10").
- Each task has a "when" label (today, tomorrow, overdue, in N days). Trust it for "today" questions.
- When the user says they finished several things ("everything for today", "all my errands"),
  add one "complete" action for each matching open task.
- Titles are short and start with a verb: "Call mom", "Buy coffee", "Record demo video".
- Something new the user needs to do is a new "add", even if a similar task exists. Only
  change an existing task when the user clearly refers to it ("move the video", "the dentist thing").
- Mark priority "high" only on the task the urgency words are about, never on its neighbours.
- When the user tells you a lasting fact about their life (who someone is, a routine,
  a preference), save it with "remember". Use memory to understand later commands.
- Never save a fact that is already in memory. To change a fact, reuse its existing key.
- If the user asks you to plan or break down a goal, add 3 to 7 concrete subtasks that share
  one "project", spread over sensible dates before the deadline.
- When the user wants to go somewhere or asks for directions ("take me to the train station",
  "how do I get to Marjane", "guide me to the pharmacy"), add one "navigate" action. The app opens
  a map with the route. Use the task's "place" when they say "take me there" about a task.
- When a task happens at a named place ("pick up the parcel at the post office"), fill "place".
- If the user only asks a question ("what's due today?"), use no actions and answer in "reply".
- Never invent tasks the user did not ask for (except subtasks when asked to plan).
- "reply" is spoken out loud: one or two short, warm sentences. No lists, no markdown, no ids.
- The reply must only describe actions that are really in "actions". Saying "done" with an
  empty action list is a mistake.

Examples (the ids here are made up; use the real ids from the task list):
User: "remember my sister is called Sara"
{{"actions": [{{"type": "remember", "key": "sister", "value": "The user's sister is called Sara"}}], "reply": "Noted, Sara is your sister."}}
User: "I already did the groceries" (task 4 is "Buy groceries")
{{"actions": [{{"type": "complete", "id": 4}}], "reply": "Nice, groceries are checked off."}}
User: "push the report to Monday and it's urgent" (task 7 is "Write report")
{{"actions": [{{"type": "update", "id": 7, "due": "monday", "priority": "high"}}], "reply": "Moved the report to Monday and marked it urgent."}}
User: "I did everything on today's list" (tasks 2 and 5 are due today, task 6 tomorrow)
{{"actions": [{{"type": "complete", "id": 2}}, {{"type": "complete", "id": 5}}], "reply": "All of today is done. Nice work!"}}
User: "how do I get to the central train station"
{{"actions": [{{"type": "navigate", "place": "central train station"}}], "reply": "Here's the way to the central train station."}}
"""

QUESTION = re.compile(
    r"\?\s*$|^(what|when|which|who|how|where|why|do i|did i|is|are|am i|show|list|tell me|read|give me|brief)\b",
    re.I,
)


# Speech-to-text mishearings of Moroccan names, repaired before the model sees them
# (same list as frontend/src/morocco.js). Only phrases that are never real English.
NAME_REPAIRS = [
    (r"\brabbit (ville|city)\b", "Rabat Ville"),
    (r"\b(fez|fess)\b", "Fès"),
    (r"\bmake ness\b", "Meknès"),
    (r"\bkenny tra\b|\bcanitra\b", "Kénitra"),
    (r"\bmarrakesh\b|\bmarakech\b", "Marrakech"),
    (r"\bcasa voyagers?\b", "Casa Voyageurs"),
    (r"\bwarzazat\b", "Ouarzazate"),
    (r"\bessawira\b", "Essaouira"),
]


def fix_names(text):
    for bad, good in NAME_REPAIRS:
        text = re.sub(bad, good, text, flags=re.I)
    return text


def pick_tier(text):
    """Model routing: cheap & fast for everyday commands, bigger models when needed."""
    words = len(text.split())
    if QUESTION.search(text):
        return "fast"  # questions change nothing, so answer them as fast as possible
    if re.search(r"\b(plan|break (it |this |that )?down|step[- ]by[- ]step|roadmap|organi[sz]e my)\b", text, re.I):
        return "deep"
    if words > 20 or len(re.findall(r"\b(and|also|then|plus)\b|,", text, re.I)) >= 2:
        return "smart"
    return "fast"


def run_command(text, now=None):
    """Main entry point. Returns everything the frontend needs to update itself.

    `now` is the user's local time (from their browser), so dates are right even when
    the server runs in another time zone.
    """
    text = fix_names(text.strip())
    now = now or datetime.now()
    started = time.time()

    if BRIEFING.search(text):
        return briefing(text, now)

    if MOCK:
        plan, model = _mock_plan(text), "offline-mock"
    else:
        tier = pick_tier(text)
        plan, model = _ask_model(text, tier, now)

    actions = _validate(plan.get("actions", []), now)
    reply = str(plan.get("reply", "")).strip()
    _remember_turn(text, reply, actions)

    deletes = [a for a in actions if a["type"] == "delete"]
    if len(deletes) > CONFIRM_DELETES_OVER:
        pending_id = uuid.uuid4().hex[:8]
        _pending[pending_id] = {"actions": actions, "label": text}
        titles = [db.get_task(a["id"])["title"] for a in deletes]
        latency = int((time.time() - started) * 1000)
        reply = f"That will delete {len(deletes)} tasks. Should I go ahead?"
        db.log_activity(text, reply, model, latency, 0)
        return {
            "reply": reply,
            "needs_confirm": True,
            "pending_id": pending_id,
            "preview": titles,
            "applied": [],
            "model": model,
            "latency_ms": latency,
        }

    applied = apply_actions(actions, label=text)
    reply = reply or _summary(applied)
    latency = int((time.time() - started) * 1000)
    db.log_activity(text, reply, model, latency, len(applied))
    return {
        "reply": reply,
        "needs_confirm": False,
        "applied": applied,
        "model": model,
        "latency_ms": latency,
    }


BRIEFING = re.compile(r"^(brief me|(give me )?(a |my )?(short |morning |daily )?briefing)\b", re.I)


def briefing(text, now):
    """Spoken summary of the day.

    Python works out the facts (what's overdue, today, urgent), because that has to be
    exactly right. Nemotron Nano only turns those facts into a natural sentence.
    """
    started = time.time()
    groups = {"overdue": [], "today": [], "tomorrow": [], "urgent later": []}
    for t in db.list_tasks():
        if t["done"]:
            continue
        when = _when(t["due"], now)
        label = t["title"] + (f" at {t['time']}" if t["time"] else "") + (" (urgent)" if t["priority"] == "high" else "")
        if when in ("overdue", "today", "tomorrow"):
            groups[when].append(label)
        elif t["priority"] == "high":
            groups["urgent later"].append(f"{label}, due {when}")
    facts = "\n".join(f"{k}: {', '.join(v) if v else 'nothing'}" for k, v in groups.items())

    if MOCK:
        reply, model = facts.replace("\n", ". "), "offline-mock"
    else:
        model = MODELS["fast"]
        reply = _chat(
            model,
            [
                {
                    "role": "system",
                    "content": "You turn task facts into a short spoken morning briefing: 2 or 3 warm sentences. "
                    "Use ONLY the facts given, never invent or move tasks. End with the single most important "
                    "thing to do first (overdue or urgent beats the rest). Plain text, no lists.",
                },
                {"role": "user", "content": f"Today is {now:%A}.\n{facts}"},
            ],
        ).strip()
        reply = re.sub(r"<think>.*?</think>", "", reply, flags=re.S).strip()

    latency = int((time.time() - started) * 1000)
    db.log_activity(text, reply, model, latency, 0)
    return {"reply": reply, "needs_confirm": False, "applied": [], "model": model, "latency_ms": latency}


def confirm(pending_id, yes):
    item = _pending.pop(pending_id, None)
    if not item:
        return {"reply": "That request expired. Please say it again.", "applied": []}
    if not yes:
        return {"reply": "Okay, I left everything as it was.", "applied": []}
    applied = apply_actions(item["actions"], label=item["label"])
    return {"reply": _summary(applied), "applied": applied}


def apply_actions(actions, label):
    """Run validated actions against the database. Saves an undo snapshot first."""
    if not actions:
        return []
    if any(a["type"] != "navigate" for a in actions):  # opening a map changes nothing to undo
        db.snapshot(label)

    applied = []
    for a in actions:
        kind = a["type"]
        if kind == "add":
            fields = {k: a.get(k) for k in ("due", "time", "priority", "project", "notes", "place") if a.get(k)}
            task = db.add_task(a["title"], **fields)
        elif kind == "update":
            fields = {k: v for k, v in a.items() if k not in ("type", "id")}
            task = db.update_task(a["id"], **fields)
        elif kind == "complete":
            task = db.update_task(a["id"], done=True)
        elif kind == "uncomplete":
            task = db.update_task(a["id"], done=False)
        elif kind == "delete":
            task = db.delete_task(a["id"])
        elif kind == "remember":
            db.remember(a["key"], a["value"])
            applied.append({"type": kind, "key": a["key"], "value": a["value"]})
            continue
        elif kind == "forget":
            db.forget(a["key"])
            applied.append({"type": kind, "key": a["key"]})
            continue
        elif kind == "navigate":
            applied.append({"type": kind, "place": a["place"]})  # the browser draws the route
            continue
        applied.append({"type": kind, "task": task})
    return applied


# ---------- co-pilot chat (while navigating) ----------

COPILOT_PROMPT = """You are Vox, riding along with the user as a warm, curious co-pilot.
They are on their way to {dest}. About {minutes} minutes left. Next: {next_step}.
It is {clock} on {today}.

What you know about them:
{memory}

Their open tasks: {tasks}

Have a real, light conversation to keep them company: react to what they say, share a short
thought, and often end with one easy question (their day, plans, music, food, the place they
are going, a task coming up). Never ask them to look at a screen or type. Keep every reply to
one or two short spoken sentences. No lists, no markdown. Speak English, unless the user
writes to you in another language: then answer in that language."""


def copilot(text, history, trip, now=None):
    """Small talk while driving. Nano: it has to be quick and short."""
    now = now or datetime.now()
    open_tasks = [t["title"] for t in db.list_tasks() if not t["done"]][:8]
    system = COPILOT_PROMPT.format(
        dest=trip.get("dest") or "their destination",
        minutes=trip.get("minutes", "a few"),
        next_step=trip.get("next") or "keep going",
        clock=now.strftime("%H:%M"),
        today=now.strftime("%A"),
        memory="\n".join(f"- {m['key']}: {m['value']}" for m in db.list_memory()) or "(nothing yet)",
        tasks=", ".join(open_tasks) or "none",
    )
    messages = [{"role": "system", "content": system}]
    for h in history[-10:]:
        if h.get("role") in ("user", "assistant") and str(h.get("content", "")).strip():
            messages.append({"role": h["role"], "content": str(h["content"])[:1000]})
    messages.append({"role": "user", "content": text})
    started = time.time()
    if MOCK:
        reply, model = "(offline mode) Nice! So, what's the plan once you get there?", "offline-mock"
    else:
        model = MODELS["fast"]
        reply = re.sub(r"<think>.*?</think>", "", _chat(model, messages), flags=re.S).strip()
    return {"reply": reply, "model": model, "latency_ms": int((time.time() - started) * 1000)}


# ---------- meeting mode ----------

MEETING_PROMPT = """You are Vox. Below is a raw speech-to-text transcript of a meeting, class or
conversation the user recorded. It is messy: no speaker names, missing punctuation, misheard words.
Today is {today}.

Background about the user, only to recognize names and owners. Never list it in your answer:
{memory}

Answer with ONLY one JSON object, no other text:
{{"title": "short title, max 6 words",
  "summary": "2 or 3 sentences: what this was about and what came out of it",
  "key_points": ["the important facts, numbers, names and dates the user must not forget"],
  "decisions": ["what was decided"],
  "action_items": [{{"title": "short task starting with a verb", "owner": "me" or a name or null,
                    "due": a day word like "friday" or "YYYY-MM-DD" or null}}],
  "spoken": "one or two warm sentences to read aloud: the gist and the most important next step"}}

Rules: use only what is in the transcript, never invent. Empty lists are fine. Keep every item short.
"owner" is "me" when the user (the person recording) said they would do it or was asked to.
Write in the language of the transcript."""


def memory_for_transcript(transcript):
    """Only the facts this transcript mentions, so the others can't leak into the summary."""
    heard = set(re.findall(r"\w+", transcript.lower()))
    facts = [m for m in db.list_memory()
             if heard & {w for w in re.findall(r"\w+", str(m["value"]).lower()) if len(w) > 2}]
    return "\n".join(f"- {m['key']}: {m['value']}" for m in facts) or "(nothing relevant)"


def summarize_meeting(meeting_id, now=None):
    """Turn a recorded transcript into a summary + action items, with Nemotron Super."""
    now = now or datetime.now()
    meeting = db.get_meeting(meeting_id)
    if not meeting:
        return None
    started = time.time()
    if MOCK:
        words = meeting["transcript"].split()
        data = {"title": " ".join(words[:5]) or "Meeting", "summary": "(offline mode) " + " ".join(words[:40]),
                "spoken": "(offline mode) Saved your meeting."}
        model = "offline-mock"
    else:
        # A long transcript needs the bigger model to keep the details straight.
        model = MODELS["smart"]
        memory = memory_for_transcript(meeting["transcript"])
        data = _parse_json(_chat(model, [
            {"role": "system", "content": MEETING_PROMPT.format(today=now.strftime("%A %Y-%m-%d"), memory=memory)},
            {"role": "user", "content": meeting["transcript"][:30000]},
        ]))

    def strings(key, limit):
        items = data.get(key) if isinstance(data.get(key), list) else []
        return [str(x).strip() for x in items if str(x).strip()][:limit]

    items = data.get("action_items") if isinstance(data.get("action_items"), list) else []
    summary = {
        "summary": str(data.get("summary", "")).strip(),
        "key_points": strings("key_points", 12),
        "decisions": strings("decisions", 8),
        "action_items": [
            {"title": str(i["title"]).strip(), "owner": i.get("owner"),
             "due": resolve_date(i["due"], now) if i.get("due") else None}
            for i in items if isinstance(i, dict) and str(i.get("title", "")).strip()
        ][:10],
        "spoken": str(data.get("spoken", "")).strip(),
    }
    title = str(data.get("title", "")).strip()[:80] or "Meeting"
    latency = int((time.time() - started) * 1000)
    db.log_activity(f"Summarize meeting: {title}", summary["spoken"] or summary["summary"], model, latency, 0)
    return {**db.save_summary(meeting_id, title, summary), "model": model, "latency_ms": latency}


def meeting_to_tasks(meeting_id):
    """Add the meeting's action items that belong to the user as tasks (undo-able)."""
    meeting = db.get_meeting(meeting_id)
    if not meeting or not meeting["summary"]:
        return []
    mine = [i for i in meeting["summary"]["action_items"]
            if str(i.get("owner") or "me").lower() in ("me", "i", "you", "user")]
    actions = [{"type": "add", "title": i["title"], "due": i.get("due"), "project": meeting["title"]} for i in mine]
    return apply_actions(_validate(actions), label=f"tasks from {meeting['title']}")


# ---------- talking to Nemotron ----------

def _ask_model(text, tier, now):
    model = MODELS[tier]
    messages = [
        {"role": "system", "content": _system_prompt(now)},
        *_history,
        {"role": "user", "content": text},
    ]
    can_escalate = tier == "fast" and MODELS["smart"] != model
    try:
        plan = _parse_json(_chat(model, messages))
    except ValueError:
        # The small model returned something we could not read: retry once with a bigger one.
        if not can_escalate:
            raise
        return _parse_json(_chat(MODELS["smart"], messages)), MODELS["smart"]

    # Safety net: the user asked for a change but the small model did nothing.
    if can_escalate and not _validate(plan.get("actions", []), now) and not QUESTION.search(text):
        try:
            return _parse_json(_chat(MODELS["smart"], messages)), MODELS["smart"]
        except ValueError:
            pass
    return plan, model


def _chat(model, messages):
    kwargs = dict(model=model, messages=messages, temperature=0.2, max_tokens=1500)
    try:
        # Nemotron models can "think" before answering. For snappy voice replies we turn it off.
        resp = client.chat.completions.create(
            **kwargs, extra_body={"chat_template_kwargs": {"enable_thinking": False}}
        )
    except BadRequestError:
        resp = client.chat.completions.create(**kwargs)  # model doesn't know that option
    return resp.choices[0].message.content or ""


def _remember_turn(text, reply, actions):
    """Keep the last few exchanges so follow-ups like "actually, make it Friday" work."""
    _history.append({"role": "user", "content": text})
    _history.append({"role": "assistant", "content": json.dumps({"actions": actions, "reply": reply})})
    del _history[: -HISTORY_TURNS * 2]


def _when(due, now):
    """A ready-made label so the model doesn't have to compare dates itself."""
    if not due:
        return "no date"
    days = (datetime.strptime(due, "%Y-%m-%d").date() - now.date()).days
    return {0: "today", 1: "tomorrow"}.get(days, "overdue" if days < 0 else f"in {days} days")


def _system_prompt(now):
    tasks = [
        {**{k: t[k] for k in ("id", "title", "due", "time", "priority", "project", "done")}, "when": _when(t["due"], now)}
        for t in db.list_tasks()
    ]
    memory = db.list_memory()
    names = {0: " (today)", 1: " (tomorrow)"}
    calendar = "\n".join(
        f"{(now + timedelta(days=i)):%A %Y-%m-%d}{names.get(i, '')}" for i in range(15)
    )
    return SYSTEM_PROMPT.format(
        today=now.strftime("%A %Y-%m-%d"),
        clock=now.strftime("%H:%M"),
        calendar=calendar,
        tasks=json.dumps(tasks, ensure_ascii=False) if tasks else "[] (no tasks yet)",
        memory="\n".join(f"- {m['key']}: {m['value']}" for m in memory) or "(nothing yet)",
    )


def _parse_json(raw):
    """Pull the JSON object out of the model's answer, even if it wrapped it in extra text."""
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.S).strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON in model reply: {raw[:200]}")
    try:
        data = json.loads(raw[start : end + 1])
    except json.JSONDecodeError as e:
        raise ValueError(f"Bad JSON from model: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("Model reply was not a JSON object")
    return data


# ---------- safety checks ----------

def _validate(actions, now=None):
    """Drop anything malformed or pointing at a task that does not exist."""
    now = now or datetime.now()
    known_ids = {t["id"] for t in db.list_tasks()}
    clean = []
    seen = set()  # the model sometimes repeats an action; doing it twice would be wrong
    for a in actions if isinstance(actions, list) else []:
        if not isinstance(a, dict):
            continue
        kind = a.get("type")
        if kind == "add" and str(a.get("title", "")).strip():
            a["title"] = str(a["title"]).strip()
            clean.append(_dates_ok(a, now))
        elif kind in ("update", "complete", "uncomplete", "delete"):
            try:
                a["id"] = int(a.get("id"))
            except (TypeError, ValueError):
                continue
            if a["id"] not in known_ids or (kind != "update" and (kind, a["id"]) in seen):
                continue
            seen.add((kind, a["id"]))
            clean.append(_dates_ok(a, now))
        elif kind == "remember" and a.get("key") and a.get("value"):
            a["key"], a["value"] = str(a["key"]), str(a["value"])
            clean.append(a)
        elif kind == "forget" and a.get("key"):
            a["key"] = str(a["key"])
            clean.append(a)
        elif kind == "navigate" and str(a.get("place", "")).strip():
            a["place"] = str(a["place"]).strip()
            clean.append(a)
    return clean


def _dates_ok(a, now):
    """Turn day words into real dates, and drop values the model got wrong.

    Dropping (not nulling) matters: on an "update", due=None would erase the task's date.
    """
    if a.get("due"):
        due = resolve_date(a["due"], now)
        if due:
            a["due"] = due
        else:
            a.pop("due")
    if a.get("time") and not re.fullmatch(r"\d{2}:\d{2}", str(a["time"])):
        a.pop("time")
    if a.get("priority") not in (None, "low", "normal", "high"):
        a["priority"] = "normal"
    return a


WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def resolve_date(value, now):
    """'friday' -> '2026-10-23'. Code does calendar math perfectly; small models don't.

    Returns a YYYY-MM-DD string, or None if the value makes no sense.
    """
    v = str(value).strip().lower()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        try:
            datetime.strptime(v, "%Y-%m-%d")
            return v
        except ValueError:
            return None  # e.g. 2026-02-30
    today = now.date()
    is_next = v.startswith("next ")
    v = re.sub(r"^(this|on|by|until|next)\s+", "", v)  # "this friday", "next monday" -> the upcoming one
    if v in ("today", "tonight", "now"):
        day = today
    elif v == "tomorrow":
        day = today + timedelta(days=1)
    elif v in ("weekend", "the weekend"):
        day = today + timedelta(days=(5 - today.weekday()) % 7)  # upcoming Saturday
    elif v == "week":  # from "next week"
        day = today + timedelta(days=7 - today.weekday())  # next Monday
    elif v in WEEKDAYS:
        ahead = (WEEKDAYS.index(v) - today.weekday()) % 7
        day = today + timedelta(days=ahead or (7 if is_next else 0))  # "next monday" said on a Monday
    elif m := re.fullmatch(r"in (\d+) days?", v):
        day = today + timedelta(days=int(m.group(1)))
    else:
        return None
    return day.isoformat()


def _summary(applied):
    counts = {}
    for a in applied:
        counts[a["type"]] = counts.get(a["type"], 0) + 1
    if not counts:
        return "I didn't change anything."
    words = {"add": "added", "update": "updated", "complete": "completed", "uncomplete": "reopened",
             "delete": "deleted", "remember": "remembered", "forget": "forgot", "navigate": "opened the map for"}
    noun = {"remember": "item", "forget": "item", "navigate": "place"}
    parts = [f"{words[k]} {n} {noun.get(k, 'task')}{'s' if n > 1 else ''}"
             for k, n in counts.items()]
    return "Done: " + ", ".join(parts) + "."


# ---------- offline mode (no API key yet) ----------

def _mock_plan(text):
    """Tiny rule-based stand-in so the app works before you have a key."""
    lower = text.lower()
    m = re.match(r"(delete|remove|cancel|done|finished|complete)\s+(.*)", lower)
    if m:
        verb, rest = m.groups()
        match = next((t for t in db.list_tasks() if rest.strip() and rest.strip() in t["title"].lower()), None)
        if not match:
            return {"actions": [], "reply": "(offline mode) I couldn't find that task."}
        kind = "delete" if verb in ("delete", "remove", "cancel") else "complete"
        return {"actions": [{"type": kind, "id": match["id"]}], "reply": f"(offline mode) {kind}d {match['title']}."}
    return {"actions": [{"type": "add", "title": text[:1].upper() + text[1:]}], "reply": "(offline mode) Added it."}
