/** Antrian warm-up idle — prefetch cache tanpa blocking UI (PR-G2). */

import {
  canRunWarmupJob,
  recordWarmupJobCompleted,
  shouldAllowBackgroundPrefetchAsync,
} from "@/lib/client-background-cache-policy";

export type WarmupJob = {
  id: string;
  priority: number;
  run: () => Promise<void>;
};

const IDLE_TIMEOUT_MS = 4000;
const IDLE_FALLBACK_MS = 300;

let queue: WarmupJob[] = [];
let generation = 0;
let draining = false;
let visibilityListener: (() => void) | null = null;

function sortQueue(jobs: WarmupJob[]): WarmupJob[] {
  const byId = new Map<string, WarmupJob>();
  for (const job of jobs) {
    const existing = byId.get(job.id);
    if (!existing || job.priority < existing.priority) {
      byId.set(job.id, job);
    }
  }
  return [...byId.values()].sort((a, b) => a.priority - b.priority);
}

function scheduleIdle(run: () => void): () => void {
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(id);
  }
  const timer = window.setTimeout(run, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(timer);
}

function ensureVisibilityListener(gen: number): void {
  if (visibilityListener || typeof document === "undefined") return;
  visibilityListener = () => {
    if (document.visibilityState === "visible") {
      void drainQueue(gen);
    }
  };
  document.addEventListener("visibilitychange", visibilityListener);
}

function removeVisibilityListener(): void {
  if (!visibilityListener) return;
  document.removeEventListener("visibilitychange", visibilityListener);
  visibilityListener = null;
}

async function drainQueue(gen: number): Promise<void> {
  if (gen !== generation || draining) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }
  if (!(await shouldAllowBackgroundPrefetchAsync())) return;

  const job = queue.shift();
  if (!job) {
    removeVisibilityListener();
    return;
  }

  if (!canRunWarmupJob()) {
    queue = [];
    removeVisibilityListener();
    return;
  }

  draining = true;
  try {
    await job.run();
    recordWarmupJobCompleted();
  } catch {
    /* prefetch best-effort */
  } finally {
    draining = false;
  }

  if (gen !== generation || queue.length === 0) {
    if (queue.length === 0) removeVisibilityListener();
    return;
  }

  scheduleIdle(() => {
    void drainQueue(gen);
  });
}

/** Jadwalkan job warm-up; berjalan di idle selama app visible (tab/halaman apa pun). */
export function enqueueWarmupJobs(jobs: WarmupJob[]): () => void {
  if (typeof window === "undefined") return () => {};

  generation += 1;
  const gen = generation;
  queue = sortQueue(jobs);
  draining = false;

  ensureVisibilityListener(gen);
  scheduleIdle(() => {
    void drainQueue(gen);
  });

  return () => {
    if (gen === generation) {
      queue = [];
      generation += 1;
      removeVisibilityListener();
    }
  };
}
