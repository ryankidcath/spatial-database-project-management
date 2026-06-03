"use client";

import { cn } from "@/lib/utils";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";
import { VirtualTableChatUnreadBadge } from "./virtual-table-chat-unread-context";
import type { VirtualTableRow } from "./virtual-table-types";

type Props = {
  table: VirtualTableRow;
  activeVirtualTableSlug: string | null;
  onSelect: () => void;
};

/** Baris tabel di sidebar: buka overlay; highlight jika overlay atau chat tabel aktif. */
export function SidebarVirtualTableItem({
  table,
  activeVirtualTableSlug,
  onSelect,
}: Props) {
  const { isTableChatOpen } = useWorkspaceRightPanel();
  const overlayOpen = activeVirtualTableSlug === table.slug;
  const tableChatOpen = isTableChatOpen(table.id);

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors",
        overlayOpen && "bg-primary/10 font-medium text-primary",
        tableChatOpen &&
          !overlayOpen &&
          "bg-primary/5 font-medium text-primary ring-1 ring-inset ring-primary/30",
        !overlayOpen &&
          !tableChatOpen &&
          "text-foreground hover:bg-muted"
      )}
      onClick={onSelect}
      title={
        tableChatOpen && !overlayOpen
          ? `${table.display_name} — chat tabel terbuka di panel kanan`
          : table.display_name
      }
    >
      <span className="min-w-0 truncate">
        {table.icon ? `${table.icon} ` : ""}
        {table.display_name}
      </span>
      <VirtualTableChatUnreadBadge tableId={table.id} />
    </button>
  );
}
