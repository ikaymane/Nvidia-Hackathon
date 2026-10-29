import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Ear } from "lucide-react";

const SIZE = 280;
const BARS = 72;

// The talk button, surrounded by a ring of bars that dance with your real microphone volume.
// mode: "idle" | "armed" (hands-free, waiting) | "hearing" | "thinking" | "speaking"
export default function VoiceOrb({ mode, readMic, onClick, disabled }) {
  const canvas = useRef(null);
  const glow = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const c = canvas.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = SIZE * dpr;
    c.height = SIZE * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    const smooth = new Float32Array(BARS);
    let frame;
    let t = 0;

    const draw = () => {
      t += 0.016;
      const m = modeRef.current;
      const freq = m === "hearing" || m === "armed" ? readMic() : null;
      ctx.clearRect(0, 0, SIZE, SIZE);
      const cx = SIZE / 2;
      const radius = 74;
      let total = 0;

      for (let i = 0; i < BARS; i++) {
        // mirror the spectrum so the ring looks symmetric
        const k = i < BARS / 2 ? i : BARS - i;
        let target;
        if (freq) target = (freq[Math.floor((k / (BARS / 2)) * freq.length * 0.7)] || 0) / 255;
        else if (m === "thinking") target = 0.25 + 0.25 * Math.sin(t * 6 - i * 0.35);
        else if (m === "speaking") target = 0.2 + 0.3 * Math.abs(Math.sin(t * 4 + k * 0.5));
        else target = 0.06 + 0.04 * Math.sin(t * 1.5 + i * 0.25); // gentle breathing
        smooth[i] += (target - smooth[i]) * 0.25;
        total += smooth[i];

        const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const len = 4 + smooth[i] * 52;
        const x1 = cx + Math.cos(angle) * radius;
        const y1 = cx + Math.sin(angle) * radius;
        const x2 = cx + Math.cos(angle) * (radius + len);
        const y2 = cx + Math.sin(angle) * (radius + len);
        const hue = m === "thinking" || m === "speaking" ? "34, 211, 238" : "118, 185, 0";
        ctx.strokeStyle = `rgba(${hue}, ${0.35 + smooth[i] * 0.65})`;
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // the halo grows with your voice
      if (glow.current) glow.current.style.opacity = String(Math.min(1, 0.25 + (total / BARS) * 2.2));
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [readMic]);

  const active = mode === "hearing";
  const busy = mode === "thinking" || mode === "speaking";

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <div
        ref={glow}
        className={`pointer-events-none absolute inset-6 rounded-full blur-3xl transition-colors duration-500 ${
          busy ? "bg-cyan-400/30" : "bg-accent/35"
        }`}
      />
      <canvas ref={canvas} className="absolute inset-0" style={{ width: SIZE, height: SIZE }} />

      {mode === "thinking" && (
        <motion.div
          className="absolute h-[140px] w-[140px] rounded-full"
          style={{ background: "conic-gradient(from 0deg, transparent, rgba(34,211,238,.7), transparent 40%)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        />
      )}

      <motion.button
        onClick={onClick}
        disabled={disabled}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        animate={{ scale: active ? 1.08 : 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className={`relative z-10 flex h-32 w-32 cursor-pointer items-center justify-center rounded-full border backdrop-blur-xl transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${
          active
            ? "border-accent bg-accent text-ink shadow-[0_0_60px_rgba(118,185,0,.6)]"
            : busy
              ? "border-cyan-300/40 bg-ink/80 text-cyan-300"
              : "border-white/10 bg-white/[0.04] text-accent hover:border-accent/50"
        }`}
        aria-label={active ? "Stop listening" : "Start talking"}
      >
        {active ? (
          <Square className="h-9 w-9" fill="currentColor" />
        ) : mode === "armed" ? (
          <Ear className="h-11 w-11" />
        ) : (
          <Mic className="h-11 w-11" />
        )}
      </motion.button>
    </div>
  );
}
