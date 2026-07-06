"use client";

import { useState } from "react";
import {
  Building2,
  FolderKanban,
  MessageSquare,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { RUANG_KERJA_LABEL, ruangKerjaLc } from "@/lib/product-labels";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";
import type { ChatMentionOption } from "./chat-types";

type MenuItemProps = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

function SidebarMenuItem({
  icon,
  label,
  onClick,
  destructive,
  disabled,
}: MenuItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        "hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-50",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground"
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function SidebarAddMenuTrigger({ label }: { label: string }) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="outline"
      className="size-7 shrink-0"
      aria-label={label}
      title={label}
    >
      <Plus className="size-3.5" />
    </Button>
  );
}

export function SidebarUnifiedScopeActionsMenu({
  showOrgChat,
  canAddOrganization,
  canAddStaff,
  canAddMember,
  canAddProject,
  canDeleteProject,
  mentionOptions,
  disabled,
  onAddOrganization,
  onAddStaff,
  onAddMember,
  onAddProject,
  onDeleteProject,
}: {
  showOrgChat: boolean;
  canAddOrganization: boolean;
  canAddStaff: boolean;
  canAddMember: boolean;
  canAddProject: boolean;
  canDeleteProject: boolean;
  mentionOptions: ChatMentionOption[];
  disabled?: boolean;
  onAddOrganization: () => void;
  onAddStaff: () => void;
  onAddMember: () => void;
  onAddProject: () => void;
  onDeleteProject?: () => void;
}) {
  const { openOrganizationChat } = useWorkspaceRightPanel();
  const [open, setOpen] = useState(false);

  const hasOrgActions = showOrgChat || canAddOrganization;
  const hasWorkspaceActions =
    canAddStaff || canAddMember || canAddProject || canDeleteProject;

  if (!hasOrgActions && !hasWorkspaceActions) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            type="button"
            size="icon-xs"
            variant="outline"
            className="size-7 shrink-0"
            aria-label="Tambah atau kelola scope"
            title="Tambah atau kelola scope"
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      />
      <PopoverContent align="end" className="w-56 p-1">
        {canAddOrganization ? (
          <SidebarMenuItem
            icon={<Building2 />}
            label="Tambah organisasi"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAddOrganization();
            }}
          />
        ) : null}
        {showOrgChat ? (
          <SidebarMenuItem
            icon={<MessageSquare />}
            label="Obrolan organisasi"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              openOrganizationChat({ mentionOptions });
            }}
          />
        ) : null}
        {hasOrgActions && hasWorkspaceActions ? (
          <div className="my-1 border-t border-border" role="separator" />
        ) : null}
        {canAddProject ? (
          <SidebarMenuItem
            icon={<FolderKanban />}
            label={`Tambah ${RUANG_KERJA_LABEL}`}
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAddProject();
            }}
          />
        ) : null}
        {canAddStaff ? (
          <SidebarMenuItem
            icon={<Users />}
            label="Tambah tim inti"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAddStaff();
            }}
          />
        ) : null}
        {canAddMember ? (
          <SidebarMenuItem
            icon={<UserPlus />}
            label={`Tambah anggota ${ruangKerjaLc}`}
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAddMember();
            }}
          />
        ) : null}
        {canDeleteProject && onDeleteProject ? (
          <>
            {canAddStaff || canAddMember || canAddProject ? (
              <div className="my-1 border-t border-border" role="separator" />
            ) : null}
            <SidebarMenuItem
              icon={<Trash2 />}
              label={`Hapus ${ruangKerjaLc} aktif`}
              destructive
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onDeleteProject();
              }}
            />
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function SidebarOrganizationActionsMenu({
  showOrgChat,
  canAddOrganization,
  mentionOptions,
  disabled,
  onAddOrganization,
}: {
  showOrgChat: boolean;
  canAddOrganization: boolean;
  mentionOptions: ChatMentionOption[];
  disabled?: boolean;
  onAddOrganization: () => void;
}) {
  const { openOrganizationChat } = useWorkspaceRightPanel();
  const [open, setOpen] = useState(false);

  if (!showOrgChat && !canAddOrganization) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<SidebarAddMenuTrigger label="Aksi organisasi" />}
      />
      <PopoverContent align="end" className="w-56 p-1">
        {canAddOrganization ? (
          <SidebarMenuItem
            icon={<Building2 />}
            label="Tambah organisasi"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAddOrganization();
            }}
          />
        ) : null}
        {showOrgChat ? (
          <SidebarMenuItem
            icon={<MessageSquare />}
            label="Obrolan organisasi"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              openOrganizationChat({ mentionOptions });
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function SidebarWorkspaceActionsMenu({
  canAddStaff,
  canAddMember,
  canAddProject,
  disabled,
  onAddStaff,
  onAddMember,
  onAddProject,
}: {
  canAddStaff: boolean;
  canAddMember: boolean;
  canAddProject: boolean;
  disabled?: boolean;
  onAddStaff: () => void;
  onAddMember: () => void;
  onAddProject: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!canAddStaff && !canAddMember && !canAddProject) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <SidebarAddMenuTrigger label={`Tambah ${ruangKerjaLc} atau anggota`} />
        }
      />
      <PopoverContent align="end" className="w-56 p-1">
        {canAddStaff ? (
          <SidebarMenuItem
            icon={<Users />}
            label="Tambah tim inti"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAddStaff();
            }}
          />
        ) : null}
        {canAddMember ? (
          <SidebarMenuItem
            icon={<UserPlus />}
            label={`Tambah anggota ${ruangKerjaLc}`}
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAddMember();
            }}
          />
        ) : null}
        {canAddProject ? (
          <SidebarMenuItem
            icon={<FolderKanban />}
            label={`Tambah ${RUANG_KERJA_LABEL}`}
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAddProject();
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
