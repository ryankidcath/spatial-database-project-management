"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";
import type { ChatMentionOption } from "./chat-types";
import { CHAT_RUANG_KERJA_LABEL } from "@/lib/product-labels";

export function SidebarOrganizationChatButton({
  mentionOptions,
  disabled,
}: {
  mentionOptions: ChatMentionOption[];
  disabled?: boolean;
}) {
  const { openOrganizationChat, isOrganizationChatOpen } =
    useWorkspaceRightPanel();
  const open = isOrganizationChatOpen();

  return (
    <Button
      type="button"
      size="icon-xs"
      variant={open ? "default" : "ghost"}
      disabled={disabled}
      className="h-7 w-7 shrink-0"
      title="Chat organisasi"
      aria-label="Chat organisasi"
      onClick={() => openOrganizationChat({ mentionOptions })}
    >
      <MessageSquare className="size-3.5" />
    </Button>
  );
}

export function SidebarProjectChatButton({
  projectId,
  mentionOptions,
  disabled,
  onBeforeOpen,
}: {
  projectId: string;
  mentionOptions: ChatMentionOption[];
  disabled?: boolean;
  onBeforeOpen?: () => void;
}) {
  const { openProjectChat, isProjectChatOpen } = useWorkspaceRightPanel();
  const open = isProjectChatOpen(projectId);

  return (
    <Button
      type="button"
      size="icon-xs"
      variant={open ? "default" : "ghost"}
      disabled={disabled}
      className="h-7 w-7 shrink-0 text-muted-foreground"
      title={CHAT_RUANG_KERJA_LABEL}
      aria-label={CHAT_RUANG_KERJA_LABEL}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onBeforeOpen?.();
        openProjectChat({ projectId, mentionOptions });
      }}
    >
      <MessageSquare className="size-3.5" />
    </Button>
  );
}
