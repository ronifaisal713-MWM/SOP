"use client";

// In-app alerting: a short sound plus a native browser notification
// when one arrives while the app is open. This is separate from Web
// Push (which handles the app being closed) -- both can be active, so
// we suppress the browser popup here if the page is actually visible
// and focused, to avoid doubling up with what the person can already
// see on screen.

let audioContext = null;

// Generated rather than shipped as an audio file -- avoids adding a
// binary asset for what's essentially two short beeps, and dodges the
// autoplay restrictions that block <audio> until a user gesture.
export function playNotificationSound() {
  try {
    if (!audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioContext = new Ctx();
    }
    // Browsers suspend the context until a user gesture -- resume is a
    // no-op if it's already running.
    if (audioContext.state === "suspended") audioContext.resume();

    const now = audioContext.currentTime;
    [
      { freq: 880, at: 0 },
      { freq: 1170, at: 0.12 },
    ].forEach(({ freq, at }) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(0.18, now + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.18);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.2);
    });
  } catch {
    // Sound is a nicety -- never let it break the notification itself.
  }
}

export function showBrowserNotification({ title, body, url }) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // If they're already looking at the page, the in-app bell is enough.
    if (document.visibilityState === "visible" && document.hasFocus()) return;

    const n = new Notification(title || "Agency OS", {
      body: body || "",
      icon: "/icon-512.png",
      badge: "/icon-512.png",
    });

    n.onclick = () => {
      window.focus();
      if (url) window.location.href = url;
      n.close();
    };
  } catch {
    // Same -- best effort.
  }
}

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}
