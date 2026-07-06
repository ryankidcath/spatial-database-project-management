"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  FolderKanban,
  Search,
  Table2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ruangKerjaLc } from "@/lib/product-labels";
import type { VirtualTableRow } from "./virtual-table-types";
import type {
  DesktopScopeOrganization,
  DesktopScopeProject,
} from "./workspace-desktop-scope-switcher";

type PaletteItem =
  | {
      kind: "org";
      id: string;
      label: string;
      keywords: string;
    }
  | {
      kind: "project";
      id: string;
      label: string;
      orgName: string;
      organizationId: string;
      keywords: string;
    }
  | {
      kind: "table";
      id: string;
      slug: string;
      label: string;
      scopeLabel: string;
      keywords: string;
    };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizations: DesktopScopeOrganization[];
  projects: DesktopScopeProject[];
  virtualTables: VirtualTableRow[];
  onSelectOrganization: (organizationId: string) => void;
  onSelectProject: (projectId: string, organizationId: string) => void;
  onSelectTable: (slug: string) => void;
};

function groupLabel(kind: PaletteItem["kind"]): string {
  if (kind === "org") return "Organisasi";
  if (kind === "project") return "Ruang Kerja";
  return "Tabel";
}

export function WorkspaceCommandPalette({
  open,
  onOpenChange,
  organizations,
  projects,
  virtualTables,
  onSelectOrganization,
  onSelectProject,
  onSelectTable,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const orgNameById = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations]
  );

  const items = useMemo((): PaletteItem[] => {
    const all: PaletteItem[] = [
      ...organizations.map(
        (o): PaletteItem => ({
          kind: "org",
          id: o.id,
          label: o.name,
          keywords: o.name.toLowerCase(),
        })
      ),
      ...projects.map(
        (p): PaletteItem => ({
          kind: "project",
          id: p.id,
          label: p.name,
          organizationId: p.organization_id,
          orgName: orgNameById.get(p.organization_id) ?? "",
          keywords: `${p.name} ${orgNameById.get(p.organization_id) ?? ""}`.toLowerCase(),
        })
      ),
      ...virtualTables.map(
        (vt): PaletteItem => ({
          kind: "table",
          id: vt.id,
          slug: vt.slug,
          label: vt.display_name,
          scopeLabel: vt.project_id
            ? (projects.find((p) => p.id === vt.project_id)?.name ?? ruangKerjaLc)
            : (orgNameById.get(vt.organization_id ?? "") ?? "Organisasi"),
          keywords: `${vt.display_name} ${vt.slug}`.toLowerCase(),
        })
      ),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((item) => item.keywords.includes(q));
  }, [organizations, projects, virtualTables, orgNameById, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(Math.max(0, items.length - 1));
    }
  }, [activeIndex, items.length]);

  const runItem = (item: PaletteItem) => {
    onOpenChange(false);
    if (item.kind === "org") onSelectOrganization(item.id);
    else if (item.kind === "project")
      onSelectProject(item.id, item.organizationId);
    else onSelectTable(item.slug);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[activeIndex]) {
      e.preventDefault();
      runItem(items[activeIndex]!);
    }
  };

  let lastGroup: PaletteItem["kind"] | null = null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton>
        <DialogHeader className="sr-only">
          <DialogTitle>Navigasi cepat</DialogTitle>
          <DialogDescription>
            Lompat ke organisasi, {ruangKerjaLc}, atau tabel
          </DialogDescription>
        </DialogHeader>
        <div className="border-b border-border px-3 py-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Cari organisasi, ruang kerja, atau tabel…"
              className="h-10 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
              data-testid="command-palette-input"
            />
          </div>
          <p className="mt-1 px-1 text-[0.65rem] text-muted-foreground">
            ↑↓ navigasi · Enter pilih · Esc tutup
          </p>
        </div>
        <ul
          className="max-h-[min(60vh,20rem)] overflow-auto p-1"
          role="listbox"
          aria-label="Hasil navigasi"
        >
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Tidak ada hasil untuk &quot;{query.trim()}&quot;.
            </li>
          ) : (
            items.map((item, index) => {
              const showHeading = item.kind !== lastGroup;
              lastGroup = item.kind;
              const Icon =
                item.kind === "org"
                  ? Building2
                  : item.kind === "project"
                    ? FolderKanban
                    : Table2;
              return (
                <li key={`${item.kind}-${item.id}`}>
                  {showHeading ? (
                    <p className="px-2 pb-1 pt-2 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground first:pt-1">
                      {groupLabel(item.kind)}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    data-testid="command-palette-item"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runItem(item)}
                    className={cn(
                      "flex w-full min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      index === activeIndex
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/70"
                    )}
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {item.label}
                    </span>
                    {item.kind === "project" ? (
                      <span className="max-w-[40%] truncate text-xs text-muted-foreground">
                        {item.orgName}
                      </span>
                    ) : null}
                    {item.kind === "table" ? (
                      <span className="max-w-[40%] truncate text-xs text-muted-foreground">
                        {item.scopeLabel}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Daftarkan Ctrl+K / ⌘K untuk membuka palette (desktop). */
export function useWorkspaceCommandPaletteShortcut(
  enabled: boolean,
  onOpen: () => void
) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "k" && e.key !== "K") return;
      if (!e.ctrlKey && !e.metaKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      e.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onOpen]);
}
