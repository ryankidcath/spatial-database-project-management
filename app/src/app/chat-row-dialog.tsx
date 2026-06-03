"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RowChatContextPath } from "@/components/row-chat-context-path";
import { rowLabelFromPath } from "@/lib/chat-row-context";
import { dispatchChatUnreadInvalidate } from "@/lib/chat-unread-invalidate";
import { useVirtualTableChatUnread } from "./virtual-table-chat-unread-context";
import { ChatPanel } from "./chat-panel";
import type { ChatAttachmentRef, ChatMentionOption } from "./chat-types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  projectId: string | null;
  virtualRowId: string;
  pathSegments: string[];
  userId: string;
  userEmail?: string | null;
  authorNameByUserId: Map<string, string>;
  mentionOptions?: ChatMentionOption[];
  fileAttachmentOptions?: ChatAttachmentRef[];
  isOrgAdmin?: boolean;
};

export function ChatRowDialog({
  open,
  onOpenChange,
  organizationId,
  projectId,
  virtualRowId,
  pathSegments,
  userId,
  userEmail = null,
  authorNameByUserId,
  mentionOptions = [],
  fileAttachmentOptions = [],
  isOrgAdmin = false,
}: Props) {
  const rowLabel = rowLabelFromPath(pathSegments);
  const [unreadCount, setUnreadCount] = useState(0);
  const { refresh: refreshTableChatUnread } = useVirtualTableChatUnread();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          refreshTableChatUnread();
          dispatchChatUnreadInvalidate();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-6 py-4 pr-12">
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="min-w-0 font-normal leading-snug">
              <RowChatContextPath segments={pathSegments} />
            </DialogTitle>
            {unreadCount > 0 ? (
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                {unreadCount} baru
              </span>
            ) : null}
          </div>
        </DialogHeader>
        {open ? (
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
            <ChatPanel
              scopeType="virtual_row"
              organizationId={organizationId}
              projectId={projectId}
              virtualRowId={virtualRowId}
              embedded
              title={rowLabel}
              userId={userId}
              userEmail={userEmail}
              authorNameByUserId={authorNameByUserId}
              mentionOptions={mentionOptions}
              fileAttachmentOptions={fileAttachmentOptions}
              isOrgAdmin={isOrgAdmin}
              onUnreadCountChange={setUnreadCount}
              onInvalidateTableUnread={refreshTableChatUnread}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
