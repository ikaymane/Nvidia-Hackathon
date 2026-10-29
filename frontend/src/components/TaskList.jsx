import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Trash2, ChevronDown, CalendarDays, Hash, Flame, Navigation } from "lucide-react";
import { GROUPS, groupOf, dueLabel } from "../dates.js";

export default function TaskList({ tasks, highlight, onToggle, onDelete, onRename, onNavigate }) {
  const [showDone, setShowDone] = useState(false);
  const groups = GROUPS.map((name) => ({ name, items: tasks.filter((t) => groupOf(t) === name) })).filter(
    (g) => g.items.length
  );

  if (!tasks.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-12 text-center"
      >
        <p className="font-display text-2xl font-semibold">Your mind, empty and calm.</p>
        <p className="mt-2 text-sm text-muted">Talk to Vox. Say everything on your mind, in any order.</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-7">
      {groups.map(({ name, items }, gi) => {
        const isDone = name === "Done";
        return (
          <motion.section
            key={name}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: gi * 0.06 }}
          >
            <button
              onClick={() => isDone && setShowDone((v) => !v)}
              className={`mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] ${
                name === "Overdue" ? "text-rose-400" : name === "Today" ? "text-accent" : "text-muted"
              } ${isDone ? "cursor-pointer hover:text-white" : "cursor-default"}`}
            >
              <span className="h-px w-4 bg-current opacity-50" />
              {name}
              <span className="text-white/40">{items.length}</span>
              {isDone && <ChevronDown className={`h-3.5 w-3.5 transition ${showDone ? "rotate-180" : ""}`} />}
            </button>

            {(!isDone || showDone) && (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {items.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      glow={highlight.includes(t.id)}
                      onToggle={() => onToggle(t)}
                      onDelete={() => onDelete(t)}
                      onRename={(title) => onRename(t, title)}
                      onNavigate={() => onNavigate(t)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.section>
        );
      })}
    </div>
  );
}

function TaskRow({ task, glow, onToggle, onDelete, onRename, onNavigate }) {
  const due = dueLabel(task);
  const high = task.priority === "high" && !task.done;
  const [editing, setEditing] = useState(false);

  const save = (value) => {
    setEditing(false);
    if (value.trim() && value.trim() !== task.title) onRename(value.trim());
  };
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -24, filter: "blur(6px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: 60, scale: 0.95, filter: "blur(4px)", transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`group relative flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 backdrop-blur-xl transition-[border-color,background-color,box-shadow] duration-700 ${
        glow
          ? "border-accent/70 bg-accent/10 shadow-[0_0_30px_rgba(118,185,0,.25)]"
          : "border-white/[0.07] bg-white/[0.03] hover:border-white/15"
      }`}
    >
      {high && <span className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-rose-400 to-orange-400" />}

      <button
        onClick={onToggle}
        className={`flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition ${
          task.done ? "border-accent bg-accent text-ink" : "border-white/25 hover:border-accent hover:bg-accent/10"
        }`}
        aria-label={task.done ? "Mark as not done" : "Mark as done"}
      >
        <AnimatePresence>
          {task.done && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
              <Check className="h-3 w-3" strokeWidth={3.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            defaultValue={task.title}
            onBlur={(e) => save(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full rounded-md bg-white/5 px-1.5 py-0.5 font-medium outline-none ring-1 ring-accent/50"
            aria-label="Task title"
          />
        ) : (
          <p
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
            className={`truncate font-medium ${task.done ? "text-muted line-through" : "text-white"}`}
          >
            {task.title}
          </p>
        )}
        {(due || task.project || high || task.place) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {due && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> {due}
              </span>
            )}
            {task.project && (
              <span className="flex items-center gap-1 text-amber-300/80">
                <Hash className="h-3 w-3" /> {task.project}
              </span>
            )}
            {high && (
              <span className="flex items-center gap-1 text-rose-300">
                <Flame className="h-3 w-3" /> urgent
              </span>
            )}
            {task.place && !task.done && (
              <button
                onClick={onNavigate}
                className="flex cursor-pointer items-center gap-1 text-mind hover:underline"
                title="Show the way"
              >
                <Navigation className="h-3 w-3" /> {task.place}
              </button>
            )}
          </div>
        )}
      </div>

      <button
        onClick={onDelete}
        className="cursor-pointer rounded-lg p-2 text-muted transition hover:bg-rose-500/10 hover:text-rose-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        aria-label="Delete task"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </motion.li>
  );
}
