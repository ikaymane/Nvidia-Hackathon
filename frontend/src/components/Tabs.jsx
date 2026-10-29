import { motion } from "framer-motion";

// Pill-shaped tab bar. The green highlight slides between tabs.
export default function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="glass inline-flex rounded-full p-1">
      {tabs.map((t) => {
        const on = t.id === value;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`relative flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent sm:gap-2 sm:px-4 ${
              on ? "text-ink" : "text-muted hover:text-white"
            }`}
          >
            {on && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <Icon className="relative h-4 w-4" />
            <span className="relative">{t.label}</span>
            {t.count != null && (
              <span
                className={`relative rounded-full px-1.5 font-mono text-[10px] ${on ? "bg-ink/20" : "bg-white/10"}`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
