import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, SkipForward, X, Pause, Play, Navigation } from "lucide-react";
import { groupOf, dueLabel } from "../dates.js";

// Focus mode: one task, one 25-minute timer, nothing else on screen.
const MINUTES = 25;
const ORDER = ["Overdue", "Today", "Tomorrow", "This week", "Anytime", "Later"];

// The most important open task first: overdue, then today, and urgent before normal.
export function focusQueue(tasks) {
  const score = (t) => ORDER.indexOf(groupOf(t)) * 2 + (t.priority === "high" ? 0 : 1);
  return tasks.filter((t) => !t.done).sort((a, b) => score(a) - score(b));
}

export default function FocusMode({ tasks, onDone, onClose, onNavigate, onCurrent }) {
  const queue = useMemo(() => focusQueue(tasks), [tasks]);
  const [skip, setSkip] = useState(0);
  const [left, setLeft] = useState(MINUTES * 60);
  const [running, setRunning] = useState(true);
  const task = queue[skip % Math.max(queue.length, 1)];

  // Tell the app which task is on screen, so a spoken "done" checks off this one.
  useEffect(() => {
    onCurrent?.(task || null);
  }, [task, onCurrent]);

  useEffect(() => {
    if (!running || left <= 0) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [running, left]);

  // Escape leaves focus mode.
  useEffect(() => {
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const next = () => {
    setSkip((s) => s + 1);
    setLeft(MINUTES * 60);
    setRunning(true);
  };

  const R = 120;
  const C = 2 * Math.PI * R;
  const progress = left / (MINUTES * 60);
  const mm = String(Math.floor(Math.max(left, 0) / 60)).padStart(2, "0");
  const ss = String(Math.max(left, 0) % 60).padStart(2, "0");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/95 px-6 backdrop-blur-xl"
    >
      <button
        onClick={onClose}
        className="absolute right-5 top-5 cursor-pointer rounded-full p-2.5 text-muted transition hover:bg-white/5 hover:text-white"
        aria-label="Leave focus mode"
      >
        <X className="h-5 w-5" />
      </button>

      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent">Focus mode</p>

      {!task ? (
        <p className="mt-6 font-display text-3xl font-semibold">Nothing left to do. Enjoy it.</p>
      ) : (
        <>
          <div className="relative mt-8 h-64 w-64">
            <svg viewBox="0 0 260 260" className="h-full w-full -rotate-90">
              <circle cx="130" cy="130" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="6" />
              <circle
                cx="130"
                cy="130"
                r={R}
                fill="none"
                stroke="#76b900"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                style={{ transition: "stroke-dashoffset 1s linear", filter: "drop-shadow(0 0 8px rgba(118,185,0,.6))" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-6xl font-bold tabular-nums">
                {mm}:{ss}
              </span>
              <button
                onClick={() => setRunning((r) => !r)}
                className="mt-2 cursor-pointer rounded-full p-2 text-muted hover:text-white"
                aria-label={running ? "Pause timer" : "Resume timer"}
              >
                {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <motion.div key={task.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8 max-w-xl text-center">
            <p className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{task.title}</p>
            <p className="mt-2 text-sm text-muted">
              {[dueLabel(task), task.priority === "high" && "urgent", task.project].filter(Boolean).join(" · ") || "No date"}
            </p>
          </motion.div>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => onDone(task)}
              className="flex cursor-pointer items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-ink transition hover:brightness-110"
            >
              <Check className="h-5 w-5" strokeWidth={3} /> Done
            </button>
            {queue.length > 1 && (
              <button
                onClick={next}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-6 py-3 transition hover:bg-white/5"
              >
                <SkipForward className="h-5 w-5" /> Next task
              </button>
            )}
            {task.place && (
              <button
                onClick={() => onNavigate(task.place)}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-6 py-3 transition hover:bg-white/5"
              >
                <Navigation className="h-5 w-5" /> Take me there
              </button>
            )}
          </div>
          <p className="mt-6 text-xs text-muted">Say “done” when you finish. Esc to leave.</p>
        </>
      )}
    </motion.div>
  );
}
