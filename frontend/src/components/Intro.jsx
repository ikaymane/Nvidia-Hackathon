import { useEffect } from "react";
import { motion } from "framer-motion";

// Opening animation: a voice waveform, then the name drops in letter by letter.
// Calls onDone after ~2 s, or immediately when clicked.
export default function Intro({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2300);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      onClick={onDone}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-ink"
      exit={{ opacity: 0, scale: 1.08, filter: "blur(12px)" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-8 flex h-16 items-center gap-1.5">
        {Array.from({ length: 15 }).map((_, i) => (
          <motion.span
            key={i}
            className="w-1.5 rounded-full bg-accent"
            initial={{ height: 4, opacity: 0 }}
            animate={{ height: [4, 12 + Math.abs(7 - i) * -5 + 44, 8, 30 - Math.abs(7 - i) * 3, 6], opacity: 1 }}
            transition={{ duration: 1.4, delay: i * 0.04, ease: "easeInOut" }}
          />
        ))}
      </div>

      <h1 className="flex font-display text-7xl font-bold tracking-tight sm:text-8xl">
        {"Vox".split("").map((ch, i) => (
          <motion.span
            key={i}
            initial={{ y: 60, opacity: 0, filter: "blur(10px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            transition={{ delay: 0.5 + i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {ch}
          </motion.span>
        ))}
        <motion.span
          className="text-accent"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.9, type: "spring", stiffness: 400, damping: 12 }}
        >
          .
        </motion.span>
      </h1>

      <motion.p
        className="mt-4 font-mono text-xs uppercase tracking-[0.4em] text-muted"
        initial={{ opacity: 0, letterSpacing: "0.1em" }}
        animate={{ opacity: 1, letterSpacing: "0.4em" }}
        transition={{ delay: 1.1, duration: 0.8 }}
      >
        talk to your tasks
      </motion.p>

      <motion.div
        className="mt-10 h-px w-48 origin-left bg-gradient-to-r from-transparent via-accent to-transparent"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 1.2, duration: 0.9, ease: "easeOut" }}
      />
      <motion.p
        className="mt-3 font-mono text-[10px] text-muted/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        powered by NVIDIA Nemotron · Nebius Token Factory
      </motion.p>
    </motion.div>
  );
}
