import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  Undo2,
  Volume2,
  VolumeX,
  ArrowUp,
  ListTodo,
  Network,
  Activity,
  Cpu,
  Sunrise,
  Users,
  Target,
  Bell,
  BellRing,
  BellOff,
} from "lucide-react";
import { api } from "./api.js";
import { useSpeech, speak } from "./useSpeech.js";
import { useMic } from "./useMic.js";
import { useMeeting } from "./useMeeting.js";
import { useMusic } from "./useMusic.js";
import { fixHearing } from "./morocco.js";
import { useReminders, askNotificationPermission, notificationsAllowed } from "./useReminders.js";
import MeetingPanel from "./components/MeetingPanel.jsx";
import MapPanel from "./components/MapPanel.jsx";
import FocusMode, { focusQueue } from "./components/FocusMode.jsx";
import Intro from "./components/Intro.jsx";
import VoiceOrb from "./components/VoiceOrb.jsx";
import Tabs from "./components/Tabs.jsx";
import TaskList from "./components/TaskList.jsx";
import MemoryGraph from "./components/MemoryGraph.jsx";
import ActivityLog from "./components/ActivityLog.jsx";
import ConfirmCard from "./components/ConfirmCard.jsx";

const LANGS = [
  { code: "en-US", label: "EN" },
  { code: "fr-FR", label: "FR" },
  { code: "ar-MA", label: "AR" },
];

const YES = /^(yes|yeah|yep|sure|ok(ay)?|go ahead|do it|confirm|oui|نعم|اه)\b/i;
const NO = /^(no|nope|cancel|stop|don'?t|keep|non|لا)\b/i;

// Commands the browser handles itself, without a model call.
const FOCUS = /^(start |open |enter )?focus( mode)?\b|what should i (do|work on)( right)? (now|next)/i;
const MEETING_START = /\b(record|start recording|transcribe)\b.*\b(meeting|class|lecture|call|conversation|discussion)\b|^meeting mode\b/i;
const MEETING_RECAP = /\b(summar|recap|key points|important)\w*\b.*\b(meeting|class|lecture|call|discussion|conversation)\b/i;
const DONE = /^(done|finished|i('m| am)? (done|finished)|i did it|complete(d)?)\b/i;
const MUSIC_ON = /\b(play|put on|start|turn on)\b.*\b(music|radio|song|something)\b|^music\b/i;
const MUSIC_OFF = /\b(stop|pause|turn off|mute)\b.*\b(music|radio|song)\b/i;
const MUSIC_NEXT = /\b(next|another|change( the)?|skip( the)?)\b.*\b(station|song|music|radio)\b/i;
// While driving, these still go to the task agent; everything else is a chat with the co-pilot.
const TASK_TALK =
  /\b(remind|add|task|todo|to-do|schedule|move|reschedule|delete|remove|cancel|mark|check off|remember|forget|take me|navigate|directions|go to|due|tomorrow|tonight)\b/i;
const COPILOT_IDLE_MS = 60000;

const TOUCH = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
const BRIEFING =
  "Give me a short briefing of my day: anything overdue, what's due today, and the one thing I should focus on first.";

// Show the intro once per browser session (add ?intro to the URL to see it again).
function shouldShowIntro() {
  try {
    if (new URLSearchParams(location.search).has("intro")) return true;
    if (sessionStorage.getItem("vox-intro-seen")) return false;
    sessionStorage.setItem("vox-intro-seen", "1");
  } catch {
    /* storage blocked: just show it */
  }
  return true;
}

const STATUS = {
  idle: TOUCH ? "Tap to talk" : "Tap to talk · or hold space",
  armed: "Listening · just start talking",
  hearing: "Hearing you",
  thinking: "Thinking with Nemotron",
  speaking: "Speaking",
};

// Entrance animation for the main screen: each block rises in, one after another.
const stagger = { show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } };
const rise = {
  hidden: { opacity: 0, y: 30, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export default function App() {
  const [intro, setIntro] = useState(shouldShowIntro);
  const [tab, setTab] = useState("tasks");
  const [tasks, setTasks] = useState([]);
  const [memory, setMemory] = useState([]);
  const [mock, setMock] = useState(false);
  const [reply, setReply] = useState("");
  const [meta, setMeta] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const [highlight, setHighlight] = useState([]);
  const [activity, setActivity] = useState([]);
  const [lang, setLang] = useState("en-US");
  const [voiceOut, setVoiceOut] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const [typed, setTyped] = useState("");
  const [meetings, setMeetings] = useState([]);
  const [busyMeeting, setBusyMeeting] = useState(null);
  const [mapPlace, setMapPlace] = useState(null);
  const [focus, setFocus] = useState(false);
  const [checkIn, setCheckIn] = useState(null); // the task Vox is asking "did you do it?" about
  const [notify, setNotify] = useState(notificationsAllowed);
  const pendingRef = useRef(null);
  pendingRef.current = pending;
  const checkInRef = useRef(null);
  checkInRef.current = checkIn;
  const focusTask = useRef(null);
  const [driving, setDriving] = useState(false);
  const trip = useRef(null); // { dest, minutes, next } while navigating
  const chatLog = useRef([]); // the co-pilot conversation
  const lastTalk = useRef(0);

  const applyState = (data) => {
    if (data.meetings) setMeetings(data.meetings);
    if (data.tasks) setTasks(data.tasks);
    if (data.memory) setMemory(data.memory);
    if (data.activity) setActivity(data.activity);
    if (data.mock !== undefined) setMock(data.mock);
  };

  // Wrap any server call so a failure shows a message instead of breaking silently.
  const safely =
    (fn) =>
    async (...args) => {
      try {
        setError("");
        await fn(...args);
      } catch (e) {
        setError(e.message);
      }
    };

  useEffect(() => {
    api.state().then(applyState).catch((e) => setError(e.message));
  }, []);

  const say = useCallback(
    async (text) => {
      setReply(text);
      if (!voiceOut) return;
      setSpeaking(true);
      await speak(text, lang);
      setSpeaking(false);
    },
    [voiceOut, lang]
  );

  // Briefly light up the tasks a command touched.
  const flash = (applied = []) => {
    const ids = applied.filter((a) => a.task && a.type !== "delete").map((a) => a.task.id);
    setHighlight(ids);
    setTimeout(() => setHighlight([]), 2600);
  };

  const answerConfirm = safely(async (yes) => {
    const p = pendingRef.current;
    setPending(null);
    const data = await api.confirm(p.pending_id, yes);
    applyState(data);
    say(data.reply);
  });

  const send = async (text) => {
    text = fixHearing(text.trim());
    if (!text) return;
    setError("");

    // While a delete is waiting for a yes/no, a spoken "yes" or "no" answers it.
    if (pendingRef.current && (YES.test(text) || NO.test(text))) {
      return answerConfirm(YES.test(text));
    }

    // Answering "did you do it?" after a reminder.
    const asked = checkInRef.current;
    if (asked) {
      setCheckIn(null);
      if (YES.test(text) || DONE.test(text)) return answerCheckIn(asked, true);
      if (NO.test(text)) return answerCheckIn(asked, false);
      text = `About my task "${asked.title}": ${text}`; // "I did half of it, move the rest to tomorrow"
    }

    // In focus mode, "done" checks off the task on screen.
    if (focus && DONE.test(text) && focusTask.current) return finishFocusTask(focusTask.current);

    lastTalk.current = Date.now();
    if (MUSIC_OFF.test(text)) return music.stop();
    if (MUSIC_NEXT.test(text) && music.playing) return music.next();
    if (MUSIC_ON.test(text)) return music.play();
    if (driving && !TASK_TALK.test(text)) return copilot(text);

    if (FOCUS.test(text)) return openFocus();
    if (MEETING_START.test(text)) return startMeeting();
    if (MEETING_RECAP.test(text) && meetings.length) return recapMeeting(meetings[0]);

    setThinking(true);
    try {
      const data = await api.command(text);
      applyState(data);
      setMeta({ model: data.model, ms: data.latency_ms });
      if (data.needs_confirm) setPending({ pending_id: data.pending_id, preview: data.preview });
      const go = data.applied?.find((a) => a.type === "navigate");
      if (go) setMapPlace(go.place);
      flash(data.applied);
      setThinking(false);
      say(data.reply);
    } catch (e) {
      setError(e.message);
      setThinking(false);
    }
  };

  // ---------- meeting mode ----------
  const meeting = useMeeting({
    lang,
    onDone: safely(async (transcript) => {
      const data = await api.saveMeeting(transcript);
      applyState(data);
      await say("Saved the meeting. Say “summarize the meeting” whenever you want the key points.");
    }),
  });

  const startMeeting = async () => {
    setHandsFree(false);
    setTab("meetings");
    await say("Recording. Tap stop when it's over.");
    meeting.start();
  };

  const summarizeMeeting = async (m) => {
    setBusyMeeting(m.id);
    try {
      const data = await api.summarizeMeeting(m.id);
      applyState(data);
      setMeta({ model: data.meeting.model, ms: data.meeting.latency_ms });
      return data.meeting;
    } finally {
      setBusyMeeting(null);
    }
  };

  const recapMeeting = safely(async (m) => {
    setTab("meetings");
    setThinking(true);
    try {
      const done = m.summary ? m : await summarizeMeeting(m);
      setThinking(false);
      say(done.summary.spoken || done.summary.summary);
    } finally {
      setThinking(false);
    }
  });

  const meetingTasks = safely(async (m) => {
    const data = await api.meetingTasks(m.id);
    applyState(data);
    flash(data.applied);
    say(data.reply);
  });
  const deleteMeeting = safely(async (m) => applyState(await api.deleteMeeting(m.id)));

  // ---------- focus mode ----------
  const openFocus = () => {
    const first = focusQueue(tasks)[0];
    setFocus(true);
    say(first ? `Focus mode. First up: ${first.title}. Twenty-five minutes, go.` : "You have nothing open. Enjoy it.");
  };
  const finishFocusTask = safely(async (t) => {
    applyState(await api.patchTask(t.id, { done: true }));
    const next = focusQueue(tasks).find((x) => x.id !== t.id);
    say(next ? `Nice. Next up: ${next.title}.` : "Nice, that was the last one. You're all clear.");
  });

  // ---------- reminders + "did you do it?" ----------
  const answerCheckIn = safely(async (t, did) => {
    setCheckIn(null);
    if (did) {
      applyState(await api.patchTask(t.id, { done: true }));
      flash([{ type: "complete", task: t }]);
      say(`Great, I checked off ${t.title}.`);
    } else {
      say(`No problem, ${t.title} stays on your list. Tell me when you want to do it.`);
    }
  });

  const startCheckIn = async (t) => {
    setTab("tasks");
    setCheckIn(t);
    await say(`Did you do ${t.title}?`);
    speech.start(); // listen for the answer right away
  };

  useReminders({
    tasks,
    onRemind: (t, kind, text) => {
      if (kind === "checkin") {
        // If you're looking at Vox, ask right away. Otherwise the notification asks on click.
        if (document.visibilityState === "visible") startCheckIn(t);
        else setCheckIn(t);
      } else {
        say(text);
      }
    },
    onCheckIn: startCheckIn,
  });

  const toggleNotify = async () => setNotify(await askNotificationPermission());

  const speech = useSpeech({
    lang,
    onFinal: send,
    handsFree: handsFree && !meeting.recording,
    paused: thinking || speaking,
  });
  // Privacy: the microphone is only open while Vox is actually listening.
  const mic = useMic(handsFree || speech.listening || meeting.recording);
  const { start, stop } = speech;

  // ---------- on the road: music + co-pilot ----------
  const music = useMusic({ duck: speaking || speech.hearing || thinking });

  const copilot = safely(async (text) => {
    setThinking(true);
    try {
      const data = await api.chat(text, chatLog.current, trip.current);
      if (!text.startsWith("(")) chatLog.current.push({ role: "user", content: text });
      chatLog.current.push({ role: "assistant", content: data.reply });
      chatLog.current = chatLog.current.slice(-12);
      setMeta({ model: data.model, ms: data.latency_ms });
      setThinking(false);
      lastTalk.current = Date.now();
      say(data.reply);
    } finally {
      setThinking(false);
    }
  });

  // MapPanel reports the trip many times a second; we only react when it starts or ends.
  const onTrip = (info) => {
    trip.current = info;
    if (Boolean(info) !== driving) {
      setDriving(Boolean(info));
      setHandsFree(Boolean(info)); // eyes on the road: just talk
      if (info) {
        chatLog.current = [];
        lastTalk.current = Date.now();
      }
    }
  };

  // The co-pilot opens the conversation, then picks it up again after a quiet minute.
  const copilotRef = useRef(copilot);
  copilotRef.current = copilot;
  const busy = useRef(false);
  busy.current = thinking || speaking || speech.hearing;
  useEffect(() => {
    if (!driving) return;
    const opener = setTimeout(
      () => copilotRef.current("(The trip just started. Greet me in one sentence and ask me one easy question.)"),
      9000
    );
    const idle = setInterval(() => {
      if (!busy.current && Date.now() - lastTalk.current > COPILOT_IDLE_MS)
        copilotRef.current("(I've been quiet for a minute. Bring up something new, short, and ask me about it.)");
    }, 10000);
    return () => {
      clearTimeout(opener);
      clearInterval(idle);
    };
  }, [driving]);

  const talk = () => {
    if (handsFree) return setHandsFree(false);
    speech.listening ? stop() : start();
  };

  const undo = safely(async () => {
    const data = await api.undo();
    applyState(data);
    say(data.reply);
  });

  // Keyboard: hold Space to talk, Ctrl+Z (Cmd+Z on Mac) to undo.
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    const isTyping = (e) => ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
    const down = (e) => {
      if (isTyping(e)) return;
      if (e.code === "Space" && !e.repeat && !handsFree) {
        e.preventDefault();
        start();
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoRef.current();
      }
    };
    const up = (e) => {
      if (e.code === "Space" && !isTyping(e) && !handsFree) stop();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [start, stop, handsFree]);

  const toggleTask = safely(async (t) => applyState(await api.patchTask(t.id, { done: !t.done })));
  const renameTask = safely(async (t, title) => applyState(await api.patchTask(t.id, { title })));
  const deleteTask = safely(async (t) => applyState(await api.deleteTask(t.id)));
  const forget = safely(async (key) => applyState(await api.forget(key)));

  const mode = thinking
    ? "thinking"
    : speaking
      ? "speaking"
      : speech.hearing || (speech.listening && !handsFree)
        ? "hearing"
        : speech.listening
          ? "armed"
          : "idle";

  const openCount = tasks.filter((t) => !t.done).length;
  const tabs = [
    { id: "tasks", label: "Tasks", icon: ListTodo, count: openCount },
    { id: "meetings", label: "Meetings", icon: Users, count: meetings.length || null },
    { id: "memory", label: "Memory", icon: Network, count: memory.length },
    { id: "activity", label: "Activity", icon: Activity, count: activity.length || null },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="aurora" />
      <div className="grid-bg" />

      <AnimatePresence>{intro && <Intro key="intro" onDone={() => setIntro(false)} />}</AnimatePresence>
      <AnimatePresence>
        {mapPlace && (
          <MapPanel
            key={mapPlace}
            place={mapPlace}
            onClose={() => setMapPlace(null)}
            say={say}
            music={music}
            onTrip={onTrip}
            onRoute={(r, mode) =>
              say(
                `It's ${r.km.toFixed(1)} kilometers, about ${r.min} minutes ${mode === "car" ? "by car" : "on foot"}. ${r.steps[0] || ""}.`
              )
            }
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {focus && (
          <FocusMode
            tasks={tasks}
            onCurrent={(t) => (focusTask.current = t)}
            onDone={finishFocusTask}
            onClose={() => setFocus(false)}
            onNavigate={(place) => setMapPlace(place)}
          />
        )}
      </AnimatePresence>

      {!intro && (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-7xl px-4 pb-20 sm:px-8"
        >
          {/* Header */}
          <motion.header variants={rise} className="flex items-center justify-between gap-3 py-6">
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Vox<span className="text-accent">.</span>
              </h1>
              <span className="hidden font-mono text-[11px] text-muted sm:inline">personal AI · nemotron 3</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openFocus}
                className="glass flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-muted transition hover:text-white"
                title="Focus mode: one task, 25 minutes"
              >
                <Target className="h-4 w-4 text-accent" /> <span className="hidden sm:inline">Focus</span>
              </button>
              <button
                onClick={toggleNotify}
                className={`glass cursor-pointer rounded-full p-2.5 transition hover:text-white ${notify ? "text-accent" : "text-muted"}`}
                aria-label={notify ? "Reminders are on" : "Turn on reminders"}
                title={notify ? "Reminders on: before, at, and after each timed task" : "Turn on reminder notifications"}
              >
                {notify ? <BellRing className="h-4 w-4" /> : typeof Notification === "undefined" ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </button>
              <div className="glass flex rounded-full p-1">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={`cursor-pointer rounded-full px-2.5 py-1 font-mono text-[11px] transition ${
                      lang === l.code ? "bg-white/15 text-white" : "text-muted hover:text-white"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setVoiceOut((v) => !v)}
                className="glass cursor-pointer rounded-full p-2.5 text-muted transition hover:text-white"
                aria-label={voiceOut ? "Mute spoken replies" : "Speak replies"}
              >
                {voiceOut ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            </div>
          </motion.header>

          {mock && (
            <motion.div
              variants={rise}
              className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200"
            >
              Offline mode: no Token Factory key in <code>backend/.env</code>, so commands use simple rules.
            </motion.div>
          )}

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[420px_minmax(0,1fr)]">
            {/* Voice console */}
            <motion.section
              variants={rise}
              className="glass flex flex-col items-center rounded-3xl px-6 pb-6 pt-4 text-center lg:sticky lg:top-6"
            >
              <VoiceOrb mode={mode} readMic={mic.read} onClick={talk} disabled={!speech.supported} />

              <p
                className={`-mt-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] ${
                  mode === "thinking" || mode === "speaking" ? "text-mind" : mode === "idle" ? "text-muted" : "text-accent"
                }`}
              >
                {mode !== "idle" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                {speech.supported ? STATUS[mode] : "Voice needs Chrome or Edge"}
              </p>

              <div className="mt-5 flex min-h-28 w-full items-center justify-center">
                <AnimatePresence mode="wait">
                  {(speech.hearing || thinking) && speech.transcript ? (
                    <motion.p
                      key="transcript"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="font-display text-xl leading-snug text-white/70"
                    >
                      {speech.transcript}
                    </motion.p>
                  ) : reply ? (
                    <motion.p
                      key={reply}
                      initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0 }}
                      className="font-display text-xl font-medium leading-snug"
                    >
                      {reply}
                    </motion.p>
                  ) : (
                    <motion.p key="hint" className="text-sm text-muted">
                      Say everything on your mind. Vox sorts it out.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {meta && (
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted">
                  <Cpu className="h-3 w-3" /> {meta.model} · {(meta.ms / 1000).toFixed(1)}s
                </p>
              )}
              {(error || mic.error) && <p className="mt-2 text-sm text-rose-400">{error || mic.error}</p>}

              <AnimatePresence>
                {pending && (
                  <div className="mt-5 flex w-full justify-center">
                    <ConfirmCard pending={pending} onAnswer={answerConfirm} />
                  </div>
                )}
                {checkIn && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="mt-5 w-full rounded-2xl border border-mind/40 bg-mind/5 p-5 text-left"
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold text-mind">
                      <BellRing className="h-4 w-4" /> Check-in
                    </p>
                    <p className="mt-2 font-display text-lg font-medium">Did you do “{checkIn.title}”?</p>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => answerCheckIn(checkIn, true)}
                        className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink hover:brightness-110"
                      >
                        Yes, done
                      </button>
                      <button
                        onClick={() => answerCheckIn(checkIn, false)}
                        className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm hover:bg-white/5"
                      >
                        Not yet
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-muted">Or tell Vox, like “I did half, move the rest to tomorrow”.</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Morning briefing */}
              <button
                onClick={() => send(BRIEFING)}
                disabled={thinking}
                className="mt-6 flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-mind/20 bg-mind/[0.04] px-4 py-3 text-left transition hover:border-mind/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sunrise className="h-5 w-5 text-mind" />
                <span>
                  <span className="block text-sm font-medium">Brief me</span>
                  <span className="block text-xs text-muted">What matters today, in one breath</span>
                </span>
              </button>

              {/* Hands-free switch */}
              <button
                onClick={() => setHandsFree((v) => !v)}
                disabled={!speech.supported}
                role="switch"
                aria-checked={handsFree}
                className="mt-3 flex w-full cursor-pointer items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-left transition hover:border-white/15"
              >
                <span>
                  <span className="block text-sm font-medium">Hands-free</span>
                  <span className="block text-xs text-muted">Wakes up as soon as you speak</span>
                </span>
                <span
                  className={`relative h-6 w-11 rounded-full transition-colors ${handsFree ? "bg-accent" : "bg-white/15"}`}
                >
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white ${handsFree ? "right-1" : "left-1"}`}
                  />
                </span>
              </button>

              {/* Typing fallback + undo */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(typed);
                  setTyped("");
                }}
                className="mt-3 flex w-full items-center gap-2"
              >
                <div className="flex flex-1 items-center rounded-2xl border border-white/[0.07] bg-white/[0.02] pr-1.5 focus-within:border-accent/50">
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="…or type a command"
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted/70"
                  />
                  <button
                    type="submit"
                    disabled={thinking || !typed.trim()}
                    className="cursor-pointer rounded-xl bg-accent p-2 text-ink transition disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Send"
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={undo}
                  className="cursor-pointer rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-muted transition hover:text-white"
                  aria-label="Undo last change"
                  title="Undo last change (Ctrl+Z)"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </form>
            </motion.section>

            {/* Tabs */}
            <motion.main variants={rise} className="min-w-0">
              <div className="mb-6 overflow-x-auto">
                <Tabs tabs={tabs} value={tab} onChange={setTab} />
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  {tab === "tasks" && (
                    <TaskList
                      tasks={tasks}
                      highlight={highlight}
                      onToggle={toggleTask}
                      onDelete={deleteTask}
                      onRename={renameTask}
                      onNavigate={(t) => setMapPlace(t.place)}
                    />
                  )}
                  {tab === "meetings" && (
                    <MeetingPanel
                      meeting={meeting}
                      meetings={meetings}
                      busyId={busyMeeting}
                      onSummarize={safely(summarizeMeeting)}
                      onAddTasks={meetingTasks}
                      onDelete={deleteMeeting}
                    />
                  )}
                  {tab === "memory" && <MemoryGraph memory={memory} tasks={tasks} onForget={forget} />}
                  {tab === "activity" && <ActivityLog items={activity} />}
                </motion.div>
              </AnimatePresence>
            </motion.main>
          </div>
        </motion.div>
      )}
    </MotionConfig>
  );
}
