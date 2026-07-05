import {
  readDurableJsonRecord,
  writeDurableJsonRecord,
} from "@/lib/client-durable-storage";
import {
  isVirtualTableLayoutType,
  type VirtualTableLayoutType,
} from "@/lib/virtual-table-layout-types";

/** localStorage map: `table_id` → layout terakhir (Fase 2 navigasi). */
export const VIRTUAL_TABLE_LAYOUT_STORAGE_KEY = "spatial-pm-table-view-v1";

type LayoutPreferenceEntry = {
  layout: VirtualTableLayoutType;
  updatedAt: number;
};

function readAllPreferences(): Record<string, LayoutPreferenceEntry> {
  return readDurableJsonRecord<LayoutPreferenceEntry>(
    VIRTUAL_TABLE_LAYOUT_STORAGE_KEY,
    { ttlMs: 0 }
  );
}

export function readTableLayoutPreference(
  tableId: string
): VirtualTableLayoutType {
  const entry = readAllPreferences()[tableId];
  if (entry?.layout && isVirtualTableLayoutType(entry.layout)) {
    return entry.layout;
  }
  return "grid";
}

export function writeTableLayoutPreference(
  tableId: string,
  layout: VirtualTableLayoutType
): void {
  const all = readAllPreferences();
  all[tableId] = { layout, updatedAt: Date.now() };
  writeDurableJsonRecord(VIRTUAL_TABLE_LAYOUT_STORAGE_KEY, all);
}
