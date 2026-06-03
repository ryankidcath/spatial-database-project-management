import type { ChatAttachmentRef } from "@/app/chat-types";
import type { VirtualColumnRow } from "@/app/virtual-table-types";

/** Lampiran file kolom `file` pada payload baris (chat baris). */
export function fileAttachmentOptionsFromRowPayload(
  payload: Record<string, unknown> | undefined,
  columns: Pick<VirtualColumnRow, "slug" | "display_name" | "data_type">[]
): ChatAttachmentRef[] {
  if (!payload) return [];
  const out: ChatAttachmentRef[] = [];
  for (const col of columns) {
    if (col.data_type !== "file") continue;
    const val = payload[col.slug];
    if (typeof val === "string" && val.trim()) {
      out.push({ label: col.display_name, url: val.trim() });
    } else if (val && typeof val === "object" && "url" in val) {
      const url = String((val as { url?: unknown }).url ?? "").trim();
      if (url) out.push({ label: col.display_name, url });
    }
  }
  return out;
}
