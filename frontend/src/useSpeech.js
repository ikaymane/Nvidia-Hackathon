import { useCallback, useEffect, useRef, useState } from "react";
import { fixHearing } from "./morocco.js";

// Wraps the browser's built-in speech recognition (works in Chrome and Edge).
//
// Two ways to use it:
//  - push-to-talk: start() / stop(). When it stops, onFinal(text) gets everything heard.
//  - hands-free: set handsFree=true. It listens all the time, wakes up as soon as you
//    start talking, and sends your sentence after ~1.2 s of silence.
//    `paused` (while the AI thinks or speaks) stops it from hearing itself.
const SILENCE_MS = 1700; // long enough for a breath in the middle of a sentence

export function useSpeech({ lang, onFinal, handsFree = false, paused = false }) {
  const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [listening, setListening] = useState(false); // recognition is running
  const [hearing, setHearing] = useState(false); // words are coming in right now
  const [transcript, setTranscript] = useState("");
  const rec = useRef(null);
  const finalText = useRef("");
  const interimText = useRef("");
  const silenceTimer = useRef(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;

  useEffect(() => {
    if (!Recognition) return;
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true; // keep listening through short pauses, so long brain-dumps work
    r.interimResults = true; // show words while the user is still talking

    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText.current += piece + " ";
        else interim += piece;
      }
      interimText.current = interim;
      setTranscript(fixHearing((finalText.current + interim).trim()));
      setHearing(true);

      // Hands-free: when the user goes quiet, end this sentence (onend sends it).
      clearTimeout(silenceTimer.current);
      if (handsFreeRef.current) silenceTimer.current = setTimeout(() => r.stop(), SILENCE_MS);
    };

    r.onend = () => {
      clearTimeout(silenceTimer.current);
      setListening(false);
      setHearing(false);
      // Keep the words still being recognized too, or the end of the sentence gets lost.
      const text = fixHearing((finalText.current + interimText.current).trim());
      finalText.current = "";
      interimText.current = "";
      if (text) onFinalRef.current(text);
    };
    r.onerror = () => {}; // "no-speech" etc. are normal; onend follows and handles restart

    rec.current = r;
    return () => {
      r.onend = null;
      r.abort();
    };
  }, [Recognition, lang]);

  const start = useCallback(() => {
    if (!rec.current) return;
    finalText.current = "";
    interimText.current = "";
    setTranscript("");
    try {
      rec.current.start();
      setListening(true);
    } catch {
      /* already running */
    }
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);

  // Hands-free: restart listening whenever it ends, unless the app is busy.
  useEffect(() => {
    if (!handsFree || paused || listening || !Recognition) return;
    const t = setTimeout(start, 250);
    return () => clearTimeout(t);
  }, [handsFree, paused, listening, Recognition, start]);

  // Turning hands-free off while it's waiting: stop quietly.
  useEffect(() => {
    if (!handsFree && listening && !hearing) rec.current?.abort();
  }, [handsFree]); // eslint-disable-line react-hooks/exhaustive-deps

  return { supported: Boolean(Recognition), listening, hearing, transcript, start, stop };
}

// Read the assistant's reply out loud. Resolves when it has finished speaking.
export function speak(text, lang) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis || !text) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.05;
    const fallback = setTimeout(resolve, 2000 + text.length * 90); // Chrome sometimes skips onend
    u.onend = u.onerror = () => {
      clearTimeout(fallback);
      resolve();
    };
    window.speechSynthesis.speak(u);
  });
}
