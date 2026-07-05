import type { VirtualViewConfig } from "@/app/virtual-table-types";
import { normalizeVirtualViewConfig } from "@/lib/virtual-view-config";

export type StoredViewSession = {
  activeViewId: string | null;
  config: VirtualViewConfig;
};

export function viewSessionStorageKey(tableId: string): string {
  return `vtable-view-session:${tableId}`;
}

export function loadVirtualTableViewSession(
  tableId: string
): StoredViewSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(viewSessionStorageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredViewSession;
    if (!parsed || typeof parsed !== "object" || !parsed.config) return null;
    return {
      activeViewId: parsed.activeViewId ?? null,
      config: normalizeVirtualViewConfig(parsed.config),
    };
  } catch {
    return null;
  }
}

export function viewSessionFilters(tableId: string): StoredViewSession["config"]["filters"] {
  return loadVirtualTableViewSession(tableId)?.config.filters ?? [];
}

export function saveVirtualTableViewSession(
  tableId: string,
  session: StoredViewSession
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      viewSessionStorageKey(tableId),
      JSON.stringify({
        activeViewId: session.activeViewId ?? null,
        config: normalizeVirtualViewConfig(session.config),
      })
    );
  } catch {
    /* quota */
  }
}
