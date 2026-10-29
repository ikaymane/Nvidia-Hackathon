# Vox — talk to your tasks

Vox is a voice-first personal task assistant. You don't fill in forms. You talk the way you'd
talk to a human assistant, messy and out of order, and Vox turns it into an organized task list.

> "Ok so I need to finish the hackathon video by Friday, oh and call my mom this weekend, and the
> dentist on Monday, no wait cancel that, and remind me to buy coffee."

→ three tasks with real dates, and no dentist task, because you cancelled it mid-sentence.

Built for the **Nebius x NVIDIA Global AI Hackathon** (Personal AI track).

## What it does

- **Brain-dump:** one long sentence becomes many structured tasks (dates, times, priority, project).
- **Fuzzy voice edits:** "move the video to Thursday and make it urgent", "delete the dentist thing",
  "I already called mom". Vox finds tasks by meaning, not exact words.
- **Safe by design:** deleting several tasks at once asks for a spoken or clicked "yes" first, and
  every change can be undone.
- **Memory:** "remember my mom is called Fatima" → later, "I called Fatima" checks off "Call mom".
  Facts are stored in your own local database, and you can delete them.
- **Planning:** "plan my exam revision, the exam is November 10" → a dated study plan.
- **Meeting mode:** "record this meeting" → Vox transcribes the room for as long as you want.
  Later, "summarize the meeting" → Nemotron Super returns the gist, key points, decisions and
  action items, reads the gist aloud, and adds *your* action items as tasks in one click.
- **Voice navigation, inside the app:** "take me to Rabat Ville" → a map pops up with the route.
  "Start navigation" swoops down onto your position and follows you: a live turn banner, spoken
  turn-by-turn directions, the remaining time, and an arrival call-out. "Demo drive" simulates the
  trip so you can watch it all from a desk. Tasks with a place get a one-tap "show the way" link.
- **Knows Morocco:** 45+ cities, train stations, airports and landmarks are built in, so "Fès" or
  "Rabat Ville" resolve instantly. Common speech-to-text slips ("fess", "rabbit ville") are repaired
  before the model sees them.
- **A co-pilot to talk to:** while you drive, Vox goes hands-free and keeps you company. Nemotron
  Nano opens the conversation, answers in about half a second, and brings up something new when
  it's quiet. Task requests ("remind me to call Sara") still go to the task agent.
- **Music for the road:** "play some music" starts a royalty-free road mix that quietens
  whenever Vox talks or listens.
- **Reminders that follow up:** for every task with a time, a notification 10 minutes before,
  one at the time, and 15 minutes later: "Did you do it?". Tap it and answer by voice
  ("yes", "not yet", or "I did half, move the rest to tomorrow"). Vox checks it off or replans.
- **Focus mode:** "what should I do now?" → one task, picked by urgency, and a 25-minute timer.
  Say "done" and the next one comes up.
- **Spoken replies** and English / French / Arabic speech input.

## How NVIDIA Nemotron and Nebius Token Factory are used

Every command goes to a Nemotron model on **Nebius Token Factory** (OpenAI-compatible API).
Vox routes each request to the right model size, so it stays fast and cheap:

| Tier | Model | Used for | Typical latency |
|---|---|---|---|
| Fast | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Short everyday commands and questions | ~0.5 s |
| Smart | `nvidia/nemotron-3-super-120b-a12b` | Long brain-dumps, multi-step edits; fallback when Nano returns nothing usable | ~1.5–5 s |
| Deep | `nvidia/Nemotron-3-Ultra-550b-a55b` | Planning and breaking down goals | ~2–3 s |

Meeting summaries always go to Super: a long, messy transcript needs the bigger model to keep
names, numbers and owners straight (~2 s for a short meeting).

The routing lives in [`backend/agent.py`](backend/agent.py) (`pick_tier`). The model gets the user's
words, their current tasks, their memory and a two-week calendar, and returns a JSON action plan.
The backend validates every action before touching the database.

## Run it locally

You need Python 3.11+, Node 20+, and Chrome or Edge (for speech recognition).

**1. Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # macOS/Linux: cp .env.example .env
```

Put your Token Factory key in `backend/.env` (`NEBIUS_API_KEY=...`). `python list_models.py`
shows the model IDs your key can use. Without a key, Vox runs in a simple offline mode.

```bash
uvicorn main:app --reload --port 8000
```

**2. Frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and tap the mic (or hold space).

**Single-server mode:** run `npm run build` in `frontend/`, and the backend serves the app itself
at http://localhost:8000.

## Quality: tests and a live model eval

```bash
cd backend
python -m pytest -q     # 36 fast tests, no API calls (safety checks, undo, dates, routing, security)
python evals.py         # 10 real-world scenarios against live Nemotron, scored automatically
```

The eval covers brain-dumps with self-corrections, memory, rescheduling, follow-ups
("actually make it Thursday"), bulk deletes, French, planning and bulk completion. Current
result: **10/10**.

Design choices that made it reliable:

- **Code does the math, the model does the language.** The model may answer `"due": "friday"`,
  and Python turns that into the exact date. The morning briefing is computed in Python
  (overdue, today, urgent), and Nano only phrases it. Small models are fast but bad at calendars.
- **Every model action is validated** (does the task exist? is the date real?) before it touches the database.
- **Escalation:** if Nano returns nothing usable for a request that should change something, the
  same request is retried on Super.

Maps use free OpenStreetMap services (Photon for place search, OSRM for routes, OSM tiles), so no
extra API key is needed. Your position is only sent to the routing service, and only when the
map is open. Reminders work while the Vox tab is open (there is no push server).

## Project layout

```
backend/
  main.py         FastAPI routes
  agent.py        Nemotron prompt, model routing, action validation
  db.py           SQLite: tasks, memory, undo snapshots
  list_models.py  lists available Nemotron models
  evals.py        accuracy check against the live models
  tests/          pytest suite
frontend/
  src/App.jsx              main screen
  src/useSpeech.js         browser speech recognition + spoken replies
  src/useMeeting.js        long-running meeting transcription
  src/useReminders.js      before / at / after notifications + check-ins
  src/components/          mic orb, task list, memory graph, meetings, map, focus mode
```

## Stack

React + Vite + Tailwind CSS + Framer Motion + Leaflet · FastAPI · SQLite · Nebius Token Factory · NVIDIA Nemotron 3

## License

MIT, see [LICENSE](LICENSE).
