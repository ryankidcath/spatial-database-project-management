"use client";

import { ArrowLeft, ChevronRight, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MobilePickerOrganization = {
  id: string;
  name: string;
  slug?: string | null;
};

export type MobilePickerProject = {
  id: string;
  name: string;
  key?: string | null;
  organization_id: string;
};

type Props = {
  organization: MobilePickerOrganization | null;
  projects: MobilePickerProject[];
  onSelectProject: (projectId: string) => void;
  onBackToOrganizations: () => void;
  showBackToOrg: boolean;
};

export function WorkspaceMobileProjectPicker({
  organization,
  projects,
  onSelectProject,
  onBackToOrganizations,
  showBackToOrg,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border px-4 py-4">
        {showBackToOrg ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 mb-2 h-11 gap-1 px-2 text-muted-foreground"
            onClick={onBackToOrganizations}
          >
            <ArrowLeft className="size-4" />
            Organisasi
          </Button>
        ) : null}
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Langkah 2 dari 2
        </p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          Pilih project
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {organization
            ? `Project di ${organization.name}`
            : "Pilih project untuk melanjutkan."}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {projects.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Tidak ada project di organisasi ini.
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectProject(p.id)}
                  className={cn(
                    "flex w-full min-h-[4.5rem] items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm",
                    "transition-colors hover:bg-muted/40 active:bg-muted/60"
                  )}
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted"
                    aria-hidden
                  >
                    <FolderKanban className="size-5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-foreground">
                      {p.name}
                    </span>
                    {p.key?.trim() ? (
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {p.key}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
