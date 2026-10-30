import { useCallback, useEffect, useRef, useState } from "react";
import { PHONE } from "./useSpeech.js";

// Opens the microphone once and exposes live loudness data for the visualizer.
// read() returns an array of 0-255 frequency values (or null before the mic is ready).
// Phones skip this: holding the mic here leaves speech recognition hearing nothing.
export function useMic(enabled) {
  const analyser = useRef(null);
  const data = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || PHONE || !navigator.mediaDevices) return;
    let stream;
    let ctx;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        ctx = new AudioContext();
        const a = ctx.createAnalyser();
        a.fftSize = 128;
        a.smoothingTimeConstant = 0.75;
        ctx.createMediaStreamSource(s).connect(a);
        analyser.current = a;
        data.current = new Uint8Array(a.frequencyBinCount);
        setReady(true);
      })
      .catch(() => setError("Microphone access was blocked."));

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
      analyser.current = null;
      setReady(false);
    };
  }, [enabled]);

  const read = useCallback(() => {
    if (!analyser.current) return null;
    analyser.current.getByteFrequencyData(data.current);
    return data.current;
  }, []);

  return { ready, error, read };
}
