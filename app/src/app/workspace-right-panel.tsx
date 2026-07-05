"use client";

import { useMemo } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { RowChatContextPath } from "@/components/row-chat-context-path";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { RUANG_KERJA_LABEL } from "@/lib/product-labels";
import { useIsBelowMd } from "@/lib/use-media-query";
import { buildChatTablePathSegments } from "@/lib/chat-row-context";
import { rowLabelFromPath } from "@/lib/chat-row-context";
import { formatVirtualTableValueForMapPopup } from "@/lib/virtual-table-map-popup";
import { WorkspaceMobileRowDetailForm } from "./workspace-mobile-row-detail-form";
import { ChatPanel } from "./chat-panel";
import { VirtualTableView } from "./virtual-table-view";
import { VirtualTableRelationExplorer } from "./virtual-table-relation-explorer";
import { VirtualTableEntity360Panel } from "./virtual-table-entity-360-panel";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import {
  useWorkspaceRightPanel,
  type WorkspaceRightPanelRowTab,
  type WorkspaceRightPanelState,
} from "./workspace-right-panel-context";
import { Button } from "@/components/ui/button";
import { useWorkspaceSpatialDataSync } from "./workspace-spatial-data-sync-context";
import {
  applySpatialFilterFromRowValue,
  filterValueLabel,
  pickSpatialFilterColumn,
} from "@/lib/workspace-spatial-filter-from-row";
import { saveSpatialFilterSyncEnabled } from "@/lib/workspace-spatial-layer-layout-preference";
import { useVirtualTableChatUnread } from "./virtual-table-chat-unread-context";
import {
  buildVirtualColumnsByTableId,
  pickFindOnMapRelationPath,
  resolveFindOnMapTarget,
  tableHasGeometryColumn,
} from "@/lib/virtual-table-find-on-map";
import type { ProjectEntity360Profile } from "@/lib/project-entity-360-profile";
import { toast } from "sonner";

type Props = {
  organizationId: string | null;
  organizationName?: string | null;
  projectId: string | null;
  userId: string | null;
  userEmail?: string | null;
  isOrgAdmin?: boolean;
  projectsForMention: { id: string; name: string; key?: string }[];
  memberNameByUserId: Map<string, string>;
  allVirtualTables: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  /**
   * True saat tab Obrolan aktif (desktop). Panel kanan lalu hanya menampilkan
   * kind data ("Buka berdampingan"); kind chat disembunyikan agar tidak dobel
   * dengan percakapan utama di tab Obrolan.
   */
  chatTabActive?: boolean;
  entity360Profile?: ProjectEntity360Profile;
};

export function WorkspaceRightPanel(props: Props) {
  const { panel, closePanel } = useWorkspaceRightPanel();
  const isBelowMd = useIsBelowMd();

  if (!props.organizationId || !props.userId) return null;

  if (isBelowMd) {
    return (
      <Sheet
        open={panel != null}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
        side="bottom"
      >
        {panel ? (
          <SheetContent
            side="bottom"
            className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0 pb-[env(safe-area-inset-bottom)]"
            aria-labelledby="workspace-right-panel-title"
          >
            <WorkspaceRightPanelInner {...props} panel={panel} />
          </SheetContent>
        ) : null}
      </Sheet>
    );
  }

  if (!panel) return null;

  const isDataKind =
    panel.kind === "table-data" ||
    panel.kind === "row-detail" ||
    panel.kind === "entity-360";
  // Tab Obrolan (desktop): sembunyikan kind chat, hanya izinkan kind data.
  if (props.chatTabActive && !isDataKind) return null;

  return (
    <aside
      className={cn(
        "relative z-30 flex shrink-0 flex-col border-l border-border bg-card",
        // Grid tabel butuh ruang lebih; detail baris + chat cukup w-96.
        panel.kind === "table-data" ? "w-[32rem] max-w-[46vw]" : "w-[28rem] max-w-[40vw]"
      )}
      aria-label="Panel sisi kanan"
    >
      <WorkspaceRightPanelInner {...props} panel={panel} />
    </aside>
  );
}

function WorkspaceRightPanelInner({
  organizationId,
  organizationName = null,
  projectId,
  userId,
  userEmail = null,
  isOrgAdmin = false,
  projectsForMention,
  memberNameByUserId,
  allVirtualTables,
  virtualColumns,
  entity360Profile,
  panel,
}: Props & { panel: WorkspaceRightPanelState }) {
  const isBelowMd = useIsBelowMd();
  const { closePanel, setRowTab } = useWorkspaceRightPanel();
  const { refresh: refreshTableChatBadges } = useVirtualTableChatUnread();

  const table =
    panel.kind === "table-chat" ||
    panel.kind === "row" ||
    panel.kind === "table-data" ||
    panel.kind === "row-detail" ||
    panel.kind === "entity-360"
      ? (allVirtualTables.find((t) => t.id === panel.tableId) ?? null)
      : null;
  const tableProjectId = table?.project_id ?? projectId;

  const tablePathSegments =
    table &&
    buildChatTablePathSegments({
      projectName: table.project_id
        ? (projectsForMention.find((p) => p.id === table.project_id)?.name ??
          null)
        : null,
      organizationName: table.project_id ? null : organizationName,
      tableDisplayName: table.display_name,
    });

  const projectForPanel =
    panel.kind === "project-chat"
      ? (projectsForMention.find((p) => p.id === panel.projectId) ?? null)
      : null;

  const pathSegments = (() => {
    if (panel.kind === "organization-chat") {
      return organizationName ? [organizationName] : ["Organisasi"];
    }
    if (panel.kind === "project-chat") {
      return projectForPanel ? [projectForPanel.name] : [RUANG_KERJA_LABEL];
    }
    if (panel.kind === "row" || panel.kind === "row-detail" || panel.kind === "entity-360") {
      return panel.pathSegments;
    }
    return tablePathSegments ?? ["Tabel"];
  })();

  return (
    <>
      {panel.kind === "row" ? (
        <RightPanelHeader
          tabs={[
            { id: "detail" as const, label: "Detail" },
            { id: "chat" as const, label: "Chat" },
          ]}
          activeTab={panel.tab}
          onTabChange={setRowTab}
          pathSegments={pathSegments}
          onClose={closePanel}
        />
      ) : panel.kind === "table-data" ? (
        <RightPanelHeader
          tabs={[{ id: "detail" as const, label: "Data" }]}
          activeTab="detail"
          pathSegments={pathSegments}
          onClose={closePanel}
        />
      ) : panel.kind === "row-detail" ? (
        <RightPanelHeader
          tabs={[{ id: "detail" as const, label: "Detail" }]}
          activeTab="detail"
          pathSegments={pathSegments}
          onClose={closePanel}
        />
      ) : panel.kind === "entity-360" ? (
        <RightPanelHeader
          tabs={[{ id: "detail" as const, label: "Panel 360°" }]}
          activeTab="detail"
          pathSegments={pathSegments}
          onClose={closePanel}
        />
      ) : (
        <RightPanelHeader
          tabs={[{ id: "chat" as const, label: "Chat" }]}
          activeTab="chat"
          pathSegments={pathSegments}
          onClose={closePanel}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {panel.kind === "organization-chat" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-0">
            <ChatPanel
              scopeType="organization"
              organizationId={organizationId!}
              roomCacheKey="org"
              embedded
              title="Chat organisasi"
              userId={userId!}
              userEmail={userEmail}
              authorNameByUserId={memberNameByUserId}
              mentionOptions={panel.mentionOptions}
              fileAttachmentOptions={[]}
              isOrgAdmin={isOrgAdmin}
              className="min-h-0 flex-1"
            />
          </div>
        ) : null}

        {panel.kind === "project-chat" && projectForPanel ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-0">
            <ChatPanel
              scopeType="project"
              organizationId={organizationId!}
              projectId={panel.projectId}
              roomCacheKey={`project:${panel.projectId}`}
              embedded
              title={projectForPanel.name}
              subtitle={organizationName ?? undefined}
              userId={userId!}
              userEmail={userEmail}
              authorNameByUserId={memberNameByUserId}
              mentionOptions={panel.mentionOptions}
              fileAttachmentOptions={[]}
              isOrgAdmin={isOrgAdmin}
              onInvalidateTableUnread={refreshTableChatBadges}
              className="min-h-0 flex-1"
            />
          </div>
        ) : null}

        {panel.kind === "table-chat" && !table ? (
          <div className="p-3 text-sm text-muted-foreground">
            Tabel tidak ditemukan di scope ini.
          </div>
        ) : null}

        {panel.kind === "table-chat" && table ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-0">
            <ChatPanel
              scopeType="virtual_table"
              organizationId={organizationId!}
              projectId={tableProjectId}
              virtualTableId={table.id}
              roomCacheKey={`table:${table.id}`}
              embedded
              title={table.display_name}
              subtitle="Diskusi umum tentang tabel ini"
              userId={userId!}
              userEmail={userEmail}
              authorNameByUserId={memberNameByUserId}
              mentionOptions={panel.mentionOptions}
              fileAttachmentOptions={[]}
              isOrgAdmin={isOrgAdmin}
              onInvalidateTableUnread={refreshTableChatBadges}
              className="min-h-0 flex-1"
            />
          </div>
        ) : null}

        {panel.kind === "row" ? (
          panel.tab === "detail" ? (
            <RowDetailSection
              isBelowMd={isBelowMd}
              rowId={panel.rowId}
              tableId={panel.tableId}
              projectId={projectId}
              pathSegments={panel.pathSegments}
              rowPayload={panel.rowPayload}
              relationLabels={panel.relationLabels}
              memberNameByUserId={memberNameByUserId}
              organizationId={organizationId}
              columns={
                virtualColumns.filter((c) => c.table_id === panel.tableId)
              }
              allVirtualColumns={virtualColumns}
              allVirtualTables={allVirtualTables}
              projectsForMention={projectsForMention}
              organizationName={organizationName}
              entity360Profile={entity360Profile}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-0">
              <ChatPanel
                scopeType="virtual_row"
                organizationId={organizationId!}
                projectId={tableProjectId}
                virtualRowId={panel.rowId}
                roomCacheKey={`row:${panel.rowId}`}
                embedded
                title={rowLabelFromPath(panel.pathSegments)}
                userId={userId!}
                userEmail={userEmail}
                authorNameByUserId={memberNameByUserId}
                mentionOptions={panel.mentionOptions}
                fileAttachmentOptions={panel.fileAttachmentOptions}
                isOrgAdmin={isOrgAdmin}
                onInvalidateTableUnread={refreshTableChatBadges}
                className="min-h-0 flex-1"
              />
            </div>
          )
        ) : null}

        {panel.kind === "table-data" && !table ? (
          <div className="p-3 text-sm text-muted-foreground">
            Tabel tidak ditemukan di scope ini.
          </div>
        ) : null}

        {panel.kind === "table-data" && table ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pb-3">
            <VirtualTableView
              key={table.id}
              table={table}
              columns={virtualColumns.filter((c) => c.table_id === table.id)}
              projectId={tableProjectId}
              organizationId={organizationId}
              organizationName={organizationName}
              userId={userId}
              isOrgAdmin={isOrgAdmin}
              projectsForMention={projectsForMention}
              memberNameByUserId={memberNameByUserId}
              allVirtualTables={allVirtualTables}
              virtualColumnsByTableId={buildVirtualColumnsByTableId(virtualColumns)}
              fillHeight
              embeddedInRightPanel
              entity360Profile={entity360Profile}
            />
          </div>
        ) : null}

        {panel.kind === "entity-360" ? (
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <VirtualTableEntity360Panel
              anchorTableId={panel.tableId}
              anchorRowId={panel.rowId}
              anchorPayload={panel.rowPayload}
              seedRelationLabels={panel.relationLabels}
              allVirtualTables={allVirtualTables}
              allVirtualColumns={virtualColumns}
              memberNameByUserId={memberNameByUserId}
              compact={!isBelowMd}
            />
          </div>
        ) : null}

        {panel.kind === "row-detail" ? (
          <RowDetailSection
            isBelowMd={isBelowMd}
            rowId={panel.rowId}
            tableId={panel.tableId}
            projectId={projectId}
            pathSegments={panel.pathSegments}
            rowPayload={panel.rowPayload}
            relationLabels={panel.relationLabels}
            memberNameByUserId={memberNameByUserId}
            organizationId={organizationId}
            columns={virtualColumns.filter((c) => c.table_id === panel.tableId)}
            allVirtualColumns={virtualColumns}
            allVirtualTables={allVirtualTables}
            projectsForMention={projectsForMention}
            organizationName={organizationName}
            entity360Profile={entity360Profile}
          />
        ) : null}
      </div>
    </>
  );
}

type TabDef = { id: WorkspaceRightPanelRowTab; label: string };

function RightPanelHeader({
  tabs,
  activeTab,
  onTabChange,
  pathSegments,
  onClose,
}: {
  tabs: TabDef[];
  activeTab: WorkspaceRightPanelRowTab;
  onTabChange?: (tab: WorkspaceRightPanelRowTab) => void;
  pathSegments: string[];
  onClose: () => void;
}) {
  const panelTitle =
    tabs.find((t) => t.id === activeTab)?.label ?? tabs[0]?.label ?? "Panel";

  // Header satu baris setinggi header daftar tab (3.75rem), tanpa garis bawah —
  // selaras tinggi header pane lain (rail daftar, detail obrolan, dsb).
  return (
    <div className="flex min-h-[3.75rem] shrink-0 items-center gap-2 px-3">
      <h2 id="workspace-right-panel-title" className="sr-only">
        {panelTitle}
      </h2>
      <div className="min-w-0 flex-1">
        <RowChatContextPath segments={pathSegments} />
      </div>
      {tabs.length > 1 ? (
        <div className="flex shrink-0 items-center gap-1">
          {tabs.map((tab) => (
            <PanelTabButton
              key={tab.id}
              active={activeTab === tab.id}
              label={tab.label}
              onClick={onTabChange ? () => onTabChange(tab.id) : undefined}
            />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onClose}
        aria-label="Tutup panel"
      >
        <X className="size-4" aria-hidden />
        <span className="sr-only">Tutup</span>
      </button>
    </div>
  );
}

function PanelTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick?: () => void;
}) {
  const isBelowMd = useIsBelowMd();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-md font-medium transition-colors",
        isBelowMd ? "min-h-10 px-3 py-2 text-sm" : "px-2.5 py-1 text-xs",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        !onClick && active && "cursor-default"
      )}
    >
      {label}
    </button>
  );
}

function RowDetailSection({
  isBelowMd,
  rowId,
  tableId,
  projectId,
  pathSegments,
  rowPayload,
  relationLabels = {},
  memberNameByUserId,
  organizationId,
  columns,
  allVirtualColumns,
  allVirtualTables,
  projectsForMention,
  organizationName = null,
  entity360Profile,
}: {
  isBelowMd: boolean;
  rowId: string;
  tableId: string;
  projectId: string | null;
  pathSegments: string[];
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  organizationId: string | null;
  columns: VirtualColumnRow[];
  allVirtualColumns: VirtualColumnRow[];
  allVirtualTables: VirtualTableRow[];
  projectsForMention: { id: string; name: string; key?: string }[];
  organizationName?: string | null;
  entity360Profile?: ProjectEntity360Profile;
}) {
  if (isBelowMd) {
    return (
      <WorkspaceMobileRowDetailForm
        rowId={rowId}
        tableId={tableId}
        columns={columns}
        rowPayload={rowPayload}
        relationLabels={relationLabels}
        memberNameByUserId={memberNameByUserId}
        organizationId={organizationId}
      />
    );
  }

  return (
    <RowDetailPlaceholder
      tableId={tableId}
      projectId={projectId}
      rowId={rowId}
      pathSegments={pathSegments}
      rowPayload={rowPayload}
      relationLabels={relationLabels}
      memberNameByUserId={memberNameByUserId}
      columns={columns}
      allVirtualColumns={allVirtualColumns}
      allVirtualTables={allVirtualTables}
      projectsForMention={projectsForMention}
      organizationName={organizationName}
      entity360Profile={entity360Profile}
    />
  );
}

function RowDetailPlaceholder({
  tableId,
  projectId,
  rowId,
  pathSegments,
  rowPayload,
  relationLabels = {},
  memberNameByUserId,
  columns,
  allVirtualColumns,
  allVirtualTables,
  projectsForMention,
  organizationName = null,
  entity360Profile,
}: {
  tableId: string;
  projectId: string | null;
  rowId: string;
  pathSegments: string[];
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  columns: VirtualColumnRow[];
  allVirtualColumns: VirtualColumnRow[];
  allVirtualTables: VirtualTableRow[];
  projectsForMention: { id: string; name: string; key?: string }[];
  organizationName?: string | null;
  entity360Profile?: ProjectEntity360Profile;
}) {
  const isBelowMd = useIsBelowMd();
  const spatialSync = useWorkspaceSpatialDataSync();
  const findOnMapProfile = useMemo(
    () =>
      entity360Profile?.geometry_holder
        ? {
            sourceTableId: tableId,
            geometryHolder: entity360Profile.geometry_holder,
          }
        : { sourceTableId: tableId },
    [entity360Profile, tableId]
  );
  const columnsByTableId = useMemo(
    () => buildVirtualColumnsByTableId(allVirtualColumns),
    [allVirtualColumns]
  );
  const hasGeometry = tableHasGeometryColumn(columns);
  const filterCol = pickSpatialFilterColumn(columns, rowPayload);
  const filterVal =
    filterCol && rowPayload
      ? filterValueLabel(
          filterCol,
          rowPayload[filterCol.slug],
          relationLabels,
          memberNameByUserId
        )
      : "";

  const handleFilterOnSpatial = () => {
    if (!filterCol || !filterVal) return;
    applySpatialFilterFromRowValue(tableId, filterCol.slug, filterVal);
    if (projectId) saveSpatialFilterSyncEnabled(projectId, true);
    spatialSync.setRowSelection(tableId, [rowId]);
    spatialSync.openInSpatial({
      tableId,
      rowIds: [rowId],
      zoomToSelection: true,
    });
  };

  const showOnMapTarget = useMemo(() => {
    if (!rowPayload) return null;
    return resolveFindOnMapTarget({
      sourceTableId: tableId,
      sourceColumns: columns,
      sourceRows: [{ id: rowId, payload: rowPayload }],
      columnsByTableId,
      findOnMapProfile,
    });
  }, [tableId, columns, rowId, rowPayload, columnsByTableId, findOnMapProfile]);

  const handleShowOnMap = () => {
    if (!showOnMapTarget) {
      toast.error("Baris ini tidak punya poligon terkait.");
      return;
    }
    spatialSync.openInSpatial({
      tableId: showOnMapTarget.tableId,
      rowIds: showOnMapTarget.rowIds,
      zoomToSelection: true,
    });
  };

  const showOnMapLabel = hasGeometry ? "Buka di Spasial" : "Tunjukkan di peta";
  const findOnMapRelationPath = useMemo(
    () => pickFindOnMapRelationPath(columns, columnsByTableId, findOnMapProfile),
    [columns, columnsByTableId, findOnMapProfile]
  );
  const canShowOnMapButton = hasGeometry
    ? Boolean(showOnMapTarget)
    : findOnMapRelationPath != null;
  const projectName =
    projectId != null
      ? (projectsForMention.find((p) => p.id === projectId)?.name ?? null)
      : null;
  const visibleCols = [...columns]
    .filter((c) => c.data_type !== "geometry")
    .sort((a, b) => a.position - b.position);

  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-auto text-sm",
        isBelowMd ? "space-y-3 p-4" : "p-3"
      )}
    >
      {visibleCols.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada kolom untuk ditampilkan.</p>
      ) : (
        <dl className={cn(isBelowMd ? "space-y-3" : "space-y-2")}>
          {visibleCols.map((col) => {
            const val = rowPayload?.[col.slug];
            const formatted = formatVirtualTableValueForMapPopup(
              val,
              col.data_type,
              relationLabels,
              memberNameByUserId
            );
            const display =
              formatted.trim() !== "" ? formatted : "—";
            return (
              <div
                key={col.id}
                className={cn(
                  isBelowMd
                    ? "rounded-lg border border-border bg-muted/30 px-3 py-3"
                    : "border-b border-border/60 pb-2"
                )}
              >
                <dt
                  className={cn(
                    "font-medium text-muted-foreground",
                    isBelowMd ? "text-sm" : "text-xs"
                  )}
                >
                  {col.display_name}
                </dt>
                <dd
                  className={cn(
                    "mt-1 break-words text-foreground",
                    isBelowMd && "text-base leading-snug"
                  )}
                >
                  {display}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {canShowOnMapButton ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full gap-1.5"
          onClick={handleShowOnMap}
        >
          <MapIcon className="size-3.5 shrink-0" />
          {showOnMapLabel}
        </Button>
      ) : null}
      {hasGeometry && filterCol && filterVal ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={handleFilterOnSpatial}
        >
          Filter di Spasial ({filterCol.display_name} = {filterVal})
        </Button>
      ) : null}
      <VirtualTableRelationExplorer
        tableId={tableId}
        rowId={rowId}
        rowPayload={rowPayload}
        columns={columns}
        allVirtualColumns={allVirtualColumns}
        relationLabels={relationLabels}
        allVirtualTables={allVirtualTables}
        projectName={projectName}
        organizationName={organizationName}
      />
      <p
        className={cn(
          "text-muted-foreground",
          isBelowMd ? "text-xs" : "mt-4 text-[10px]"
        )}
      >
        {pathSegments.join(" › ")}
      </p>
    </div>
  );
}
