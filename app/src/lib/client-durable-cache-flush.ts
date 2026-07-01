import { flushActivityLogsMemoryToStorage } from "@/lib/activity-logs-cache";
import { flushChatInboxMemoryToStorage } from "@/lib/chat-inbox-cache";
import { flushChatRoomMemoryToStorage } from "@/lib/chat-room-cache";
import { flushVirtualTableMobileRowsMemoryToStorage } from "@/lib/virtual-table-mobile-rows-cache";
import { flushVirtualTableRowsMemoryToStorage } from "@/lib/virtual-table-rows-cache";

let flushInFlight: Promise<void> | null = null;

/** F1 — persist snapshot terbaru ke localStorage / IndexedDB saat app di-background. */
export function flushDurableCachesOnBackground(): Promise<void> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    flushChatInboxMemoryToStorage();
    await Promise.all([
      flushChatRoomMemoryToStorage(),
      flushVirtualTableMobileRowsMemoryToStorage(),
      flushVirtualTableRowsMemoryToStorage(),
      flushActivityLogsMemoryToStorage(),
    ]);
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}
