"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { IssueRow, StatusRow } from "./workspace-client";

const COL_PREFIX = "kanban-col:";

const cardData = (issue: IssueRow) =>
  ({ type: "card" as const, issue });

function colId(statusId: string | null) {
  return `${COL_PREFIX}${statusId ?? "none"}`;
}

function resolveTargetStatus(
  over: Over | null,
  localIssues: IssueRow[]
): string | null | undefined {
  if (!over) return undefined;
  const d = over.data.current;
  if (d?.type === "column") return d.statusId as string | null;
  if (d?.type === "card") {
    const issue = d.issue as IssueRow;
    return issue.status_id;
  }
  const hit = localIssues.find((i) => i.id === over.id);
  return hit?.status_id ?? null;
}

function buildMergedColumn(
  all: IssueRow[],
  activeId: string,
  targetStatusId: string | null,
  over: Over | null
): IssueRow[] | null {
  const active = all.find((i) => i.id === activeId);
  if (!active) return null;

  const rest = all.filter(
    (i) =>
      i.id !== activeId &&
      (targetStatusId === null
        ? i.status_id === null
        : i.status_id === targetStatusId)
  );

  const moved: IssueRow = { ...active, status_id: targetStatusId };

  if (!over) {
    return [...rest, moved];
  }

  const d = over.data.current;
  if (d?.type === "column") {
    return [...rest, moved];
  }
  if (d?.type === "card") {
    const overIssue = d.issue as IssueRow;
    const overStatus =
      overIssue.status_id === null || overIssue.status_id === undefined
        ? null
        : overIssue.status_id;
    if (overStatus !== targetStatusId) {
      return [...rest, moved];
    }
    const idx = rest.findIndex((i) => i.id === overIssue.id);
    if (idx < 0) return [...rest, moved];
    const next = [...rest];
    next.splice(idx + 1, 0, moved);
    return next;
  }

  return [...rest, moved];
}

function applyOptimisticTopLevel(
  local: IssueRow[],
  draggedId: string,
  prevStatus: string | null,
  targetStatusId: string | null,
  mergedTarget: IssueRow[]
): IssueRow[] {
  const inTarget = (i: IssueRow) =>
    targetStatusId === null ? i.status_id === null : i.status_id === targetStatusId;
  const inSource = (i: IssueRow) =>
    prevStatus === null ? i.status_id === null : i.status_id === prevStatus;

  const targetFull = mergedTarget.map((row, idx) => ({
    ...row,
    status_id: targetStatusId,
    sort_order: (idx + 1) * 10,
  }));

  if (prevStatus === targetStatusId) {
    const untouched = local.filter((i) => !inTarget(i));
    return [...untouched, ...targetFull];
  }

  const untouched = local.filter((i) => !inTarget(i) && !inSource(i));

  const sourceFull = local
    .filter((i) => i.id !== draggedId && inSource(i))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row, idx) => ({ ...row, sort_order: (idx + 1) * 10 }));

  return [...untouched, ...sourceFull, ...targetFull];
}

type KanbanColumnProps = {
  id: string;
  statusId: string | null;
  title: string;
  subtitle: string;
  dashed?: boolean;
  children: React.ReactNode;
};

function KanbanColumn({
  id,
  statusId,
  title,
  subtitle,
  dashed,
  children,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "column" as const, statusId },
  });

  return (
    <div
      className={`flex w-56 shrink-0 flex-col rounded-lg border bg-slate-50 ${
        dashed
          ? "border-dashed border-slate-300 bg-white"
          : "border-slate-200"
      } ${isOver ? "ring-2 ring-blue-400 ring-offset-2" : ""}`}
    >
      <div className="border-b border-slate-200 px-3 py-2">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs capitalize text-slate-500">{subtitle}</p>
      </div>
      <ul
        ref={setNodeRef}
        className="flex min-h-[12rem] flex-1 flex-col gap-2 p-2"
      >
        {children}
      </ul>
    </div>
  );
}

type KanbanCardProps = {
  issue: IssueRow;
  disabled?: boolean;
  saving?: boolean;
  onOpen: () => void;
};

function KanbanCard({ issue, disabled, saving, onOpen }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: issue.id,
      data: cardData(issue),
      disabled,
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <li ref={setNodeRef} style={style} className="list-none">
      <div
        className={`rounded-md border border-slate-200 bg-white px-2 py-2 text-left text-sm shadow-sm ${
          isDragging ? "opacity-40" : ""
        } ${saving ? "ring-2 ring-amber-400" : ""}`}
      >
        <div className="flex gap-2">
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none text-slate-400 hover:text-slate-600 active:cursor-grabbing"
            aria-label="Seret kartu"
            disabled={disabled}
            {...listeners}
            {...attributes}
          >
            ⋮⋮
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 text-left hover:text-blue-800"
          >
            <span className="font-mono text-xs text-slate-500">
              {issue.key_display ?? "—"}
            </span>
            <span className="mt-0.5 block font-medium text-slate-800">
              {issue.title}
            </span>
          </button>
        </div>
      </div>
    </li>
  );
}

function CardPreview({ issue }: { issue: IssueRow }) {
  return (
    <div className="w-52 rounded-md border border-blue-200 bg-white px-2 py-2 text-sm shadow-lg">
      <span className="font-mono text-xs text-slate-500">
        {issue.key_display ?? "—"}
      </span>
      <span className="mt-0.5 block font-medium text-slate-800">
        {issue.title}
      </span>
    </div>
  );
}

type Props = {
  projectId: string;
  statuses: StatusRow[];
  issuesFromServer: IssueRow[];
  onSelectIssue: (issueId: string) => void;
  onPersistError: (message: string) => void;
  onPersisted?: () => void;
};

export function KanbanBoard({
  projectId,
  statuses,
  issuesFromServer,
  onSelectIssue,
  onPersistError,
  onPersisted,
}: Props) {
  const [local, setLocal] = useState<IssueRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    setLocal(
      issuesFromServer
        .filter((i) => i.project_id === projectId && !i.parent_id)
        .map((i) => ({ ...i }))
        .sort((a, b) => a.sort_order - b.sort_order)
    );
  }, [issuesFromServer, projectId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const topLevel = useMemo(
    () => local.filter((i) => i.project_id === projectId && !i.parent_id),
    [local, projectId]
  );

  const persistMove = useCallback(
    async (
      activeIssueId: string,
      prevStatus: string | null,
      targetStatusId: string | null,
      mergedTarget: IssueRow[],
      snapshot: IssueRow[]
    ) => {
      const client = getBrowserSupabaseClient();
      if (!client) {
        onPersistError("Supabase belum dikonfigurasi.");
        return;
      }

      for (let i = 0; i < mergedTarget.length; i++) {
        const row = mergedTarget[i]!;
        const { error } = await client
          .schema("core_pm")
          .from("issues")
          .update({
            status_id: row.status_id,
            sort_order: (i + 1) * 10,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (error) throw error;
      }

      if (prevStatus !== targetStatusId) {
        const sourceRest = snapshot
          .filter(
            (i) =>
              i.id !== activeIssueId &&
              (prevStatus === null
                ? i.status_id === null
                : i.status_id === prevStatus)
          )
          .sort((a, b) => a.sort_order - b.sort_order);
        for (let i = 0; i < sourceRest.length; i++) {
          const row = sourceRest[i]!;
          const { error } = await client
            .schema("core_pm")
            .from("issues")
            .update({
              sort_order: (i + 1) * 10,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (error) throw error;
        }
      }
    },
    [onPersistError]
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setErrorBanner(null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const draggedId = String(e.active.id);
    setActiveId(null);
    const over = e.over;
    const activeIssue = topLevel.find((i) => i.id === draggedId);
    if (!activeIssue) return;

    const targetStatus = resolveTargetStatus(over, topLevel);
    if (targetStatus === undefined) return;

    const merged = buildMergedColumn(topLevel, draggedId, targetStatus, over);
    if (!merged) return;

    const prevStatus = activeIssue.status_id;

    const prevTargetList = topLevel
      .filter((i) =>
        targetStatus === null ? i.status_id === null : i.status_id === targetStatus
      )
      .sort((a, b) => a.sort_order - b.sort_order);
    const unchanged =
      prevStatus === targetStatus &&
      merged.length === prevTargetList.length &&
      merged.every((m, i) => m.id === prevTargetList[i]?.id);
    if (unchanged) return;

    const snapshot = topLevel.map((i) => ({ ...i }));
    const nextLocal = applyOptimisticTopLevel(
      topLevel,
      draggedId,
      prevStatus,
      targetStatus,
      merged
    );
    setLocal((all) => {
      const rest = all.filter(
        (i) => i.project_id !== projectId || i.parent_id
      );
      return [...rest, ...nextLocal];
    });

    setSavingId(draggedId);
    try {
      await persistMove(draggedId, prevStatus, targetStatus, merged, snapshot);
      onPersisted?.();
    } catch (err) {
      setLocal((all) => {
        const rest = all.filter(
          (i) => i.project_id !== projectId || i.parent_id
        );
        return [...rest, ...snapshot];
      });
      const msg =
        err instanceof Error ? err.message : "Gagal menyimpan perpindahan.";
      setErrorBanner(msg);
      onPersistError(msg);
    } finally {
      setSavingId(null);
    }
  };

  const onDragCancel = () => {
    setActiveId(null);
  };

  const activeIssue = activeId
    ? topLevel.find((i) => i.id === activeId)
    : null;

  const configured = Boolean(getBrowserSupabaseClient());

  return (
    <div className="space-y-3">
      {!configured && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Pengaturan koneksi data belum siap - fitur drag sementara dinonaktifkan.
        </p>
      )}
      {errorBanner && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {errorBanner}
        </p>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {statuses.map((st) => {
            const columnIssues = topLevel
              .filter((i) => i.status_id === st.id)
              .sort((a, b) => a.sort_order - b.sort_order);
            return (
              <KanbanColumn
                key={st.id}
                id={colId(st.id)}
                statusId={st.id}
                title={st.name}
                subtitle={st.category.replace("_", " ")}
              >
                {columnIssues.map((issue) => (
                  <KanbanCard
                    key={issue.id}
                    issue={issue}
                    disabled={!configured || savingId !== null}
                    saving={savingId === issue.id}
                    onOpen={() => onSelectIssue(issue.id)}
                  />
                ))}
              </KanbanColumn>
            );
          })}
          <KanbanColumn
            id={colId(null)}
            statusId={null}
            title="Tanpa status"
            subtitle="belum ditetapkan"
            dashed
          >
            {topLevel
              .filter((i) => i.status_id == null)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((issue) => (
                <KanbanCard
                  key={issue.id}
                  issue={issue}
                  disabled={!configured || savingId !== null}
                  saving={savingId === issue.id}
                  onOpen={() => onSelectIssue(issue.id)}
                />
              ))}
          </KanbanColumn>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeIssue ? <CardPreview issue={activeIssue} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
