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

// Phones let only one thing use the microphone at a time (see useMic).
export const PHONE = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Phones end recognition at the first pause, whatever `continuous` says. So we start it
// again and keep the words, and only finish after this much quiet (or when you tap stop).
const PHONE_SILENCE_MS = 2500; // hands-free
const PHONE_TAP_SILENCE_MS = 3500; // tap to talk: you chose to talk, so wait longer

// What to tell the user when recognition fails. Errors not listed here are normal.
const SPEECH_ERRORS = {
  "not-allowed": "Microphone is blocked. Allow it for Vox in your browser or phone settings.",
  "service-not-allowed": "Speech recognition is blocked here. Try the site in Chrome instead of the installed app.",
  "audio-capture": "No microphone available. Close other apps that may be using it.",
  network: "Speech recognition needs an internet connection. Please try again.",
  "language-not-supported": "This language isn't available on this device. Try another one.",
};

// Android repeats everything said so far in each new result, so replace instead of adding.
function addHeard(said, piece) {
  const before = said.trim().toLowerCase();
  if (PHONE && before && piece.trim().toLowerCase().startsWith(before)) return piece.trim();
  return said + piece;
}

export function useSpeech({ lang, onFinal, handsFree = false, paused = false }) {
  const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [listening, setListening] = useState(false); // recognition is running
  const [hearing, setHearing] = useState(false); // words are coming in right now
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const rec = useRef(null);
  const finalText = useRef("");
  const interimText = useRef("");
  const earlierText = useRef(""); // words from before a phone restarted recognition
  const keepGoing = useRef(false); // false once the user or the silence timer ended it
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
        if (e.results[i].isFinal) finalText.current = addHeard(finalText.current, piece) + " ";
        else interim += piece;
      }
      interimText.current = interim;
      setTranscript(fixHearing((earlierText.current + addHeard(finalText.current, interim)).trim()));
      setHearing(true);

      // When the user goes quiet, end this sentence (onend sends it).
      clearTimeout(silenceTimer.current);
      const wait = handsFreeRef.current ? (PHONE ? PHONE_SILENCE_MS : SILENCE_MS) : PHONE ? PHONE_TAP_SILENCE_MS : null;
      if (wait) {
        silenceTimer.current = setTimeout(() => {
          keepGoing.current = false;
          r.stop();
        }, wait);
      }
    };

    r.onend = () => {
      // Keep the words still being recognized too, or the end of the sentence gets lost.
      const said = earlierText.current + addHeard(finalText.current, interimText.current);
      finalText.current = "";
      interimText.current = "";
      // A phone stopped at a pause while the user may still be talking: listen again.
      if (PHONE && keepGoing.current && said.trim()) {
        earlierText.current = said.trimEnd() + " ";
        try {
          r.start();
          return;
        } catch {
          /* couldn't restart: send what we have */
        }
      }
      clearTimeout(silenceTimer.current);
      keepGoing.current = false;
      earlierText.current = "";
      setListening(false);
      setHearing(false);
      const text = fixHearing(said.trim());
      if (text) onFinalRef.current(text);
    };
    r.onerror = (e) => {
      // onend follows and handles restart. Silence is normal in hands-free or after some words.
      if (e.error === "no-speech") {
        if (!handsFreeRef.current && !earlierText.current) setError("I didn't hear anything. Tap and try again.");
      } else if (SPEECH_ERRORS[e.error]) {
        keepGoing.current = false;
        setError(SPEECH_ERRORS[e.error]);
      }
    };

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
    earlierText.current = "";
    setTranscript("");
    setError("");
    try {
      rec.current.start();
      keepGoing.current = true;
      setListening(true);
    } catch {
      /* already running */
    }
  }, []);

  const stop = useCallback(() => {
    keepGoing.current = false;
    rec.current?.stop();
  }, []);

  // Switching hands-free on or off gives a blocked microphone another chance.
  useEffect(() => setError(""), [handsFree]);

  // Hands-free: restart listening whenever it ends, unless the app is busy or the mic failed.
  useEffect(() => {
    if (!handsFree || paused || listening || !Recognition || error) return;
    const t = setTimeout(start, 250);
    return () => clearTimeout(t);
  }, [handsFree, paused, listening, Recognition, start, error]);

  // Turning hands-free off while it's waiting: stop quietly.
  useEffect(() => {
    if (!handsFree && listening && !hearing) rec.current?.abort();
  }, [handsFree]); // eslint-disable-line react-hooks/exhaustive-deps

  return { supported: Boolean(Recognition), listening, hearing, transcript, error, start, stop };
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
