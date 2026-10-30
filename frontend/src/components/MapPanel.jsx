import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Navigation,
  Car,
  Footprints,
  Loader2,
  MapPin,
  Music,
  Pause,
  SkipForward,
  Flag,
  PlayCircle,
  CornerUpRight,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { findInMorocco, MOROCCO_BBOX } from "../morocco.js";

// The map that pops up when you say "take me to …", and the in-app navigation after it.
//
// Free, keyless services (all OpenStreetMap data):
//   - Moroccan cities, stations and landmarks are built in (morocco.js), so they're instant
//   - anything else: Photon search (inside Morocco first), Nominatim as a backup
//   - OSRM (routing.openstreetmap.de) computes the route, by car or on foot
//   - OpenStreetMap tiles draw the map
// Your position comes from the browser and is only sent to the routing service.
const ROUTERS = {
  car: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
  foot: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
};
const NEXT_TURN_M = 30; // this close to a turn = we're on the next step
const ARRIVED_M = 25;

// Your position. Laptops have no GPS: asking for high accuracy can time out, so we
// fall back to normal (Wi-Fi based) accuracy. Returns { at } or { error }.
function locate(options) {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ at: [p.coords.latitude, p.coords.longitude] }),
      (e) => resolve({ error: e }),
      options
    );
  });
}

async function myPosition() {
  if (!navigator.geolocation) return { error: "This browser can't share your location." };
  let r = await locate({ enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 });
  if (r.at || r.error.code === 1) return r.at ? r : { error: "Location is blocked for this site." };
  r = await locate({ enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  if (r.at) return r;
  return {
    error:
      r.error.code === 2
        ? "Your computer can't find its position. On Windows, turn on Settings → Privacy → Location."
        : "Finding your position took too long.",
  };
}

// Distance in meters between two [lat, lon] points.
function meters(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const fmt = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

async function photon(query, extra) {
  const params = new URLSearchParams({ q: query, limit: "6", ...extra });
  const data = await (await fetch(`https://photon.komoot.io/api/?${params}`)).json();
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  // Of the few results, keep the one sharing the most words with what you said.
  let best = null;
  for (const [i, f] of (data.features || []).entries()) {
    const p = f.properties;
    const name = [p.name, p.street, p.district, p.city, p.country].filter(Boolean).join(", ");
    const town = [p.district, p.city, p.county].filter(Boolean).join(" ").toLowerCase();
    const score =
      words.filter((w) => name.toLowerCase().includes(w)).length +
      words.filter((w) => town.includes(w)).length - // naming the town counts double
      i * 0.01;
    if (!best || score > best.score) best = { at: [f.geometry.coordinates[1], f.geometry.coordinates[0]], name, score };
  }
  return best;
}

async function findPlace(query, near) {
  const known = findInMorocco(query);
  if (known) return { at: known.at, name: `${known.name}, Morocco` };
  if (near) {
    const [lat, lon] = near;
    const hit = await photon(query, { bbox: `${lon - 0.3},${lat - 0.3},${lon + 0.3},${lat + 0.3}` });
    if (hit) return hit;
  }
  const hit = (await photon(query, { bbox: MOROCCO_BBOX })) || (await photon(query, {}));
  if (hit) return hit;
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: "json", limit: "1" })}`);
  const [n] = await res.json();
  return n ? { at: [Number(n.lat), Number(n.lon)], name: n.display_name } : null;
}

async function findRoute(from, to, mode) {
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const res = await fetch(`${ROUTERS[mode]}/${coords}?overview=full&geometries=geojson&steps=true`);
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    line: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    km: route.distance / 1000,
    min: Math.round(route.duration / 60),
    meters: route.distance,
    seconds: route.duration,
    steps: route.legs[0].steps.map((s) => ({
      text: describe(s),
      at: [s.maneuver.location[1], s.maneuver.location[0]],
      distance: s.distance, // from this turn to the next one
    })),
  };
}

// OSRM step -> "Turn left onto Avenue Hassan II"
function describe(step) {
  const { type, modifier } = step.maneuver;
  const road = step.name ? ` onto ${step.name}` : "";
  if (type === "depart") return `Head ${modifier || "out"}${step.name ? ` on ${step.name}` : ""}`;
  if (type === "arrive") return "You have arrived";
  if (type === "roundabout" || type === "rotary") return `At the roundabout, take exit ${step.maneuver.exit || 1}${road}`;
  if (modifier === "uturn") return `Make a U-turn${road}`;
  if (modifier) return `${modifier === "straight" ? "Continue straight" : `Turn ${modifier}`}${road}`;
  return `Continue${road}`;
}

// Points along the route, with the distance travelled so far at each one (for the demo drive).
function measure(line) {
  const acc = [0];
  for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + meters(line[i - 1], line[i]));
  return acc;
}
function pointAt(line, acc, d) {
  let i = acc.findIndex((x) => x >= d);
  if (i <= 0) return i === 0 ? line[0] : line[line.length - 1];
  const t = (d - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
  return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
}

export default function MapPanel({ place, onClose, onRoute, say, music, onTrip }) {
  const box = useRef(null);
  const map = useRef(null);
  const layers = useRef([]);
  const youMarker = useRef(null);
  const [mode, setMode] = useState("car");
  const [status, setStatus] = useState("Finding you…");
  const [from, setFrom] = useState(""); // a typed start, when the browser can't locate you
  const [fromDraft, setFromDraft] = useState("");
  const [info, setInfo] = useState(null);
  const announced = useRef(false);

  // Navigation state
  const [nav, setNav] = useState(false);
  const [demo, setDemo] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [left, setLeft] = useState(null); // { m, min }
  const [arrived, setArrived] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const stepRef = useRef(0);
  const stopFeed = useRef(() => {});

  // Create the map once.
  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: false }).setView([33.97, -6.85], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      className: "dark-tiles", // index.css turns the light map dark
    }).addTo(map.current);
    L.control.zoom({ position: "bottomright" }).addTo(map.current);
    return () => {
      stopFeed.current();
      map.current.remove();
    };
  }, []);

  // Find the place and the route (again when car/foot changes).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setInfo(null);
      setStatus("Finding you…");
      // A start you typed wins; otherwise the browser's position.
      const typedStart = from ? await findPlace(from).catch(() => null) : null;
      const located = typedStart ? { at: typedStart.at } : await myPosition();
      const me = located.at || null;
      if (cancelled) return;
      setStatus("Finding the place…");
      const dest = await findPlace(place, me).catch(() => null);
      if (cancelled) return;
      layers.current.forEach((l) => l.remove());
      layers.current = [];
      if (!dest) return setStatus(`I couldn't find “${place}” on the map.`);

      const pin = L.circleMarker(dest.at, { radius: 9, color: "#fff", weight: 3, fillColor: "#76b900", fillOpacity: 1 });
      layers.current.push(pin.addTo(map.current));
      if (!me) {
        map.current.flyTo(dest.at, 14, { duration: 1.2 });
        setInfo({ dest, noStart: true });
        return setStatus(
          from ? `I couldn't find “${from}”.` : `${located.error} Or type where you are starting from below.`
        );
      }

      youMarker.current?.remove();
      youMarker.current = L.marker(me, {
        icon: L.divIcon({ className: "", html: '<div class="nav-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        zIndexOffset: 1000,
      }).addTo(map.current);
      setStatus("Drawing the route…");
      const route = await findRoute(me, dest.at, mode).catch(() => null);
      if (cancelled) return;
      if (!route) {
        map.current.fitBounds([me, dest.at], { padding: [40, 40] });
        setInfo({ dest, me });
        return setStatus("No route found from here.");
      }
      const glow = L.polyline(route.line, { color: "#76b900", weight: 12, opacity: 0.22 });
      const line = L.polyline(route.line, { color: "#76b900", weight: 5 });
      layers.current.push(glow.addTo(map.current), line.addTo(map.current));
      map.current.flyToBounds(line.getBounds(), { padding: [40, 40], duration: 1.2 });
      setInfo({ dest, route, me });
      setStatus("");
      if (!announced.current) {
        announced.current = true;
        onRoute?.(route, mode);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [place, mode, from]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- in-app navigation ----------

  // Every new position: move the dot, follow it, announce turns, detect arrival.
  const onPosition = (pos) => {
    const { route, dest } = info;
    youMarker.current?.setLatLng(pos);
    map.current.panTo(pos, { animate: true, duration: 0.4 });

    let i = stepRef.current;
    while (i + 1 < route.steps.length && meters(pos, route.steps[i + 1].at) < NEXT_TURN_M) {
      i += 1;
      if (route.steps[i].text && i < route.steps.length - 1) say(route.steps[i].text);
    }
    if (i !== stepRef.current) {
      stepRef.current = i;
      setStepIdx(i);
    }

    const next = route.steps[i + 1];
    const m = next
      ? meters(pos, next.at) + route.steps.slice(i + 1).reduce((s, x) => s + x.distance, 0)
      : meters(pos, dest.at);
    const min = Math.max(1, Math.round((m / route.meters) * route.min));
    setLeft({ m, min, toTurn: next ? meters(pos, next.at) : m });
    onTrip?.({ dest: place, minutes: min, next: next?.text || "arriving" });

    if (meters(pos, dest.at) < ARRIVED_M || (!next && m < ARRIVED_M * 2)) {
      stopFeed.current();
      setArrived(true);
      say(`You've arrived at ${place}. Nice drive!`);
    }
  };
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  const startNav = (simulate) => {
    const { route, me } = info;
    stepRef.current = 0;
    setStepIdx(0);
    setArrived(false);
    setGpsError("");
    setDemo(simulate);
    setNav(true);
    // Let the panel grow to full screen, then swoop down onto your position.
    setTimeout(() => {
      map.current.invalidateSize();
      map.current.flyTo(me, 17, { duration: 2.4, easeLinearity: 0.2 });
    }, 80);
    say(`Let's go. ${route.min} minutes to ${place}. ${route.steps[0]?.text || ""}.`);

    stopFeed.current();
    if (simulate) {
      // Demo drive: glide along the route in about a minute, so you can see it all work.
      const acc = measure(route.line);
      const total = acc[acc.length - 1];
      const seconds = Math.min(120, Math.max(45, total / 40));
      let d = 0;
      let timer;
      const begin = setTimeout(() => {
        timer = setInterval(() => {
          d = Math.min(total, d + total / (seconds * 10));
          onPositionRef.current(pointAt(route.line, acc, d));
        }, 100);
      }, 2600); // after the fly-in
      stopFeed.current = () => {
        clearTimeout(begin);
        clearInterval(timer);
      };
    } else {
      let last = null;
      const id = navigator.geolocation.watchPosition(
        (p) => {
          const pos = [p.coords.latitude, p.coords.longitude];
          const accuracy = p.coords.accuracy;
          setGpsError("");
          // GPS drifts even when you stand still. Only move the dot for a real change.
          if (accuracy > 200) return;
          if (last && meters(last, pos) < Math.min(30, Math.max(8, accuracy))) return;
          last = pos;
          onPositionRef.current(pos);
        },
        (e) => setGpsError(e.code === 1 ? "Location is blocked, so Vox can't follow you." : "Waiting for a GPS signal…"),
        { enableHighAccuracy: true, maximumAge: 2000 }
      );
      stopFeed.current = () => navigator.geolocation.clearWatch(id);
    }
  };

  const endNav = () => {
    stopFeed.current();
    stopFeed.current = () => {};
    setNav(false);
    onTrip?.(null);
    setTimeout(() => {
      map.current.invalidateSize();
      if (info?.route) map.current.flyToBounds(L.polyline(info.route.line).getBounds(), { padding: [40, 40], duration: 1.2 });
    }, 80);
  };

  const close = () => {
    stopFeed.current();
    onTrip?.(null);
    onClose();
  };

  const upcoming = info?.route?.steps[stepIdx + 1];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={nav ? undefined : close}
    >
      <motion.div
        layout
        initial={{ y: 40, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 40, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className={
          nav
            ? "fixed inset-0 flex overflow-hidden bg-ink"
            : "glass flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl sm:h-[80vh] sm:rounded-3xl md:flex-row"
        }
      >
        <div ref={box} className="relative h-1/2 min-h-0 flex-1 md:h-auto" style={nav ? { height: "100%" } : undefined} />

        {/* ----- navigating: big instruction on top, trip bar at the bottom ----- */}
        <AnimatePresence>
          {nav && info?.route && (
            <>
              <motion.div
                key="banner"
                initial={{ y: -40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -40, opacity: 0 }}
                className="absolute inset-x-3 top-3 z-[1000] mx-auto max-w-xl rounded-3xl bg-accent px-5 py-4 text-ink shadow-[0_10px_40px_rgba(118,185,0,.35)]"
              >
                {arrived ? (
                  <p className="flex items-center gap-3 font-display text-2xl font-bold">
                    <Flag className="h-7 w-7" /> You've arrived
                  </p>
                ) : (
                  <div className="flex items-center gap-4">
                    <CornerUpRight className="h-9 w-9 shrink-0" strokeWidth={2.5} />
                    <div className="min-w-0">
                      <p className="font-display text-3xl font-bold leading-none">{left ? fmt(left.toTurn) : "…"}</p>
                      <p className="mt-1 truncate text-base font-semibold">{upcoming?.text || "Follow the route"}</p>
                    </div>
                  </div>
                )}
              </motion.div>

              <motion.div
                key="bar"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                className="glass absolute inset-x-3 bottom-3 z-[1000] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-3xl px-5 py-3"
              >
                <div className="mr-auto">
                  <p className="font-display text-2xl font-bold text-accent">
                    {left ? left.min : info.route.min} <span className="text-sm font-medium text-muted">min</span>
                  </p>
                  <p className="text-xs text-muted">
                    {left ? fmt(left.m) : `${info.route.km.toFixed(1)} km`} · {place}
                    {demo && " · demo drive"}
                  </p>
                  {gpsError && <p className="mt-0.5 text-xs text-rose-300">{gpsError}</p>}
                </div>

                <div className="flex items-center gap-1 rounded-full bg-white/5 py-1 pl-3 pr-1">
                  <Music className={`h-4 w-4 ${music.playing ? "text-accent" : "text-muted"}`} />
                  <span className="max-w-28 truncate text-xs text-muted">{music.playing ? music.station.name : "Music"}</span>
                  <button
                    onClick={music.toggle}
                    className="cursor-pointer rounded-full p-1.5 hover:bg-white/10"
                    aria-label={music.playing ? "Pause music" : "Play music"}
                  >
                    {music.playing ? <Pause className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                  </button>
                  {music.playing && (
                    <button onClick={music.next} className="cursor-pointer rounded-full p-1.5 hover:bg-white/10" aria-label="Next station">
                      <SkipForward className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <button
                  onClick={endNav}
                  className="cursor-pointer rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
                >
                  {arrived ? "Done" : "End"}
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ----- route preview side panel ----- */}
        {!nav && (
          <div className="flex w-full flex-col p-5 md:w-80">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
                  <Navigation className="h-3.5 w-3.5" /> Directions
                </p>
                <p className="mt-1 font-display text-xl font-semibold capitalize">{place}</p>
                {info?.dest && <p className="mt-1 line-clamp-2 text-xs text-muted">{info.dest.name}</p>}
              </div>
              <button onClick={close} className="cursor-pointer rounded-lg p-1.5 text-muted hover:text-white" aria-label="Close map">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex gap-1 rounded-full bg-white/5 p-1">
              {[
                ["car", Car, "Drive"],
                ["foot", Footprints, "Walk"],
              ].map(([id, Icon, label]) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full py-1.5 text-sm transition ${
                    mode === id ? "bg-accent font-medium text-ink" : "text-muted hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            {status && (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted">
                {status.endsWith("…") ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                {status}
              </p>
            )}

            {(info?.noStart || from) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setFrom(fromDraft.trim());
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  value={fromDraft}
                  onChange={(e) => setFromDraft(e.target.value)}
                  placeholder="Start from… (e.g. Agdal, Rabat)"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent/60"
                />
                <button
                  type="submit"
                  disabled={!fromDraft.trim()}
                  className="cursor-pointer rounded-xl bg-accent px-3 text-sm font-semibold text-ink disabled:opacity-40"
                >
                  Go
                </button>
              </form>
            )}

            {info?.route && (
              <>
                <p className="mt-4 font-display text-3xl font-bold">
                  {info.route.min} <span className="text-base font-medium text-muted">min</span>
                  <span className="ml-3 text-base font-medium text-muted">{info.route.km.toFixed(1)} km</span>
                </p>
                <ol className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
                  {info.route.steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-white/80">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[10px]">
                        {i + 1}
                      </span>
                      <span>
                        {s.text}
                        {s.distance > 0 && <span className="text-muted"> · {fmt(s.distance)}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
                {from ? (
                  <p className="mt-4 text-xs text-muted">
                    Live navigation follows your real GPS position, so it needs location turned on, not a typed start.
                  </p>
                ) : (
                  <button
                    onClick={() => startNav(false)}
                    className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-ink transition hover:brightness-110"
                  >
                    <Navigation className="h-4 w-4" /> Start navigation
                  </button>
                )}
                <button
                  onClick={() => startNav(true)}
                  className="mt-2 cursor-pointer rounded-2xl border border-white/10 px-4 py-2 text-xs text-muted transition hover:text-white"
                >
                  Demo drive (simulated)
                </button>
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
