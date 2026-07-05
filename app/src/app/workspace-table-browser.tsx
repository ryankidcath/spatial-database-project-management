"use client";

import { useMemo, useState } from "react";
import { Search, Table2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { WORKSPACE_TAB_LIST_HEADER_CLASS } from "./workspace-tab-list-header";
import {
  useWorkspaceCollapsibleRail,
  WorkspaceCollapsibleRailShell,
  WorkspaceRailToggleButton,
} from "./workspace-collapsible-rail";
import { VirtualTableView } from "./virtual-table-view";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";

const EMPTY_COLUMNS: VirtualColumnRow[] = [];

type Props = {
  /** Tabel level organisasi (hanya untuk tim inti). */
  orgTables: VirtualTableRow[];
  /** Tabel level ruang kerja aktif. */
  projectTables: VirtualTableRow[];
  ruangKerjaLabel: string;
  virtualColumnsByTableId: Map<string, VirtualColumnRow[]>;
  projectId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  userId: string | null;
  isOrgAdmin: boolean;
  projectsForMention: { id: string; name: string; key?: string }[];
  memberNameByUserId: Map<string, string>;
  allVirtualTables: VirtualTableRow[];
  /** Slug tabel yang difokuskan (dikontrol dari luar: klik sidebar/aktivitas). */
  selectedSlug: string | null;
  onSelectSlug: (slug: string) => void;
  onActivityChange?: () => void;
};

/**
 * Tab Tabel (desktop): tampilan master–detail seperti tab Chat. Rail kiri berisi
 * daftar tabel (dengan pencarian), panel kanan menampilkan tabel terpilih yang
 * mengisi tinggi penuh dengan scroll internal — tanpa card/wrapper.
 */
export function WorkspaceTableBrowser({
  orgTables,
  projectTables,
  ruangKerjaLabel,
  virtualColumnsByTableId,
  projectId,
  organizationId,
  organizationName,
  userId,
  isOrgAdmin,
  projectsForMention,
  memberNameByUserId,
  allVirtualTables,
  selectedSlug,
  onSelectSlug,
  onActivityChange,
}: Props) {
  const [search, setSearch] = useState("");
  const rail = useWorkspaceCollapsibleRail("Data");

  // Ruang kerja lebih dulu, lalu organisasi (menentukan default seleksi).
  const orderedTables = useMemo(
    () => [...projectTables, ...orgTables],
    [projectTables, orgTables]
  );

  // Seleksi efektif dihitung saat render: fallback ke tabel pertama bila belum
  // memilih atau bila tabel aktif hilang dari scope (hindari setState di effect).
  const effectiveSlug =
    selectedSlug && orderedTables.some((t) => t.slug === selectedSlug)
      ? selectedSlug
      : orderedTables[0]?.slug ?? null;

  const query = search.trim().toLowerCase();
  const matches = (t: VirtualTableRow) =>
    query.length === 0 ||
    t.display_name.toLowerCase().includes(query) ||
    (t.description ?? "").toLowerCase().includes(query);

  const filteredProject = projectTables.filter(matches);
  const filteredOrg = orgTables.filter(matches);
  const hasAnyMatch = filteredProject.length > 0 || filteredOrg.length > 0;

  const selected = orderedTables.find((t) => t.slug === effectiveSlug) ?? null;

  const renderItem = (t: VirtualTableRow) => {
    const active = t.slug === effectiveSlug;
    return (
      <li key={t.id} className="min-w-0">
        <button
          type="button"
          data-testid="table-browser-item"
          onClick={() => onSelectSlug(t.slug)}
          className={cn(
            "flex w-full min-w-0 items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
            active ? "bg-primary/10" : "hover:bg-muted/60"
          )}
        >
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {t.icon ? (
              <span className="text-base leading-none">{t.icon}</span>
            ) : (
              <Table2 className="size-4" aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {t.display_name}
            </span>
            {t.description ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {t.description}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  };

  const list = (
    <div className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <div className={WORKSPACE_TAB_LIST_HEADER_CLASS}>
        <div className="relative w-full">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari tabel…"
            aria-label="Cari tabel"
            data-testid="table-browser-search"
            className="h-10 border-border bg-muted/30 pl-9"
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1" type="scroll">
        <div className="p-2">
          {filteredProject.length > 0 ? (
            <>
              <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tabel {ruangKerjaLabel}
              </p>
              <ul className="min-w-0">{filteredProject.map(renderItem)}</ul>
            </>
          ) : null}
          {filteredOrg.length > 0 ? (
            <>
              <p className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tabel Organisasi
              </p>
              <ul className="min-w-0">{filteredOrg.map(renderItem)}</ul>
            </>
          ) : null}
          {!hasAnyMatch ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {query ? "Tidak ada tabel yang cocok." : "Belum ada tabel."}
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );

  const detail = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background px-4 pb-4">
      {selected ? (
        <VirtualTableView
          key={selected.id}
          table={selected}
          columns={virtualColumnsByTableId.get(selected.id) ?? EMPTY_COLUMNS}
          projectId={projectId}
          organizationId={organizationId}
          organizationName={organizationName}
          userId={userId}
          isOrgAdmin={isOrgAdmin}
          projectsForMention={projectsForMention}
          memberNameByUserId={memberNameByUserId}
          allVirtualTables={allVirtualTables}
          fillHeight
          onActivityChange={onActivityChange}
          headerLeading={
            rail.railEnabled ? (
              <WorkspaceRailToggleButton
                isOpen={rail.isOpen}
                onToggle={rail.toggle}
              />
            ) : undefined
          }
        />
      ) : (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Pilih tabel di daftar untuk melihat datanya.
        </p>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <WorkspaceCollapsibleRailShell isOpen={rail.isOpen}>{list}</WorkspaceCollapsibleRailShell>
      {detail}
    </div>
  );
}
