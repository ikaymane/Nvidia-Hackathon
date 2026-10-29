import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, User } from "lucide-react";

// The agent's memory as a living network:
//   You (center) -> facts Vox remembers -> tasks that mention them
//   You -> projects -> their tasks
// A tiny physics simulation pushes nodes apart and pulls linked ones together.

const STOP = new Set(
  "the a an and or of to in on at for is are was user user's users called name named his her their my with goes go every has have this that from".split(
    " "
  )
);
const words = (s) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-zÀ-ɏ؀-ۿ0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );

const STYLE = {
  you: { r: 26, fill: "#76b900", ring: "rgba(118,185,0,.35)" },
  fact: { r: 15, fill: "#22d3ee", ring: "rgba(34,211,238,.3)" },
  project: { r: 12, fill: "#f59e0b", ring: "rgba(245,158,11,.3)" },
  task: { r: 6, fill: "#9ca3af", ring: "rgba(156,163,175,.2)" },
};

function buildGraph(memory, tasks) {
  const nodes = [{ id: "you", kind: "you", label: "You" }];
  const links = [];
  const open = tasks.filter((t) => !t.done);
  const linkedTasks = new Set();

  for (const m of memory) {
    const id = `m:${m.key}`;
    nodes.push({ id, kind: "fact", label: m.key.replace(/_/g, " "), detail: m.value, key: m.key });
    links.push({ s: "you", t: id });
    const factWords = words(`${m.key} ${m.value}`);
    for (const task of open) {
      if ([...words(task.title)].some((w) => factWords.has(w))) {
        links.push({ s: id, t: `t:${task.id}` });
        linkedTasks.add(task.id);
      }
    }
  }

  const projects = [...new Set(open.map((t) => t.project).filter(Boolean))];
  for (const p of projects) {
    nodes.push({ id: `p:${p}`, kind: "project", label: p });
    links.push({ s: "you", t: `p:${p}` });
    for (const task of open.filter((t) => t.project === p)) {
      links.push({ s: `p:${p}`, t: `t:${task.id}` });
      linkedTasks.add(task.id);
    }
  }

  for (const task of open.filter((t) => linkedTasks.has(t.id))) {
    nodes.push({ id: `t:${task.id}`, kind: "task", label: task.title });
  }
  return { nodes, links };
}

export default function MemoryGraph({ memory, tasks, onForget }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 600, h: 460 });
  const [, setTick] = useState(0);
  const [selected, setSelected] = useState(null);
  const pos = useRef({}); // id -> {x, y, vx, vy}
  const drag = useRef(null); // the node being dragged right now
  const dragged = useRef(false); // did the last press move? (then it's a drag, not a click)
  const wake = useRef(() => {}); // restarts the physics after it went to sleep

  const { nodes, links } = useMemo(() => buildGraph(memory, tasks), [memory, tasks]);

  // keep the svg sized to its container
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // physics loop
  useEffect(() => {
    const P = pos.current;
    const cx = size.w / 2;
    const cy = size.h / 2;
    for (const n of nodes) {
      if (!P[n.id]) {
        const a = Math.random() * Math.PI * 2;
        P[n.id] = { x: cx + Math.cos(a) * 40, y: cy + Math.sin(a) * 40, vx: 0, vy: 0 };
      }
    }
    let frame = null;
    let energy = 1;
    const step = () => {
      for (let i = 0; i < nodes.length; i++) {
        const a = P[nodes[i].id];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = P[nodes[j].id];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 80);
          const f = 2400 / d2;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
        }
      }
      for (const l of links) {
        const a = P[l.s];
        const b = P[l.t];
        if (!a || !b) continue;
        const rest = l.s === "you" ? 140 : 80;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - rest) * 0.02;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      energy = 0;
      for (const n of nodes) {
        const p = P[n.id];
        if (n.id === "you") {
          p.x = cx;
          p.y = cy;
          continue;
        }
        if (drag.current?.id === n.id) continue;
        p.vx += (cx - p.x) * 0.003;
        p.vy += (cy - p.y) * 0.003;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x = Math.min(size.w - 20, Math.max(20, p.x + p.vx));
        p.y = Math.min(size.h - 24, Math.max(20, p.y + p.vy));
        energy += Math.abs(p.vx) + Math.abs(p.vy);
      }
      setTick((t) => t + 1);
      // Once everything has settled, stop the loop so an idle graph costs no CPU.
      frame = energy > 0.05 || drag.current ? requestAnimationFrame(step) : null;
    };
    wake.current = () => {
      if (frame === null) frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [nodes, links, size]);

  const toSvg = (e) => {
    const r = box.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const p = pos.current[drag.current.id];
    const { x, y } = toSvg(e);
    p.x = x;
    p.y = y;
    p.vx = p.vy = 0;
    dragged.current = true;
    wake.current();
  };

  const P = pos.current;
  const factCount = memory.length;

  return (
    <div className="glass relative overflow-hidden rounded-3xl">
      <div className="pointer-events-none absolute left-5 top-4 z-10">
        <p className="font-display text-lg font-semibold">Memory network</p>
        <p className="text-xs text-muted">
          {factCount ? `${factCount} fact${factCount > 1 ? "s" : ""} · drag the nodes` : 'Say "remember that…" to grow it'}
        </p>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-5 z-10 flex gap-4 font-mono text-[10px] text-muted">
        {[
          ["fact", "memory"],
          ["project", "project"],
          ["task", "task"],
        ].map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: STYLE[k].fill }} /> {label}
          </span>
        ))}
      </div>

      <div
        ref={box}
        className="h-[460px] w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        <svg width={size.w} height={size.h}>
          <defs>
            <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {links.map((l) => {
            const a = P[l.s];
            const b = P[l.t];
            if (!a || !b) return null;
            const hot = selected && (l.s === selected.id || l.t === selected.id);
            return (
              <line
                key={`${l.s}-${l.t}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="flow"
                stroke={hot ? "#22d3ee" : "rgba(255,255,255,.3)"}
                strokeWidth={hot ? 1.6 : 1}
              />
            );
          })}

          {nodes.map((n, i) => {
            const p = P[n.id];
            if (!p) return null;
            const s = STYLE[n.kind];
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                className="cursor-pointer"
                onPointerDown={() => {
                  drag.current = { id: n.id };
                  dragged.current = false;
                }}
                onClick={() => {
                  if (!dragged.current && n.kind !== "you") setSelected(n);
                }}
              >
                <motion.g
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16, delay: Math.min(i * 0.05, 0.8) }}
                >
                  <circle r={s.r + 8} fill={s.ring} filter="url(#glow)" />
                  {n.kind === "you" && (
                    <circle r={s.r + 4} fill="none" stroke={s.fill} strokeOpacity=".4">
                      <animate attributeName="r" values={`${s.r + 2};${s.r + 14};${s.r + 2}`} dur="3s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" values=".5;0;.5" dur="3s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle r={s.r} fill={s.fill} stroke="rgba(255,255,255,.35)" strokeWidth={selected?.id === n.id ? 2.5 : 1} />
                  {n.kind === "you" && (
                    <foreignObject x={-10} y={-10} width={20} height={20} style={{ pointerEvents: "none" }}>
                      <User className="h-5 w-5 text-ink" />
                    </foreignObject>
                  )}
                  <text
                    y={s.r + 14}
                    textAnchor="middle"
                    className={`pointer-events-none ${n.kind === "task" ? "fill-white/50 text-[10px]" : "fill-white/90 text-[11px] font-medium"}`}
                  >
                    {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                  </text>
                </motion.g>
              </g>
            );
          })}
        </svg>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="absolute bottom-4 right-4 z-20 w-72 rounded-2xl border border-white/10 bg-ink/90 p-4 backdrop-blur-xl"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: STYLE[selected.kind].fill }}>
                {selected.kind === "fact" ? "memory" : selected.kind}
              </span>
              <button onClick={() => setSelected(null)} className="cursor-pointer text-muted hover:text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="font-medium">{selected.label}</p>
            {selected.detail && <p className="mt-1 text-sm text-white/70">{selected.detail}</p>}
            {selected.kind === "fact" && (
              <button
                onClick={() => {
                  onForget(selected.key);
                  setSelected(null);
                }}
                className="mt-3 cursor-pointer rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
              >
                Forget this
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
