"use client";

import { supabase } from "@/lib/supabaseClient";

// Web Push registration. Separate from notificationAlerts.js (which
// handles the app-is-open case) -- this is what makes notifications
// arrive on a phone with the app fully closed.

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

// Subscribes this device and stores it so the server can push to it.
// Returns { ok } or { ok: false, reason } so the caller can explain
// what happened rather than failing silently.
export async function subscribeToPush(userId) {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, reason: "not-configured" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const registration = await registerServiceWorker();
  if (!registration) return { ok: false, reason: "sw-failed" };

  // navigator.serviceWorker.ready never settles if the worker fails to
  // activate -- without a timeout the caller hangs on "Enabling..."
  // with nothing to show for it.
  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("sw-timeout")), 10000)),
    ]);
  } catch {
    return { ok: false, reason: "Service worker didn't start. Try reloading the page." };
  }

  try {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const json = subscription.toJSON();
    if (!json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "bad-subscription" };
    }

    // Upsert on endpoint -- re-subscribing the same device shouldn't
    // create duplicate rows, and the endpoint is what uniquely
    // identifies it.
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 300),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "subscribe-failed" };
  }
}

export async function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  } catch {
    // Best effort -- if the row lingers, the send path prunes dead
    // endpoints when the push provider rejects them.
  }
}

export async function isPushSubscribed() {
  if (!pushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
