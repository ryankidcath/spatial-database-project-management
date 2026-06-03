import { CHAT_PATH_SEGMENTS_PROP } from "@/lib/chat-row-context";
import type { VirtualColumnDataType } from "@/app/virtual-table-types";

export type VirtualColumnForMapPopup = {
  slug: string;
  display_name: string;
  data_type: VirtualColumnDataType;
  position: number;
};

export function formatVirtualTableValueForMapPopup(
  value: unknown,
  dataType: VirtualColumnDataType,
  relationLabels: Record<string, string>,
  memberNameByUserId: Map<string, string>
): string {
  if (value == null || value === "") return "";
  switch (dataType) {
    case "checkbox":
      return value === true ? "Ya" : "Tidak";
    case "number":
      return String(value);
    case "date":
      return String(value).slice(0, 10);
    case "user": {
      const name = memberNameByUserId.get(String(value));
      return name ?? String(value).slice(0, 8);
    }
    case "relation": {
      const ids = Array.isArray(value)
        ? (value as unknown[]).map(String)
        : [String(value)];
      return ids
        .filter((id) => id.trim())
        .map((id) => relationLabels[id] ?? id.slice(0, 8))
        .join(", ");
    }
    case "geometry":
      return "(geometri)";
    case "file":
      return "(berkas)";
    default:
      return String(value);
  }
}

/** Judul popup: kolom teks/angka pertama (urut posisi) yang terisi, lalu relasi, lalu id singkat. */
export function pickMapRowTitle(
  payload: Record<string, unknown>,
  columns: VirtualColumnForMapPopup[],
  relationLabels: Record<string, string>,
  rowId: string
): string {
  const sorted = [...columns].sort((a, b) => a.position - b.position);
  for (const col of sorted) {
    if (col.data_type === "geometry" || col.data_type === "relation") continue;
    const val = payload[col.slug];
    if (val == null || val === "") continue;
    return String(val);
  }
  for (const col of sorted) {
    if (col.data_type !== "relation") continue;
    const val = payload[col.slug];
    if (val == null || val === "") continue;
    const label = formatVirtualTableValueForMapPopup(
      val,
      col.data_type,
      relationLabels,
      new Map()
    );
    if (label) return label;
  }
  return rowId.slice(0, 8);
}

/** Properti untuk popup peta — kunci = nama tampilan kolom; hanya kolom yang terisi. */
export function buildVirtualTableMapPopupProperties(
  tableDisplayName: string,
  columns: VirtualColumnForMapPopup[],
  payload: Record<string, unknown>,
  relationLabels: Record<string, string>,
  memberNameByUserId: Map<string, string>,
  options?: {
    skipGeometrySlug?: string;
    rowTitle?: string;
    virtualRowId?: string;
    projectName?: string | null;
    chatPathSegments?: string[];
  }
): Record<string, string> {
  const sorted = [...columns].sort((a, b) => a.position - b.position);
  const out: Record<string, string> = {
    Tabel: tableDisplayName,
  };
  if (options?.rowTitle) {
    out._popup_row_title = options.rowTitle;
  }
  if (options?.virtualRowId) {
    out._virtual_row_id = options.virtualRowId;
  }
  if (options?.projectName?.trim()) {
    out._popup_project_name = options.projectName.trim();
  }
  if (options?.chatPathSegments && options.chatPathSegments.length > 0) {
    out[CHAT_PATH_SEGMENTS_PROP] = JSON.stringify(options.chatPathSegments);
  }

  for (const col of sorted) {
    if (col.data_type === "geometry") {
      if (options?.skipGeometrySlug && col.slug === options.skipGeometrySlug) {
        continue;
      }
      const geo = payload[col.slug];
      if (geo != null && geo !== "" && typeof geo === "object") {
        out[col.display_name] = "(geometri)";
      }
      continue;
    }

    const val = payload[col.slug];
    if (val == null || val === "") continue;

    const formatted = formatVirtualTableValueForMapPopup(
      val,
      col.data_type,
      relationLabels,
      memberNameByUserId
    );
    if (formatted) {
      out[col.display_name] = formatted;
    }
  }

  return out;
}

/** Kumpulkan ID baris relasi dari payload beberapa baris. */
export function collectRelationIdsFromVirtualPayloads(
  rows: { payload: Record<string, unknown> | null }[],
  columns: VirtualColumnForMapPopup[]
): string[] {
  const relationCols = columns.filter((c) => c.data_type === "relation");
  if (relationCols.length === 0) return [];

  const ids = new Set<string>();
  for (const row of rows) {
    const payload = row.payload ?? {};
    for (const col of relationCols) {
      const val = payload[col.slug];
      if (typeof val === "string" && val.trim()) ids.add(val.trim());
      if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === "string" && v.trim()) ids.add(v.trim());
        }
      }
    }
  }
  return [...ids];
}
