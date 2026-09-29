"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Hold-free voice recorder: tap to start, tap to stop. Hands the
// finished clip back as a File so the chat can upload it through the
// exact same attachment path as any other file -- no separate storage
// or message type needed.
export default function VoiceRecorder({ onRecorded, disabled }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  // Release the mic if the chat closes mid-recording -- otherwise the
  // browser keeps showing the "recording" indicator indefinitely.
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(intervalRef.current);
    };
  }, []);

  async function start() {
    setError("");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording isn't supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // Let the browser pick a format it actually supports -- Safari
      // and Chrome disagree on webm vs mp4, and forcing one breaks the
      // other.
      const preferred = ["audio/webm", "audio/mp4", "audio/ogg"];
      const mimeType = preferred.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type });

        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        // Ignore accidental taps that produce near-empty clips.
        if (blob.size > 1000) onRecorded(file);
      };

      recorder.start();
      setRecording(true);
      setSeconds(0);
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone access was blocked."
          : "Couldn't start recording."
      );
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    clearInterval(intervalRef.current);
    setRecording(false);
  }

  function cancel() {
    // Clearing chunks before stopping means onstop builds an empty
    // blob, which the size check above discards.
    chunksRef.current = [];
    stop();
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="flex items-center gap-1 text-xs text-red-600">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          {formatTime(seconds)}
        </span>
        <button
          type="button"
          onClick={stop}
          className="text-xs px-2 py-1 rounded-md bg-brand text-white font-medium"
          title="Stop and attach"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={cancel}
          className="text-xs text-slate-400 hover:text-red-500"
          title="Discard"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        className="text-lg px-0.5 sm:px-1 flex-shrink-0 disabled:opacity-40"
        title="Record a voice message"
      >
        <Icon name="mic" size={18} />
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </>
  );
}
