"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  LogOut,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import type { MobilePickerOrganization } from "./workspace-mobile-org-picker";
import type { MobilePickerProject } from "./workspace-mobile-project-picker";

type MemberPresenceRow = {
  userId: string;
  name: string;
  isOnline: boolean;
  lastSeenAt: string | null;
};

type ScopePanel = "menu" | "org" | "project";

type Props = {
  scopeTitle: string;
  showOrgSwitcher: boolean;
  organizations: MobilePickerOrganization[];
  projects: MobilePickerProject[];
  selectedOrganizationId: string | null;
  selectedProjectId: string | null;
  onSelectOrg: (organizationId: string) => void;
  onSelectProject: (projectId: string) => void;
  userEmail: string | null;
  userId: string | null;
  memberPresenceRows: MemberPresenceRow[];
  formatDateTime: (value: string | null) => string;
  signOutAction: () => void;
  disabled?: boolean;
};

export function WorkspaceMobileCompactHeader({
  scopeTitle,
  showOrgSwitcher,
  organizations,
  projects,
  selectedOrganizationId,
  selectedProjectId,
  onSelectOrg,
  onSelectProject,
  userEmail,
  userId,
  memberPresenceRows,
  formatDateTime,
  signOutAction,
  disabled = false,
}: Props) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scopePanel, setScopePanel] = useState<ScopePanel>("menu");
  const [projectPanelReturn, setProjectPanelReturn] =
    useState<"menu" | "org">("menu");

  useEffect(() => {
    if (!scopeOpen) {
      setScopePanel("menu");
      setProjectPanelReturn("menu");
    }
  }, [scopeOpen]);

  const openProjectPanel = () => {
    setProjectPanelReturn("menu");
    setScopePanel("project");
  };

  const openOrgPanel = () => {
    setScopePanel("org");
  };

  const handleSelectOrg = (orgId: string) => {
    onSelectOrg(orgId);
    setProjectPanelReturn("org");
    setScopePanel("project");
  };

  const handleSelectProject = (projectId: string) => {
    onSelectProject(projectId);
    setScopeOpen(false);
  };

  const backFromProject = () => {
    setScopePanel(projectPanelReturn);
  };

  const backFromOrg = () => {
    setScopePanel("menu");
  };

  const selectedOrgName =
    organizations.find((o) => o.id === selectedOrganizationId)?.name ?? null;

  const scopePanelContent = (() => {
    if (scopePanel === "org") {
      return (
        <>
          <div className="mb-2 flex items-center gap-1 border-b border-border px-1 pb-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Kembali"
              onClick={backFromOrg}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">
                Pilih organisasi
              </p>
            </div>
          </div>
          <ul className="max-h-[min(50vh,20rem)] space-y-1 overflow-auto">
            {organizations.length === 0 ? (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                Tidak ada organisasi.
              </li>
            ) : (
              organizations.map((org) => {
                const active = org.id === selectedOrganizationId;
                return (
                  <li key={org.id}>
                    <button
                      type="button"
                      data-testid="scope-popover-org"
                      onClick={() => handleSelectOrg(org.id)}
                      className={cn(
                        "flex w-full min-h-11 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-primary/10 font-medium text-foreground"
                          : "hover:bg-muted/60"
                      )}
                    >
                      <Building2
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{org.name}</span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </>
      );
    }

    if (scopePanel === "project") {
      return (
        <>
          <div className="mb-2 flex items-center gap-1 border-b border-border px-1 pb-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Kembali"
              onClick={backFromProject}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">
                Pilih proyek
              </p>
              {selectedOrgName ? (
                <p className="truncate text-xs text-muted-foreground">
                  {selectedOrgName}
                </p>
              ) : null}
            </div>
          </div>
          <ul className="max-h-[min(50vh,20rem)] space-y-1 overflow-auto">
            {projects.length === 0 ? (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                Tidak ada proyek di organisasi ini.
              </li>
            ) : (
              projects.map((project) => {
                const active = project.id === selectedProjectId;
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      data-testid="scope-popover-project"
                      onClick={() => handleSelectProject(project.id)}
                      className={cn(
                        "flex w-full min-h-11 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-primary/10 font-medium text-foreground"
                          : "hover:bg-muted/60"
                      )}
                    >
                      <FolderKanban
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {project.name}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </>
      );
    }

    return (
      <>
        <div className="mb-2 border-b border-border px-1 pb-2">
          <p className="text-xs font-semibold text-foreground">
            Scope workspace
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {scopeTitle}
          </p>
        </div>
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-start"
            onClick={openProjectPanel}
          >
            Ganti proyek
          </Button>
          {showOrgSwitcher ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full justify-start text-muted-foreground"
              onClick={openOrgPanel}
            >
              Ganti organisasi
            </Button>
          ) : null}
        </div>
      </>
    );
  })();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left",
                "transition-colors active:bg-muted/60"
              )}
              aria-label="Buka menu scope"
              disabled={disabled}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {scopeTitle}
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
          }
        />
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={4}
          className="w-[min(18rem,calc(100vw-2rem))] gap-0 p-2"
        >
          {scopePanelContent}
        </PopoverContent>
      </Popover>

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Menu lainnya"
              disabled={disabled}
            >
              <MoreHorizontal className="size-5" aria-hidden />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-[min(18rem,calc(100vw-2rem))] p-2">
          {selectedProjectId ? (
            <div className="mb-2 rounded-lg border border-border bg-muted/20 p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Users className="size-3.5 shrink-0 text-muted-foreground" />
                Online{" "}
                {memberPresenceRows.filter((m) => m.isOnline).length}
              </p>
              {memberPresenceRows.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Belum ada anggota project.
                </p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-auto">
                  {memberPresenceRows.slice(0, 12).map((u) => (
                    <li
                      key={u.userId}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {u.name}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {u.lastSeenAt
                            ? `terakhir aktif ${formatDateTime(u.lastSeenAt)}`
                            : "belum terdeteksi aktif"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          u.isOnline
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/40"
                        )}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-2">
            <span className="text-sm text-foreground">Tema</span>
            <ThemeToggle iconOnly />
          </div>

          {userEmail ? (
            <p className="truncate px-2 py-1 text-xs text-muted-foreground">
              {userEmail}
            </p>
          ) : null}

          <form
            action={signOutAction}
            className="mt-1 border-t border-border pt-2"
          >
            <button
              type="submit"
              className="flex w-full min-h-11 items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-4 shrink-0" />
              Keluar
            </button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
