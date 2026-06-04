"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";
import type { ChatMentionOption } from "./chat-types";
import { ProjectChatUnreadBadge } from "./virtual-table-chat-unread-context";

type Props = {
  hasOrgStaffAccess: boolean;
  selectedProjectId: string | null;
  mentionOptions: ChatMentionOption[];
  disabled?: boolean;
};

/** Chat org/proyek dari header workspace mobile (bukan sidebar). */
export function WorkspaceMobileHeaderChat({
  hasOrgStaffAccess,
  selectedProjectId,
  mentionOptions,
  disabled,
}: Props) {
  const {
    openOrganizationChat,
    openProjectChat,
    isOrganizationChatOpen,
    isProjectChatOpen,
  } = useWorkspaceRightPanel();

  if (!hasOrgStaffAccess && !selectedProjectId) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {hasOrgStaffAccess ? (
        <Button
          type="button"
          variant={isOrganizationChatOpen() ? "default" : "outline"}
          size="sm"
          disabled={disabled}
          className="h-10 gap-1.5 px-2.5 text-xs"
          aria-label="Chat organisasi"
          onClick={() => openOrganizationChat({ mentionOptions })}
        >
          <MessageSquare className="size-4 shrink-0" aria-hidden />
          <span className="hidden min-[360px]:inline">Org</span>
        </Button>
      ) : null}
      {selectedProjectId ? (
        <Button
          type="button"
          variant={
            isProjectChatOpen(selectedProjectId) ? "default" : "outline"
          }
          size="sm"
          disabled={disabled}
          className="h-10 gap-1.5 px-2.5 text-xs"
          aria-label="Chat proyek"
          onClick={() =>
            openProjectChat({
              projectId: selectedProjectId,
              mentionOptions,
            })
          }
        >
          <MessageSquare className="size-4 shrink-0" aria-hidden />
          <span className="hidden min-[360px]:inline">Proyek</span>
          <ProjectChatUnreadBadge
            projectId={selectedProjectId}
            className="!ml-0"
          />
        </Button>
      ) : null}
    </div>
  );
}
