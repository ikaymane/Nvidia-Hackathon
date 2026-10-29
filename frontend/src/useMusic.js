import { useCallback, useEffect, useRef, useState } from "react";

// Music for the road: a royalty-free road mix (SoundHelix demo tracks, no key needed).
// It moves to the next track by itself. While Vox talks or listens, the music gets
// quieter so you can hear each other.
export const STATIONS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  name: `Road mix · track ${n}`,
  url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`,
}));
const LOUD = 0.6;
const QUIET = 0.12;

export function useMusic({ duck }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);

  if (!audio.current && typeof Audio !== "undefined") audio.current = new Audio();

  const play = useCallback((i = index) => {
    const a = audio.current;
    setIndex(i);
    if (a.src !== STATIONS[i].url) a.src = STATIONS[i].url;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [index]);

  const stop = useCallback(() => {
    audio.current.pause();
    setPlaying(false);
  }, []);

  const next = useCallback(() => play((index + 1) % STATIONS.length), [index, play]);
  const toggle = () => (playing ? stop() : play());

  // When a track ends, play the next one.
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const a = audio.current;
    const onEnd = () => nextRef.current();
    a?.addEventListener("ended", onEnd);
    return () => a?.removeEventListener("ended", onEnd);
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.volume = duck ? QUIET : LOUD;
  }, [duck, playing]);

  useEffect(() => () => audio.current?.pause(), []);

  return { playing, station: STATIONS[index], play, stop, next, toggle };
}
