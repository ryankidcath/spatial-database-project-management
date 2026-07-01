/** Kebijakan prefetch/background work — hemat data & baterai (PR-F, PR-G2). */

type NetworkInformationLike = {
  saveData?: boolean;
};

type BatteryManagerLike = {
  charging: boolean;
  level: number;
};

/** Batas warm-up per sesi workspace (PR-G2). */
const MAX_WARMUP_JOBS_PER_SESSION = 12;
const MAX_WARMUP_WALL_MS = 30_000;

let warmupJobsCompleted = 0;
let warmupSessionStartMs = 0;

export function resetWarmupSessionBudget(): void {
  warmupJobsCompleted = 0;
  warmupSessionStartMs = Date.now();
}

export function canRunWarmupJob(): boolean {
  if (warmupJobsCompleted >= MAX_WARMUP_JOBS_PER_SESSION) return false;
  if (
    warmupSessionStartMs > 0 &&
    Date.now() - warmupSessionStartMs > MAX_WARMUP_WALL_MS
  ) {
    return false;
  }
  return true;
}

export function recordWarmupJobCompleted(): void {
  warmupJobsCompleted += 1;
  if (!warmupSessionStartMs) warmupSessionStartMs = Date.now();
}

export function shouldAllowBackgroundPrefetch(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike })
    .connection;
  if (connection?.saveData) return false;
  return true;
}

export async function shouldAllowBackgroundPrefetchAsync(): Promise<boolean> {
  if (!shouldAllowBackgroundPrefetch()) return false;
  const getBattery = (
    navigator as Navigator & {
      getBattery?: () => Promise<BatteryManagerLike>;
    }
  ).getBattery;
  if (!getBattery) return true;
  try {
    const battery = await getBattery();
    if (!battery.charging && battery.level < 0.2) return false;
  } catch {
    /* API tidak tersedia */
  }
  return true;
}
