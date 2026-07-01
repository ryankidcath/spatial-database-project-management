/** Kebijakan prefetch/background work — hemat data & baterai (PR-F). */

type NetworkInformationLike = {
  saveData?: boolean;
};

type BatteryManagerLike = {
  charging: boolean;
  level: number;
};

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
