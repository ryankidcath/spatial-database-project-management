"use client";

import { FolderKanban, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { ruangKerjaLc } from "@/lib/product-labels";
import { ProjectChatUnreadBadge } from "./virtual-table-chat-unread-context";
import type { DesktopScopeProject } from "./workspace-desktop-scope-switcher";

type Props = {
  projects: DesktopScopeProject[];
  projectIds: string[];
  pinnedIds: string[];
  selectedProjectId: string | null;
  disabled?: boolean;
  onSelectProject: (projectId: string) => void;
};

export function WorkspaceScopeQuickAccess({
  projects,
  projectIds,
  pinnedIds,
  selectedProjectId,
  disabled = false,
  onSelectProject,
}: Props) {
  if (projectIds.length === 0) return null;

  const pinnedSet = new Set(pinnedIds);
  const byId = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="mt-3 space-y-1">
      <p className="px-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        Pin &amp; terakhir dibuka
      </p>
      <ul className="space-y-0.5">
        {projectIds.map((id) => {
          const project = byId.get(id);
          if (!project) return null;
          const active = id === selectedProjectId;
          const isPinned = pinnedSet.has(id);
          return (
            <li key={id}>
              <button
                type="button"
                data-testid="scope-quick-access-project"
                disabled={disabled}
                onClick={() => onSelectProject(id)}
                className={cn(
                  "flex w-full min-h-8 items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  disabled && "pointer-events-none opacity-50"
                )}
              >
                {isPinned ? (
                  <Pin
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                ) : (
                  <FolderKanban
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <ProjectChatUnreadBadge projectId={id} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-0.5 text-[0.65rem] text-muted-foreground">
        Pin dari popover {ruangKerjaLc}.
      </p>
    </div>
  );
}
