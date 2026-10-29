import { useCallback, useEffect, useRef, useState } from "react";

// Meeting mode: keeps transcribing for as long as you want (a meeting, a class, a talk).
//
// The browser's speech recognition stops by itself after a pause or a minute or so,
// so while we are recording we simply start it again every time it ends.
// Nothing is sent to the server until you stop: then the whole transcript is saved.
const STOP = /\b(stop|end) (the )?(recording|meeting)\b/i;

export function useMeeting({ lang, onDone }) {
  const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const rec = useRef(null);
  const finalText = useRef("");
  const recordingRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const start = useCallback(() => {
    if (!Recognition || recordingRef.current) return;
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    finalText.current = "";
    setText("");
    setSeconds(0);

    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (!e.results[i].isFinal) {
          interim += piece;
        } else if (STOP.test(piece)) {
          setTimeout(() => stopRef.current(), 0); // "Vox, stop recording" ends it hands-free
          return;
        } else {
          finalText.current += piece.trim() + ". ";
        }
      }
      setText((finalText.current + interim).trim());
    };
    r.onerror = () => {}; // "no-speech" during silence is normal; onend restarts
    r.onend = () => {
      if (recordingRef.current) {
        try {
          r.start(); // keep going
        } catch {
          /* already restarting */
        }
      }
    };

    rec.current = r;
    recordingRef.current = true;
    setRecording(true);
    r.start();
  }, [Recognition, lang]);

  const stop = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    rec.current?.stop();
    const transcript = finalText.current.trim();
    if (transcript) onDoneRef.current(transcript);
  }, []);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // A running clock, so you can see it's still recording.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Leaving the page: stop the microphone.
  useEffect(() => () => {
    recordingRef.current = false;
    rec.current?.abort();
  }, []);

  return { supported: Boolean(Recognition), recording, text, seconds, start, stop };
}
