"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  Building2,
  ChevronDown,
  FolderKanban,
  Pin,
  PinOff,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  isProjectPinned,
  orderProjectsForPopover,
  togglePinnedProject,
} from "@/lib/workspace-scope-preference";
import { pilihRuangKerja, ruangKerjaLc } from "@/lib/product-labels";
import type { ChatMentionOption } from "./chat-types";
import { ProjectChatUnreadBadge } from "./virtual-table-chat-unread-context";
import { SidebarUnifiedScopeActionsMenu } from "./workspace-sidebar-menus";

const SEARCH_THRESHOLD = 5;

export type DesktopScopeOrganization = {
  id: string;
  name: string;
};

export type DesktopScopeProject = {
  id: string;
  name: string;
  organization_id: string;
};

type Props = {
  organizations: DesktopScopeOrganization[];
  projects: DesktopScopeProject[];
  selectedOrganizationId: string | null;
  selectedProjectId: string | null;
  pinnedProjectIds: string[];
  recentProjectIds: string[];
  onPinnedChange: (pinnedIds: string[]) => void;
  disabled?: boolean;
  onSelectOrganization: (organizationId: string) => void;
  onSelectProject: (projectId: string) => void;
  showOrgChat: boolean;
  canAddOrganization: boolean;
  canAddStaff: boolean;
  canAddMember: boolean;
  canAddProject: boolean;
  canDeleteProject: boolean;
  mentionOptions: ChatMentionOption[];
  onAddOrganization: () => void;
  onAddStaff: () => void;
  onAddMember: () => void;
  onAddProject: () => void;
  onDeleteProject?: () => void;
};

function ScopeSwitcherRow({
  icon,
  label,
  placeholder,
  disabled,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  icon: React.ReactNode;
  label: string;
  placeholder: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      {...props}
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-sidebar-border/80",
        "bg-sidebar-accent/20 px-2.5 text-sm transition-colors",
        "hover:bg-sidebar-accent/50 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left",
          label ? "font-medium text-sidebar-foreground" : "text-muted-foreground"
        )}
      >
        {label || placeholder}
      </span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function ScopeSearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative px-1 pb-2">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-sm"
        autoFocus
      />
    </div>
  );
}

function PopoverSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-0.5 pt-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function ProjectPopoverRow({
  project,
  active,
  showPin,
  pinned,
  onSelect,
  onTogglePin,
}: {
  project: DesktopScopeProject;
  active: boolean;
  showPin: boolean;
  pinned: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        data-testid="desktop-scope-project-option"
        onClick={onSelect}
        className={cn(
          "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "hover:bg-muted/70"
        )}
      >
        <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        <ProjectChatUnreadBadge projectId={project.id} />
      </button>
      {showPin ? (
        <button
          type="button"
          title={pinned ? "Lepas pin" : "Pin ruang kerja"}
          aria-label={pinned ? "Lepas pin" : "Pin ruang kerja"}
          data-testid="desktop-scope-project-pin"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70",
            pinned && "text-foreground"
          )}
        >
          {pinned ? (
            <PinOff className="size-3.5" aria-hidden />
          ) : (
            <Pin className="size-3.5" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}

export function WorkspaceDesktopScopeSwitcher({
  organizations,
  projects,
  selectedOrganizationId,
  selectedProjectId,
  pinnedProjectIds,
  recentProjectIds,
  onPinnedChange,
  disabled = false,
  onSelectOrganization,
  onSelectProject,
  showOrgChat,
  canAddOrganization,
  canAddStaff,
  canAddMember,
  canAddProject,
  canDeleteProject,
  mentionOptions,
  onAddOrganization,
  onAddStaff,
  onAddMember,
  onAddProject,
  onDeleteProject,
}: Props) {
  const [orgOpen, setOrgOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");

  useEffect(() => {
    if (!orgOpen) setOrgSearch("");
  }, [orgOpen]);

  useEffect(() => {
    if (!projectOpen) setProjectSearch("");
  }, [projectOpen]);

  const selectedOrgName =
    organizations.find((o) => o.id === selectedOrganizationId)?.name ?? "";

  const selectedProjectName =
    projects.find((p) => p.id === selectedProjectId)?.name ?? "";

  const filteredOrganizations = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((o) => o.name.toLowerCase().includes(q));
  }, [organizations, orgSearch]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const projectSections = useMemo(() => {
    const ids = filteredProjects.map((p) => p.id);
    if (projectSearch.trim()) {
      return { pinned: [] as string[], recent: [] as string[], rest: ids };
    }
    return orderProjectsForPopover(ids, pinnedProjectIds, recentProjectIds);
  }, [filteredProjects, pinnedProjectIds, recentProjectIds, projectSearch]);

  const renderProjectRows = (ids: string[], showPin: boolean) =>
    ids.map((id) => {
      const project = projectById.get(id);
      if (!project) return null;
      const active = project.id === selectedProjectId;
      const pinned = isProjectPinned(project.id);
      return (
        <li key={project.id}>
          <ProjectPopoverRow
            project={project}
            active={active}
            showPin={showPin}
            pinned={pinned}
            onSelect={() => {
              onSelectProject(project.id);
              setProjectOpen(false);
            }}
            onTogglePin={() => onPinnedChange(togglePinnedProject(project.id))}
          />
        </li>
      );
    });

  const hasSections =
    !projectSearch.trim() &&
    (projectSections.pinned.length > 0 || projectSections.recent.length > 0);

  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Popover open={orgOpen} onOpenChange={setOrgOpen}>
          <PopoverTrigger
            render={(triggerProps) => (
              <ScopeSwitcherRow
                {...triggerProps}
                data-testid="desktop-scope-org-trigger"
                icon={<Building2 />}
                label={selectedOrgName}
                placeholder="Pilih organisasi"
                disabled={disabled || organizations.length === 0}
              />
            )}
          />
          <PopoverContent align="start" className="gap-0 p-1">
            {organizations.length > SEARCH_THRESHOLD ? (
              <ScopeSearchField
                value={orgSearch}
                onChange={setOrgSearch}
                placeholder="Cari organisasi…"
              />
            ) : null}
            <ul className="max-h-[min(50vh,16rem)] space-y-0.5 overflow-auto">
              {filteredOrganizations.length === 0 ? (
                <li className="px-2 py-3 text-xs text-muted-foreground">
                  {orgSearch.trim()
                    ? "Tidak ada organisasi yang cocok."
                    : "Tidak ada organisasi."}
                </li>
              ) : (
                filteredOrganizations.map((org) => {
                  const active = org.id === selectedOrganizationId;
                  return (
                    <li key={org.id}>
                      <button
                        type="button"
                        data-testid="desktop-scope-org-option"
                        onClick={() => {
                          onSelectOrganization(org.id);
                          setOrgOpen(false);
                        }}
                        className={cn(
                          "flex w-full min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "hover:bg-muted/70"
                        )}
                      >
                        <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{org.name}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </PopoverContent>
        </Popover>

        <Popover open={projectOpen} onOpenChange={setProjectOpen}>
          <PopoverTrigger
            render={(triggerProps) => (
              <ScopeSwitcherRow
                {...triggerProps}
                data-testid="desktop-scope-project-trigger"
                icon={<FolderKanban />}
                label={selectedProjectName}
                placeholder={pilihRuangKerja()}
                disabled={
                  disabled || !selectedOrganizationId || projects.length === 0
                }
              />
            )}
          />
          <PopoverContent align="start" className="gap-0 p-1">
            {projects.length > SEARCH_THRESHOLD ? (
              <ScopeSearchField
                value={projectSearch}
                onChange={setProjectSearch}
                placeholder={`Cari ${ruangKerjaLc}…`}
              />
            ) : null}
            <ul className="max-h-[min(50vh,16rem)] space-y-0.5 overflow-auto">
              {filteredProjects.length === 0 ? (
                <li className="px-2 py-3 text-xs text-muted-foreground">
                  {projectSearch.trim()
                    ? `Tidak ada ${ruangKerjaLc} yang cocok.`
                    : `Tidak ada ${ruangKerjaLc} di organisasi ini.`}
                </li>
              ) : (
                <>
                  {hasSections && projectSections.pinned.length > 0 ? (
                    <>
                      <li>
                        <PopoverSectionLabel>Pin</PopoverSectionLabel>
                      </li>
                      {renderProjectRows(projectSections.pinned, true)}
                    </>
                  ) : null}
                  {hasSections && projectSections.recent.length > 0 ? (
                    <>
                      <li>
                        <PopoverSectionLabel>Terakhir dibuka</PopoverSectionLabel>
                      </li>
                      {renderProjectRows(projectSections.recent, true)}
                    </>
                  ) : null}
                  {hasSections &&
                  (projectSections.pinned.length > 0 ||
                    projectSections.recent.length > 0) &&
                  projectSections.rest.length > 0 ? (
                    <li className="my-1 border-t border-border" role="separator" />
                  ) : null}
                  {hasSections && projectSections.rest.length > 0 ? (
                    <li>
                      <PopoverSectionLabel>Semua {ruangKerjaLc}</PopoverSectionLabel>
                    </li>
                  ) : null}
                  {renderProjectRows(
                    hasSections ? projectSections.rest : filteredProjects.map((p) => p.id),
                    !projectSearch.trim()
                  )}
                </>
              )}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      <SidebarUnifiedScopeActionsMenu
        showOrgChat={showOrgChat}
        canAddOrganization={canAddOrganization}
        canAddStaff={canAddStaff}
        canAddMember={canAddMember}
        canAddProject={canAddProject}
        canDeleteProject={canDeleteProject}
        mentionOptions={mentionOptions}
        disabled={disabled}
        onAddOrganization={onAddOrganization}
        onAddStaff={onAddStaff}
        onAddMember={onAddMember}
        onAddProject={onAddProject}
        onDeleteProject={onDeleteProject}
      />
    </div>
  );
}
