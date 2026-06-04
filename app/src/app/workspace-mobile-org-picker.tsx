"use client";

import { Building2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobilePickerOrganization = {
  id: string;
  name: string;
  slug?: string | null;
};

type Props = {
  organizations: MobilePickerOrganization[];
  onSelectOrg: (organizationId: string) => void;
  userEmail?: string | null;
};

export function WorkspaceMobileOrgPicker({
  organizations,
  onSelectOrg,
  userEmail,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Langkah 1 dari 2
        </p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          Pilih organisasi
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pilih organisasi yang ingin Anda kerjakan.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {organizations.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Tidak ada organisasi yang dapat diakses.
          </p>
        ) : (
          <ul className="space-y-2">
            {organizations.map((org) => (
              <li key={org.id}>
                <button
                  type="button"
                  onClick={() => onSelectOrg(org.id)}
                  className={cn(
                    "flex w-full min-h-[4.5rem] items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm",
                    "transition-colors hover:bg-muted/40 active:bg-muted/60"
                  )}
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted"
                    aria-hidden
                  >
                    <Building2 className="size-5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-foreground">
                      {org.name}
                    </span>
                    {org.slug?.trim() ? (
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {org.slug}
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

      {userEmail ? (
        <footer className="shrink-0 border-t border-border px-4 py-3 text-center text-xs text-muted-foreground">
          Masuk sebagai {userEmail}
        </footer>
      ) : null}
    </div>
  );
}
