import { useEffect, useRef } from "react";

// Reminders for tasks that have a date AND a time.
//
// For each such task Vox sends up to three notifications:
//   "soon"    10 minutes before
//   "now"     at the time
//   "checkin" 15 minutes after, if it's still not done: "Did you do it?"
// Clicking a notification brings Vox to the front and calls onCheckIn(task),
// which asks you out loud whether you did it.
//
// Which notifications were already sent is kept in localStorage, so a reload
// doesn't repeat them. (The tab has to stay open: there is no push server.)
const BEFORE_MIN = 10;
const AFTER_MIN = 15;
const KEY = "vox-reminders-sent";

function loadSent() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveSent(sent) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...sent].slice(-300)));
  } catch {
    /* storage blocked: we may repeat a reminder, that's all */
  }
}

export function notificationsAllowed() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export async function askNotificationPermission() {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "default") await Notification.requestPermission();
  return Notification.permission === "granted";
}

export function useReminders({ tasks, onRemind, onCheckIn }) {
  const sent = useRef(loadSent());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const tickRef = useRef(null);
  const cb = useRef({ onRemind, onCheckIn });
  cb.current = { onRemind, onCheckIn };

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const t of tasksRef.current) {
        if (t.done || !t.due || !t.time) continue;
        const at = new Date(`${t.due}T${t.time}`).getTime();
        if (Number.isNaN(at)) continue;
        // Skip reminders for things far in the past (e.g. the app was closed for days).
        const moments = [
          { kind: "soon", when: at - BEFORE_MIN * 60000, text: `In ${BEFORE_MIN} minutes: ${t.title}` },
          { kind: "now", when: at, text: `It's time: ${t.title}` },
          { kind: "checkin", when: at + AFTER_MIN * 60000, text: `Did you do it? ${t.title}` },
        ];
        // Only the latest moment that has passed matters (opening the app 20 minutes
        // late should ask "did you do it?", not also say "in 10 minutes").
        const passed = moments.filter((m) => now >= m.when && now - m.when < 6 * 3600000);
        const latest = passed[passed.length - 1];
        const id = (m) => `${t.id}:${t.due}T${t.time}:${m.kind}`;
        if (!latest || sent.current.has(id(latest))) continue;
        passed.forEach((m) => sent.current.add(id(m)));
        saveSent(sent.current);
        fire(t, latest);
      }
    };

    const fire = (task, m) => {
      const isCheckIn = m.kind === "checkin";
      cb.current.onRemind(task, m.kind, m.text);
      if (!notificationsAllowed()) return;
      const n = new Notification("Vox", {
        body: isCheckIn ? `${m.text}\nTap to tell Vox.` : m.text,
        tag: `vox-${task.id}-${m.kind}`,
        requireInteraction: isCheckIn,
      });
      n.onclick = () => {
        window.focus();
        n.close();
        if (isCheckIn) cb.current.onCheckIn(task);
      };
    };

    tickRef.current = tick;
    const timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  }, []);

  // Also check right away whenever the task list changes (first load, a new time).
  useEffect(() => tickRef.current?.(), [tasks]);
}
