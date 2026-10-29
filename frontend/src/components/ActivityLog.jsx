import { motion } from "framer-motion";
import { Zap, Sparkles, BrainCircuit } from "lucide-react";

// A log of every command: what you said, which Nemotron model handled it, and how fast.
const TIER = {
  nano: { label: "Nano", icon: Zap, cls: "text-accent border-accent/30 bg-accent/10" },
  super: { label: "Super", icon: Sparkles, cls: "text-mind border-mind/30 bg-mind/10" },
  ultra: { label: "Ultra", icon: BrainCircuit, cls: "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-400/10" },
};

function tierOf(model = "") {
  const m = model.toLowerCase();
  if (m.includes("ultra")) return TIER.ultra;
  if (m.includes("super")) return TIER.super;
  if (m.includes("nano")) return TIER.nano;
  return null;
}

function formatWhen(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ActivityLog({ items }) {
  if (!items.length) {
    return (
      <p className="glass rounded-2xl p-10 text-center text-sm text-muted">
        Every command you give shows up here, with the Nemotron model that handled it.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((it, i) => {
        const tier = tierOf(it.model);
        const Icon = tier?.icon;
        return (
          <motion.li
            key={it.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.4) }}
            className="glass rounded-2xl p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] text-muted">{formatWhen(it.created_at)}</span>
              {tier ? (
                <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] ${tier.cls}`}>
                  <Icon className="h-3 w-3" /> Nemotron {tier.label} · {(it.latency_ms / 1000).toFixed(1)}s
                </span>
              ) : (
                <span className="font-mono text-[11px] text-muted">{it.model}</span>
              )}
            </div>
            <p className="text-white/90">“{it.text}”</p>
            <p className="mt-1.5 text-sm text-muted">→ {it.reply}</p>
            {it.changes > 0 && (
              <p className="mt-2 font-mono text-[11px] text-accent">
                {it.changes} change{it.changes > 1 ? "s" : ""} applied
              </p>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}
