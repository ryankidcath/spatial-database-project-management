/** Bunyi notifikasi in-app (Fase A) — Web Audio, tanpa file eksternal. */

export const NOTIFICATION_SOUND_ENABLED_KEY = "pm-notification-sound-v1-enabled";

const DEDUPE_TTL_MS = 15_000;
const MIN_PLAY_INTERVAL_MS = 400;

const recentKeys = new Map<string, number>();
let lastPlayAt = 0;
let audioContext: AudioContext | null = null;
let unlocked = false;

function pruneDedupe(): void {
  const now = Date.now();
  for (const [key, at] of recentKeys) {
    if (now - at > DEDUPE_TTL_MS) recentKeys.delete(key);
  }
}

function shouldPlay(dedupeKey: string): boolean {
  if (typeof window === "undefined") return false;
  if (document.visibilityState !== "visible") return false;
  if (!isNotificationSoundEnabled()) return false;

  const now = Date.now();
  if (now - lastPlayAt < MIN_PLAY_INTERVAL_MS) return false;

  pruneDedupe();
  if (recentKeys.has(dedupeKey)) return false;

  recentKeys.set(dedupeKey, now);
  lastPlayAt = now;
  return true;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(NOTIFICATION_SOUND_ENABLED_KEY);
    if (raw === "0" || raw === "false") return false;
  } catch {
    /* private mode */
  }
  return true;
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_SOUND_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Panggil sekali setelah interaksi user (autoplay policy). */
export async function unlockNotificationSound(): Promise<void> {
  if (unlocked) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    unlocked = true;
  } catch {
    /* ignore */
  }
}

function vibrateShort(): void {
  try {
    navigator.vibrate?.([40, 30, 40]);
  } catch {
    /* ignore */
  }
}

function playToneSequence(
  frequencies: number[],
  toneMs: number,
  gapMs: number,
  gainPeak: number
): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state === "suspended") return;

  let offset = ctx.currentTime;
  for (const freq of frequencies) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, offset);
    gain.gain.exponentialRampToValueAtTime(gainPeak, offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, offset + toneMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(offset);
    osc.stop(offset + toneMs / 1000 + 0.02);
    offset += (toneMs + gapMs) / 1000;
  }
}

export function playChatNotificationSound(messageId: string): void {
  if (!shouldPlay(`chat:${messageId}`)) return;
  playToneSequence([880, 1175], 90, 50, 0.12);
  vibrateShort();
}

export function playWorkspaceNotificationSound(notificationId: string): void {
  if (!shouldPlay(`workspace:${notificationId}`)) return;
  playToneSequence([660], 140, 0, 0.1);
  vibrateShort();
}
