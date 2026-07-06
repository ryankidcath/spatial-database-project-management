"use client";

import { useMemo, useState } from "react";
import { Building2, FolderKanban, Plus, Search, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ruangKerjaLc } from "@/lib/product-labels";
import { WORKSPACE_TAB_LIST_HEADER_CLASS, WORKSPACE_RAIL_SECTION_LABEL_CLASS } from "./workspace-tab-list-header";
import {
  useWorkspaceCollapsibleRail,
  WorkspaceCollapsibleRailShell,
  WorkspaceRailToggleButton,
} from "./workspace-collapsible-rail";
import { WorkspaceRailListItem } from "./workspace-rail-list-item";
import { VirtualTableView } from "./virtual-table-view";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import type { ProjectEntity360Profile } from "@/lib/project-entity-360-profile";

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
  entity360Profile?: ProjectEntity360Profile;
  canCreateProjectTable?: boolean;
  canCreateOrgTable?: boolean;
  onCreateProjectTable?: () => void;
  onCreateOrgTable?: () => void;
  onTableDeleted?: () => void | Promise<void>;
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
  entity360Profile,
  canCreateProjectTable = false,
  canCreateOrgTable = false,
  onCreateProjectTable,
  onCreateOrgTable,
  onTableDeleted,
}: Props) {
  const [search, setSearch] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const rail = useWorkspaceCollapsibleRail("Data");

  const showCreateMenu =
    (canCreateProjectTable && onCreateProjectTable) ||
    (canCreateOrgTable && onCreateOrgTable);

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
        <WorkspaceRailListItem
          active={active}
          onClick={() => onSelectSlug(t.slug)}
          icon={
            t.icon ? (
              <span className="text-base leading-none">{t.icon}</span>
            ) : (
              <Table2 className="size-4" aria-hidden />
            )
          }
          title={t.display_name}
          subtitle={t.description}
          testId="table-browser-item"
        />
      </li>
    );
  };

  const list = (
    <div className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <div className={WORKSPACE_TAB_LIST_HEADER_CLASS}>
        <div className="flex w-full min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-1">
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
          {showCreateMenu ? (
            <Popover open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label="Buat tabel baru"
                    title="Buat tabel baru"
                    data-testid="table-browser-create"
                  >
                    <Plus className="size-4" />
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-56 p-1">
                {canCreateProjectTable && onCreateProjectTable ? (
                  <button
                    type="button"
                    className="flex w-full min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/70"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      onCreateProjectTable();
                    }}
                  >
                    <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
                    <span>Tabel {ruangKerjaLabel}</span>
                  </button>
                ) : null}
                {canCreateOrgTable && onCreateOrgTable ? (
                  <button
                    type="button"
                    className="flex w-full min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/70"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      onCreateOrgTable();
                    }}
                  >
                    <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <span>Tabel Organisasi</span>
                  </button>
                ) : null}
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1" type="scroll">
        <div className="p-2">
          {filteredProject.length > 0 ? (
            <>
              <p className={WORKSPACE_RAIL_SECTION_LABEL_CLASS}>
                Tabel {ruangKerjaLabel}
              </p>
              <ul className="min-w-0">{filteredProject.map(renderItem)}</ul>
            </>
          ) : null}
          {filteredOrg.length > 0 ? (
            <>
              <p className={cn(WORKSPACE_RAIL_SECTION_LABEL_CLASS, "pt-3")}>
                Tabel Organisasi
              </p>
              <ul className="min-w-0">{filteredOrg.map(renderItem)}</ul>
            </>
          ) : null}
          {!hasAnyMatch ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {query
                ? "Tidak ada tabel yang cocok."
                : showCreateMenu
                  ? `Belum ada tabel. Gunakan + untuk membuat tabel ${ruangKerjaLc} atau organisasi.`
                  : "Belum ada tabel."}
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
          virtualColumnsByTableId={virtualColumnsByTableId}
          fillHeight
          onActivityChange={onActivityChange}
          onTableDeleted={onTableDeleted}
          entity360Profile={entity360Profile}
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
