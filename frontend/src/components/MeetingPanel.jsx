import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square, Sparkles, ListPlus, Trash2, ChevronDown, Loader2, CalendarDays, User } from "lucide-react";

// Meeting mode: record a meeting or class, then ask Nemotron for what matters.
export default function MeetingPanel({ meeting, meetings, busyId, onSummarize, onAddTasks, onDelete }) {
  const clock = `${String(Math.floor(meeting.seconds / 60)).padStart(2, "0")}:${String(meeting.seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      {/* Recorder */}
      <div className="glass rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-xl font-semibold">Meeting mode</p>
            <p className="mt-1 text-sm text-muted">
              Vox listens to the room and keeps a transcript. Ask for the summary whenever you want.
            </p>
          </div>
          <button
            onClick={meeting.recording ? meeting.stop : meeting.start}
            disabled={!meeting.supported}
            className={`flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              meeting.recording ? "bg-rose-500 text-white hover:bg-rose-400" : "bg-accent text-ink hover:brightness-110"
            }`}
          >
            {meeting.recording ? <Square className="h-4 w-4" fill="currentColor" /> : <Mic className="h-4 w-4" />}
            {meeting.recording ? "Stop & save" : "Start recording"}
          </button>
        </div>

        <AnimatePresence>
          {meeting.recording && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <p className="mt-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-rose-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Recording · {clock}
              </p>
              <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                {meeting.text || "Listening…"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Past meetings */}
      {meetings.length === 0 && !meeting.recording && (
        <p className="px-2 text-sm text-muted">
          No meetings yet. Tap “Start recording”, or just say “record this meeting”.
        </p>
      )}
      <ul className="space-y-3">
        {meetings.map((m) => (
          <MeetingCard
            key={m.id}
            m={m}
            busy={busyId === m.id}
            onSummarize={() => onSummarize(m)}
            onAddTasks={() => onAddTasks(m)}
            onDelete={() => onDelete(m)}
          />
        ))}
      </ul>
    </div>
  );
}

function MeetingCard({ m, busy, onSummarize, onAddTasks, onDelete }) {
  const [open, setOpen] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const s = m.summary;
  const when = new Date(m.created_at).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 cursor-pointer text-left">
          <p className="truncate font-display text-lg font-semibold">{m.title || "Untitled recording"}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted">
            {when} · {m.transcript.split(/\s+/).length} words
          </p>
        </button>
        <div className="flex items-center gap-1">
          {!s && (
            <button
              onClick={onSummarize}
              disabled={busy}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-mind/15 px-3.5 py-2 text-sm font-medium text-mind transition hover:bg-mind/25 disabled:cursor-wait"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Nemotron is reading…" : "Summarize"}
            </button>
          )}
          <button
            onClick={onDelete}
            className="cursor-pointer rounded-lg p-2 text-muted transition hover:bg-rose-500/10 hover:text-rose-400"
            aria-label="Delete recording"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && s && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="leading-relaxed text-white/85">{s.summary}</p>
          <Section title="Key points" items={s.key_points} />
          <Section title="Decisions" items={s.decisions} />
          {s.action_items.length > 0 && (
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Action items</p>
              <ul className="space-y-1.5">
                {s.action_items.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="font-medium">{a.title}</span>
                    {a.owner && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <User className="h-3 w-3" /> {a.owner}
                      </span>
                    )}
                    {a.due && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <CalendarDays className="h-3 w-3" /> {a.due}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <button
                onClick={onAddTasks}
                className="mt-3 flex cursor-pointer items-center gap-1.5 rounded-full border border-accent/40 px-3.5 py-1.5 text-sm text-accent transition hover:bg-accent/10"
              >
                <ListPlus className="h-4 w-4" /> Add my action items to tasks
              </button>
            </div>
          )}
        </div>
      )}

      {open && (
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="mt-4 flex cursor-pointer items-center gap-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-white"
        >
          Transcript <ChevronDown className={`h-3.5 w-3.5 transition ${showTranscript ? "rotate-180" : ""}`} />
        </button>
      )}
      {open && showTranscript && (
        <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-white/60">
          {m.transcript}
        </p>
      )}
    </motion.li>
  );
}

function Section({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-mind">{title}</p>
      <ul className="space-y-1 text-white/80">
        {items.map((x, i) => (
          <li key={i}>• {x}</li>
        ))}
      </ul>
    </div>
  );
}
