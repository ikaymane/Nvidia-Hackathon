import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

// Shown before a voice command deletes several tasks at once.
export default function ConfirmCard({ pending, onAnswer }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 text-left"
    >
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-300">
        <AlertTriangle className="h-4 w-4" /> Delete {pending.preview.length} tasks?
      </p>
      <ul className="mb-4 space-y-1 text-sm text-white/80">
        {pending.preview.map((title) => (
          <li key={title} className="truncate">
            • {title}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          onClick={() => onAnswer(true)}
          className="cursor-pointer rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400"
        >
          Yes, delete
        </button>
        <button
          onClick={() => onAnswer(false)}
          className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm hover:bg-white/5"
        >
          Keep them
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">Or just say "yes" or "no".</p>
    </motion.div>
  );
}
