import {
  deletePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/app/push-subscription-actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const NO_RETRY_REASONS = new Set([
  "non_production",
  "unsupported",
  "permission_denied",
]);

export function isRetryablePushSubscriptionFailure(reason?: string): boolean {
  if (!reason) return true;
  return !NO_RETRY_REASONS.has(reason);
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function subscriptionToPayload(sub: PushSubscription) {
  const json = sub.toJSON();
  const keys = json.keys;
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
    return null;
  }
  return {
    endpoint: json.endpoint,
    p256dh: keys.p256dh,
    authKey: keys.auth,
    userAgent: navigator.userAgent,
  };
}

export async function registerWebPushSubscription(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (process.env.NODE_ENV !== "production") {
    return { ok: false, reason: "non_production" };
  }
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: "missing_vapid" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, reason: "permission_denied" };
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();

  let subscription = existing;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        VAPID_PUBLIC_KEY
      ) as BufferSource,
    });
  }

  const payload = subscriptionToPayload(subscription);
  if (!payload) return { ok: false, reason: "invalid_subscription" };

  const res = await savePushSubscriptionAction(payload);
  if (res.error) return { ok: false, reason: res.error };

  return { ok: true };
}

export async function unregisterWebPushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await deletePushSubscriptionAction(endpoint);
}

/** Navigasi dari klik notifikasi OS (service worker postMessage). */
export function listenForNotificationClickNavigate(
  onNavigate: (url: string) => void
): () => void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return () => {};
  }

  const handler = (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: string } | undefined;
    if (data?.type === "NOTIFICATION_CLICK_NAVIGATE" && data.url) {
      onNavigate(data.url);
    }
  };

  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
