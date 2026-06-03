"use client";

import { X } from "lucide-react";
import { RowChatContextPath } from "@/components/row-chat-context-path";
import { cn } from "@/lib/utils";
import { buildChatTablePathSegments } from "@/lib/chat-row-context";
import { rowLabelFromPath } from "@/lib/chat-row-context";
import { ChatPanel } from "./chat-panel";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import {
  useWorkspaceRightPanel,
  type WorkspaceRightPanelRowTab,
} from "./workspace-right-panel-context";
import { useVirtualTableChatUnread } from "./virtual-table-chat-unread-context";

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
};

export function WorkspaceRightPanel({
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
}: Props) {
  const { panel, closePanel, setRowTab } = useWorkspaceRightPanel();
  const { refresh: refreshTableChatBadges } = useVirtualTableChatUnread();

  if (!panel || !organizationId || !userId) return null;

  const table =
    panel.kind === "table-chat" || panel.kind === "row"
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
      return projectForPanel
        ? [projectForPanel.name]
        : ["Proyek"];
    }
    if (panel.kind === "row") return panel.pathSegments;
    return tablePathSegments ?? ["Tabel"];
  })();

  return (
    <aside
      className="relative z-30 flex w-96 shrink-0 flex-col border-l border-border bg-card"
      aria-label="Panel sisi kanan"
    >
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
              organizationId={organizationId}
              embedded
              title="Chat organisasi"
              subtitle="Tim inti organisasi"
              userId={userId}
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
              organizationId={organizationId}
              projectId={panel.projectId}
              embedded
              title={projectForPanel.name}
              subtitle="Diskusi proyek"
              userId={userId}
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
              organizationId={organizationId}
              projectId={tableProjectId}
              virtualTableId={table.id}
              embedded
              title={table.display_name}
              subtitle="Diskusi umum tentang tabel ini"
              userId={userId}
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
            <RowDetailPlaceholder
              pathSegments={panel.pathSegments}
              rowPayload={panel.rowPayload}
              columns={
                virtualColumns.filter((c) => c.table_id === panel.tableId)
              }
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-0">
              <ChatPanel
                scopeType="virtual_row"
                organizationId={organizationId}
                projectId={tableProjectId}
                virtualRowId={panel.rowId}
                embedded
                title={rowLabelFromPath(panel.pathSegments)}
                userId={userId}
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
      </div>
    </aside>
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
  const singleChatTab = tabs.length === 1 && tabs[0]?.id === "chat";

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-1 gap-1">
          {tabs.map((tab) => (
            <PanelTabButton
              key={tab.id}
              active={activeTab === tab.id}
              label={tab.label}
              onClick={
                onTabChange && !singleChatTab
                  ? () => onTabChange(tab.id)
                  : undefined
              }
            />
          ))}
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label="Tutup panel"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="border-t border-border px-3 py-2.5">
        <RowChatContextPath segments={pathSegments} />
      </div>
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
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

function RowDetailPlaceholder({
  pathSegments,
  rowPayload,
  columns,
}: {
  pathSegments: string[];
  rowPayload?: Record<string, unknown>;
  columns: VirtualColumnRow[];
}) {
  const visibleCols = [...columns].sort((a, b) => a.position - b.position);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
      <p className="mb-3 text-xs text-muted-foreground">
        Ringkasan baris — editor lengkap menyusul.
      </p>
      {visibleCols.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada kolom untuk ditampilkan.</p>
      ) : (
        <dl className="space-y-2">
          {visibleCols.map((col) => {
            const val = rowPayload?.[col.slug];
            const display =
              val == null || val === ""
                ? "—"
                : typeof val === "object"
                  ? JSON.stringify(val)
                  : String(val);
            return (
              <div key={col.id} className="border-b border-border/60 pb-2">
                <dt className="text-xs font-medium text-muted-foreground">
                  {col.display_name}
                </dt>
                <dd className="mt-0.5 break-words text-foreground">{display}</dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="mt-4 text-[10px] text-muted-foreground">
        {pathSegments.join(" › ")}
      </p>
    </div>
  );
}
