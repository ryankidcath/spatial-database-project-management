import type { SupabaseClient } from "@supabase/supabase-js";
import {
  barByGroupCounts,
  bucketStatus,
  statusPieCounts,
  type StatusBucket,
} from "@/app/virtual-dashboard-lib";
import type { VirtualDataRow } from "@/app/virtual-table-types";
import { resolveVirtualColumnSlug } from "@/lib/dashboard-column-resolve";
import {
  dashboardBarByGroupKey,
  type DashboardBarByGroupRow,
  type DashboardColumnSeriesSpec,
  type DashboardStatusPieCounts,
  type DashboardValueCountRow,
} from "@/lib/dashboard-table-bundle";

const DASHBOARD_AGGREGATE_MAX_ROWS = 10_000;

type PayloadValueCountRow = {
  value_text: string;
  row_count: number;
};

type GroupStatusCountRow = {
  group_label: string;
  match_count: number;
  total_count: number;
};

type VirtualColumnMeta = { slug: string; display_name: string; data_type?: string };

function countsAreEmpty(c: DashboardStatusPieCounts): boolean {
  return c.todo + c.inProgress + c.done + c.other === 0;
}

export async function fetchVirtualRowsForDashboardAggregate(
  supabase: SupabaseClient,
  tableId: string,
  maxRows = DASHBOARD_AGGREGATE_MAX_ROWS
): Promise<{ rows: VirtualDataRow[]; error: string | null }> {
  const pageSize = 1000;
  let from = 0;
  const all: VirtualDataRow[] = [];

  while (from < maxRows) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await supabase
      .schema("core_pm")
      .from("virtual_rows")
      .select("id, table_id, payload, sort_order, created_by, created_at, updated_at")
      .eq("table_id", tableId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) return { rows: all, error: error.message };

    const batch = (data ?? []) as VirtualDataRow[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { rows: all, error: null };
}

function bucketPayloadValue(val: unknown): StatusBucket {
  if (Array.isArray(val)) {
    if (val.length === 0) return bucketStatus(undefined);
    return bucketStatus(val[0]);
  }
  if (typeof val === "string" && val.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(val) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return bucketStatus(parsed[0]);
      }
    } catch {
      /* fall through */
    }
  }
  return bucketStatus(val);
}

export function statusPieCountsFromValueCounts(
  valueCounts: PayloadValueCountRow[]
): DashboardStatusPieCounts {
  const out: DashboardStatusPieCounts = {
    todo: 0,
    inProgress: 0,
    done: 0,
    other: 0,
  };

  for (const row of valueCounts) {
    const n = Number(row.row_count) || 0;
    if (n <= 0) continue;
    const bucket = bucketPayloadValue(row.value_text);
    if (bucket === "todo") out.todo += n;
    else if (bucket === "in_progress") out.inProgress += n;
    else if (bucket === "done") out.done += n;
    else out.other += n;
  }

  return out;
}

export async function fetchDashboardPayloadValueCounts(
  supabase: SupabaseClient,
  tableId: string,
  columnSlug: string,
  filters: { column: string; value: string }[] = []
): Promise<{ rows: PayloadValueCountRow[]; error: string | null }> {
  const { data, error } = await supabase.schema("core_pm").rpc(
    "dashboard_payload_value_counts",
    {
      p_table_id: tableId,
      p_column_slug: columnSlug,
      p_filters: filters,
    }
  );

  if (error) return { rows: [], error: error.message };

  return {
    rows: ((data ?? []) as PayloadValueCountRow[]).map((r) => ({
      value_text: String(r.value_text ?? ""),
      row_count: Number(r.row_count) || 0,
    })),
    error: null,
  };
}

export function valueCountsToDistribution(
  rows: PayloadValueCountRow[]
): DashboardValueCountRow[] {
  return rows
    .filter((r) => Number(r.row_count) > 0)
    .map((r) => ({
      label: r.value_text || "—",
      count: Number(r.row_count) || 0,
    }));
}

export async function fetchDashboardDistinctCount(
  supabase: SupabaseClient,
  tableId: string,
  columnSlug: string,
  filters: { column: string; value: string }[] = []
): Promise<{ count: number; error: string | null }> {
  const { data, error } = await supabase.schema("core_pm").rpc(
    "dashboard_distinct_count",
    {
      p_table_id: tableId,
      p_column_slug: columnSlug,
      p_filters: filters,
    }
  );
  if (error) return { count: 0, error: error.message };
  return { count: Number(data) || 0, error: null };
}

export async function fetchDashboardSumColumn(
  supabase: SupabaseClient,
  tableId: string,
  columnSlug: string,
  filters: { column: string; value: string }[] = []
): Promise<{ sum: number; error: string | null }> {
  const { data, error } = await supabase.schema("core_pm").rpc(
    "dashboard_sum_column",
    {
      p_table_id: tableId,
      p_column_slug: columnSlug,
      p_filters: filters,
    }
  );
  if (error) return { sum: 0, error: error.message };
  return { sum: Number(data) || 0, error: null };
}

export async function fetchDashboardValueDistributionByColumn(
  supabase: SupabaseClient,
  tableId: string,
  columns: string[],
  columnMeta: VirtualColumnMeta[] = [],
  filters: { column: string; value: string }[] = []
): Promise<{
  byColumn: Record<string, DashboardValueCountRow[]>;
  error: string | null;
}> {
  const byColumn: Record<string, DashboardValueCountRow[]> = {};

  for (const col of columns) {
    const slug = resolveVirtualColumnSlug(columnMeta, col);
    const res = await fetchDashboardPayloadValueCounts(
      supabase,
      tableId,
      slug,
      filters
    );
    if (res.error) return { byColumn: {}, error: res.error };
    const dist = valueCountsToDistribution(res.rows);
    byColumn[slug] = dist;
    if (slug !== col) byColumn[col] = dist;
  }

  return { byColumn, error: null };
}

export async function fetchDashboardGroupStatusCounts(
  supabase: SupabaseClient,
  tableId: string,
  groupColumn: string,
  statusColumn: string,
  countWhen: string,
  filters: { column: string; value: string }[] = []
): Promise<{ rows: DashboardBarByGroupRow[]; error: string | null }> {
  const { data, error } = await supabase.schema("core_pm").rpc(
    "dashboard_group_status_counts",
    {
      p_table_id: tableId,
      p_group_column: groupColumn,
      p_status_column: statusColumn,
      p_match_value: countWhen,
      p_filters: filters,
    }
  );

  if (error) return { rows: [], error: error.message };

  return {
    rows: ((data ?? []) as GroupStatusCountRow[]).map((r) => ({
      label: String(r.group_label ?? "—"),
      count: Number(r.match_count) || 0,
      total: Number(r.total_count) || 0,
    })),
    error: null,
  };
}

function columnMetaFor(
  columnMeta: VirtualColumnMeta[],
  slug: string
): VirtualColumnMeta | undefined {
  return columnMeta.find((c) => c.slug === slug);
}

function rowMatchesColumnSeriesItem(
  payload: Record<string, unknown>,
  slug: string,
  matchValue: string | undefined,
  dataType: string | undefined
): boolean {
  const raw = payload[slug];
  if (matchValue != null && matchValue.trim() !== "") {
    return String(raw ?? "").trim() === matchValue.trim();
  }
  if (dataType === "checkbox") {
    return raw === true || raw === "true" || raw === 1 || raw === "1";
  }
  if (raw == null || raw === "") return false;
  if (Array.isArray(raw)) return raw.length > 0;
  return String(raw).trim() !== "";
}

/** Hitung satu segmen per kolom (tahap paralel / model Excel). */
export async function fetchDashboardColumnSeriesByWidget(
  supabase: SupabaseClient,
  tableId: string,
  specs: DashboardColumnSeriesSpec[],
  columnMeta: VirtualColumnMeta[] = [],
  filters: { column: string; value: string }[] = []
): Promise<{
  byWidgetId: Record<string, DashboardValueCountRow[]>;
  error: string | null;
}> {
  const byWidgetId: Record<string, DashboardValueCountRow[]> = {};
  if (specs.length === 0) return { byWidgetId, error: null };

  const { rows, error: rowsErr } = await fetchVirtualRowsForDashboardAggregate(
    supabase,
    tableId
  );
  if (rowsErr) return { byWidgetId: {}, error: rowsErr };

  const filtered =
    filters.length === 0
      ? rows
      : rows.filter((row) => {
          const payload = (row.payload ?? {}) as Record<string, unknown>;
          return filters.every((f) => {
            const slug = resolveVirtualColumnSlug(columnMeta, f.column);
            return String(payload[slug] ?? "").trim() === f.value.trim();
          });
        });

  for (const spec of specs) {
    const segments: DashboardValueCountRow[] = [];
    for (const item of spec.series) {
      const slug = resolveVirtualColumnSlug(columnMeta, item.column);
      const meta = columnMetaFor(columnMeta, slug);
      const label =
        item.label?.trim() ||
        meta?.display_name ||
        item.column;
      const n = filtered.filter((row) =>
        rowMatchesColumnSeriesItem(
          (row.payload ?? {}) as Record<string, unknown>,
          slug,
          item.match_value,
          meta?.data_type
        )
      ).length;
      segments.push({ label, count: n });
    }
    byWidgetId[spec.widgetId] = segments;
  }

  return { byWidgetId, error: null };
}

export async function fetchDashboardStatusPieByColumn(
  supabase: SupabaseClient,
  tableId: string,
  columns: string[],
  columnMeta: VirtualColumnMeta[] = [],
  filters: { column: string; value: string }[] = []
): Promise<{
  byColumn: Record<string, DashboardStatusPieCounts>;
  error: string | null;
}> {
  const byColumn: Record<string, DashboardStatusPieCounts> = {};
  let rpcFailed = false;
  let lastRpcError: string | null = null;

  const resolvedColumns = columns.map((col) => ({
    requested: col,
    slug: resolveVirtualColumnSlug(columnMeta, col),
  }));

  for (const { requested, slug } of resolvedColumns) {
    const res = await fetchDashboardPayloadValueCounts(
      supabase,
      tableId,
      slug,
      filters
    );
    if (res.error) {
      rpcFailed = true;
      lastRpcError = res.error;
      continue;
    }
    const counts = statusPieCountsFromValueCounts(res.rows);
    byColumn[slug] = counts;
    if (slug !== requested) byColumn[requested] = counts;
  }

  const needsFallback =
    rpcFailed ||
    resolvedColumns.some(({ slug }) => {
      const c = byColumn[slug];
      return !c || countsAreEmpty(c);
    });

  if (!needsFallback) {
    return { byColumn, error: null };
  }

  const { rows, error: rowsErr } = await fetchVirtualRowsForDashboardAggregate(
    supabase,
    tableId
  );
  if (rowsErr) {
    return { byColumn, error: lastRpcError ?? rowsErr };
  }
  if (rows.length === 0) {
    return { byColumn, error: null };
  }

  for (const { requested, slug } of resolvedColumns) {
    const counts = statusPieCounts(rows, slug);
    byColumn[slug] = counts;
    if (slug !== requested) byColumn[requested] = counts;
  }

  return { byColumn, error: null };
}

export async function fetchDashboardBarByGroupByKey(
  supabase: SupabaseClient,
  tableId: string,
  specs: Array<{
    groupColumn: string;
    statusColumn: string;
    countWhen: string;
  }>,
  columnMeta: VirtualColumnMeta[] = [],
  filters: { column: string; value: string }[] = []
): Promise<{
  byKey: Record<string, DashboardBarByGroupRow[]>;
  error: string | null;
}> {
  const byKey: Record<string, DashboardBarByGroupRow[]> = {};
  let rpcFailed = false;
  let lastRpcError: string | null = null;

  const resolvedSpecs = specs.map((spec) => ({
    spec,
    groupSlug: resolveVirtualColumnSlug(columnMeta, spec.groupColumn),
    statusSlug: resolveVirtualColumnSlug(columnMeta, spec.statusColumn),
  }));

  for (const { spec, groupSlug, statusSlug } of resolvedSpecs) {
    const key = dashboardBarByGroupKey(
      spec.groupColumn,
      spec.statusColumn,
      spec.countWhen
    );
    const res = await fetchDashboardGroupStatusCounts(
      supabase,
      tableId,
      groupSlug,
      statusSlug,
      spec.countWhen,
      filters
    );
    if (res.error) {
      rpcFailed = true;
      lastRpcError = res.error;
      continue;
    }
    byKey[key] = res.rows;
  }

  if (!rpcFailed && resolvedSpecs.every(({ spec }) => {
    const key = dashboardBarByGroupKey(
      spec.groupColumn,
      spec.statusColumn,
      spec.countWhen
    );
    return (byKey[key]?.length ?? 0) > 0;
  })) {
    return { byKey, error: null };
  }

  const { rows, error: rowsErr } = await fetchVirtualRowsForDashboardAggregate(
    supabase,
    tableId
  );
  if (rowsErr) {
    return { byKey, error: lastRpcError ?? rowsErr };
  }

  for (const { spec, groupSlug, statusSlug } of resolvedSpecs) {
    const key = dashboardBarByGroupKey(
      spec.groupColumn,
      spec.statusColumn,
      spec.countWhen
    );
    byKey[key] = barByGroupCounts(
      rows,
      groupSlug,
      statusSlug,
      spec.countWhen
    );
  }

  return { byKey, error: null };
}
