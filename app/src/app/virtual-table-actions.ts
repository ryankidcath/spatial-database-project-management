"use server";

import { revalidatePath } from "next/cache";
import { parseSimpleCsv } from "@/lib/csv-parse";
import {
  MAX_VIRTUAL_TABLE_BULK_DELETE_ROWS,
  MAX_VIRTUAL_TABLE_CSV_CHARS,
  MAX_VIRTUAL_TABLE_CSV_ROWS,
  VIRTUAL_TABLE_CSV_IMPORTABLE_TYPES,
} from "@/lib/virtual-table-import-limits";
import {
  defaultTitleFromFeature,
  extractMatchKeyFromProperties,
  featureToStoredGeometry,
  featureToStoredPointGeometry,
  featureToStoredLineGeometry,
  geoProp,
  mapPropertiesToPayload,
  normalizeVirtualTableMatchKey,
  parseFeatureCollectionForLineImport,
  parseFeatureCollectionForPointImport,
  parseFeatureCollectionForVirtualImport,
} from "@/lib/virtual-table-geojson-import";
import {
  MAX_SPATIAL_GEOMETRY_TEXT_CHARS,
  spatialGeometryTextTooLargeMessage,
} from "@/lib/spatial-import-limits";
import {
  buildCompositeKecamatanTitleIndex,
  buildRelationLookupIndex,
  relationLookupSlugFromConfig,
  resolveCompositeKecamatanTitle,
  resolveRelationIdFromCsv,
  type CompositeKecamatanTitleIndex,
  type RelationLookupIndex,
} from "@/lib/virtual-table-relation-import";
import { relationIdsFromPayload } from "@/lib/virtual-table-find-on-map";
import {
  buildVirtualColumnsByTableId,
  pickFindOnMapRelationPath,
} from "@/lib/virtual-table-find-on-map";
import {
  applyInboundGeomRelationLinks,
  buildInboundGeomRelationSpecs,
  type InboundGeomRelationSpec,
} from "@/lib/virtual-table-geom-inbound-link";
import type {
  Entity360Section,
  Entity360SectionRow,
} from "@/lib/virtual-table-entity-360";
import { applyEntity360PanelProfile } from "@/lib/virtual-table-entity-360";
import type {
  RelationTraceEndpoint,
  RelationTraceTarget,
} from "@/lib/workspace-map-relation-trace";
import { parseProjectEntity360Profile } from "@/lib/project-entity-360-profile";
import {
  buildDxfPolygonizeOptionsFromForm,
  extractClosedPolygonRingsFromDxfLayer,
  extractOpenLineStringsFromDxfLayer,
  extractPointsFromDxfLayer,
  extractPolygonRingsFromDxfLayer,
  parseDxfDocument,
  parseDxfGeometryMode,
} from "@/lib/dxf-import-utils";
import { isPreviewSourceSridSupported } from "@/lib/crs-reproject";
import {
  buildVirtualTableDxfFeatureCollection,
  buildVirtualTableDxfLineStringFeatureCollection,
  buildVirtualTableDxfPointFeatureCollection,
  parseVirtualTableDxfSourceSrid,
} from "@/lib/virtual-table-dxf-import";
import {
  buildBidangPolygonsFromPoints,
  parseFieldPointsCsv,
  parseSurveyPointsCsv,
  type FieldPointsImportColumnMap,
  type PointsImportColumnMap,
} from "@/lib/points-to-polygon-import";
import {
  buildDrawnBidangGeoJsonFeature,
  validateDrawnBidangRing,
  type LatLngPoint,
} from "@/lib/workspace-map-draw-bidang";
import {
  buildDrawnLineGeoJsonFeature,
  validateDrawnLine,
} from "@/lib/workspace-map-draw-line";
import {
  geometryKindFromStored,
} from "@/lib/workspace-map-translate-geom";
import {
  buildVirtualTablePointsFeatureCollection,
  parseVirtualTablePointsSourceSrid,
} from "@/lib/virtual-table-points-import";
import {
  buildFieldPointsArchiveFeatureCollection,
  buildSurveyPointsArchiveFeatureCollection,
  parseSurveyPointsArchiveSourceSrid,
} from "@/lib/virtual-table-survey-points-archive";
import {
  SURVEY_POINT_COLUMN_DEFS,
  SURVEY_POINT_GEOM_SLUG,
  SURVEY_POINT_MATCH_COLUMN_SLUG,
  defaultFieldPointTableName,
  defaultSurveyPointTableName,
} from "@/lib/virtual-table-survey-points-bootstrap";
import {
  buildPolygonRingFromArchivedPoints,
  groupArchivedPointsByBidang,
  type ArchivedSurveyPointRow,
} from "@/lib/regenerate-bidang-from-survey-points";
import {
  LAYER_COLUMN_DEFS,
  LAYER_GEOMETRY_COLUMN_SLUG,
  LAYER_MATCH_COLUMN_SLUG,
} from "@/lib/virtual-table-layer-bootstrap";
import {
  defaultWorkbenchLayerTableName,
  parseWorkbenchLayerKind,
  WORKBENCH_LAYER_KIND_ICONS,
  workbenchLayerColumnDefs,
  type WorkbenchLayerKind,
} from "@/lib/virtual-table-workbench-layer-bootstrap";
import {
  buildImportFeatureCollectionForMappingRow,
  geometryColumnSlugForSplitTarget,
  geometryKindForSplitTarget,
  matchColumnSlugForSplitTarget,
  parseDxfSplitImportPayload,
  type DxfSplitMappingRow,
  type DxfSplitTargetKind,
  workbenchKindFromSplitTarget,
} from "@/lib/dxf-split-import";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeOrgAuditLog, writeProjectAuditLog } from "./audit-log-actions";
import { dispatchWorkspaceNotification } from "./workspace-notification-dispatch";
import {
  cellValuesEqual,
  formatCellValueForNotification,
  notifyVirtualTableMembers,
  resolveVirtualTableScope,
  rowLabelFromPayload,
  writeVirtualTableAuditLog,
} from "./workspace-notification-helpers";

type ActionResult = { error: string | null };
type CreateTableResult = { error: string | null; tableId: string | null };

const MAX_GEOJSON_DESA_TARGET_ROWS = 15000;

function bidangUpsertStorageKey(
  desaRelationSlug: string | null,
  desaRowId: string | null | undefined,
  matchNorm: string
): string {
  if (desaRelationSlug && desaRowId && String(desaRowId).trim()) {
    return `${String(desaRowId).trim().toLowerCase()}::${matchNorm}`;
  }
  return matchNorm;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "t$1") // slug must start with letter
    .slice(0, 48);
}

function uniqueColumnSlugForTable(
  existingSlugs: Set<string>,
  baseSlug: string,
  excludeSlug?: string
): string {
  let finalSlug = baseSlug;
  let suffix = 2;
  while (
    existingSlugs.has(finalSlug) &&
    (excludeSlug == null || finalSlug !== excludeSlug)
  ) {
    finalSlug = `${baseSlug}_${suffix}`;
    suffix++;
  }
  return finalSlug;
}

function remapSlugInViewConfig(
  config: Record<string, unknown>,
  oldSlug: string,
  newSlug: string
): Record<string, unknown> {
  if (oldSlug === newSlug) return config;

  const filters = Array.isArray(config.filters)
    ? (config.filters as { column?: string }[]).map((f) =>
        f.column === oldSlug ? { ...f, column: newSlug } : f
      )
    : [];

  const sorts = Array.isArray(config.sorts)
    ? (config.sorts as { column?: string }[]).map((s) =>
        s.column === oldSlug ? { ...s, column: newSlug } : s
      )
    : [];

  const groupBy =
    config.groupBy === oldSlug ? newSlug : (config.groupBy as string | null);

  const visibleColumns = Array.isArray(config.visibleColumns)
    ? (config.visibleColumns as string[]).map((c) => (c === oldSlug ? newSlug : c))
    : [];

  const columnWidthsRaw = config.columnWidths;
  const columnWidths: Record<string, number> = {};
  if (columnWidthsRaw && typeof columnWidthsRaw === "object") {
    for (const [k, v] of Object.entries(
      columnWidthsRaw as Record<string, number>
    )) {
      columnWidths[k === oldSlug ? newSlug : k] = v;
    }
  }

  return {
    ...config,
    filters,
    sorts,
    groupBy,
    visibleColumns,
    columnWidths,
  };
}

async function migrateVirtualColumnSlug(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  tableId: string,
  oldSlug: string,
  newSlug: string
): Promise<{ rowsUpdated: number; error: string | null }> {
  if (oldSlug === newSlug) return { rowsUpdated: 0, error: null };

  const { data: rows, error: rowsErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, payload")
    .eq("table_id", tableId)
    .is("deleted_at", null);

  if (rowsErr) return { rowsUpdated: 0, error: rowsErr.message };

  let rowsUpdated = 0;
  const typedRows = (rows ?? []) as {
    id: string;
    payload: Record<string, unknown> | null;
  }[];

  for (const row of typedRows) {
    const payload = row.payload ?? {};
    if (!(oldSlug in payload)) continue;
    const newPayload = { ...payload };
    if (newSlug in newPayload && newPayload[newSlug] !== newPayload[oldSlug]) {
      return {
        rowsUpdated: 0,
        error: `Baris ${row.id.slice(0, 8)} sudah punya kolom "${newSlug}" — migrasi slug dibatalkan`,
      };
    }
    newPayload[newSlug] = newPayload[oldSlug];
    delete newPayload[oldSlug];
    const { error: upErr } = await supabase
      .schema("core_pm")
      .from("virtual_rows")
      .update({
        payload: newPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upErr) return { rowsUpdated, error: upErr.message };
    rowsUpdated++;
  }

  const { data: views, error: viewsErr } = await supabase
    .schema("core_pm")
    .from("virtual_views")
    .select("id, config")
    .eq("table_id", tableId);

  if (viewsErr) return { rowsUpdated, error: viewsErr.message };

  for (const view of views ?? []) {
    const v = view as { id: string; config: Record<string, unknown> | null };
    const cfg = v.config ?? {};
    const next = remapSlugInViewConfig(cfg, oldSlug, newSlug);
    const { error: viewErr } = await supabase
      .schema("core_pm")
      .from("virtual_views")
      .update({ config: next, updated_at: new Date().toISOString() })
      .eq("id", v.id);
    if (viewErr) return { rowsUpdated, error: viewErr.message };
  }

  const { data: allRelationCols, error: relColErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("id, config")
    .eq("data_type", "relation");

  if (relColErr) return { rowsUpdated, error: relColErr.message };

  for (const col of allRelationCols ?? []) {
    const c = col as { id: string; config: Record<string, unknown> | null };
    const cfg = c.config ?? {};
    if (cfg.target_table_id !== tableId) continue;
    if (relationLookupSlugFromConfig(cfg) !== oldSlug) continue;
    const nextConfig = { ...cfg, lookup_slug: newSlug };
    const { error: relUpErr } = await supabase
      .schema("core_pm")
      .from("virtual_columns")
      .update({ config: nextConfig, updated_at: new Date().toISOString() })
      .eq("id", c.id);
    if (relUpErr) return { rowsUpdated, error: relUpErr.message };
  }

  return { rowsUpdated, error: null };
}

const VALID_DATA_TYPES = new Set([
  "text",
  "number",
  "date",
  "select",
  "checkbox",
  "url",
  "user",
  "file",
  "relation",
  "geometry",
]);

// ---------------------------------------------------------------------------
// Virtual Tables
// ---------------------------------------------------------------------------

export async function createVirtualTableAction(
  formData: FormData
): Promise<CreateTableResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", tableId: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", tableId: null };

  const projectId = String(formData.get("project_id") ?? "").trim() || null;
  const organizationId = String(formData.get("organization_id") ?? "").trim() || null;
  const displayName = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const icon = String(formData.get("icon") ?? "").trim() || null;

  if (!projectId && !organizationId) return { error: "project_id atau organization_id harus diisi", tableId: null };
  if (projectId && organizationId) return { error: "Hanya boleh salah satu: project_id atau organization_id", tableId: null };
  if (!displayName) return { error: "Nama tabel tidak boleh kosong", tableId: null };

  const baseSlug = slugify(displayName);
  if (!baseSlug) return { error: "Nama tabel tidak valid untuk slug", tableId: null };

  // Deduplicate slug within the scope
  const scopeQuery = supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("slug")
    .is("deleted_at", null)
    .like("slug", `${baseSlug}%`);

  if (projectId) scopeQuery.eq("project_id", projectId);
  else scopeQuery.eq("organization_id", organizationId!);

  const { data: existing } = await scopeQuery;

  const existingSlugs = new Set((existing ?? []).map((r: { slug: string }) => r.slug));
  let slug = baseSlug;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}_${suffix}`;
    suffix++;
  }

  // Get next sort_order
  let sortQuery = supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("sort_order")
    .is("deleted_at", null);

  if (projectId) sortQuery = sortQuery.eq("project_id", projectId);
  else sortQuery = sortQuery.eq("organization_id", organizationId!);

  const { data: maxSort } = await sortQuery
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = ((maxSort as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const insertData: Record<string, unknown> = {
    slug,
    display_name: displayName,
    description,
    icon,
    sort_order: nextSortOrder,
    created_by: user.id,
  };
  if (projectId) insertData.project_id = projectId;
  else insertData.organization_id = organizationId;

  const { data: table, error: tableErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .insert(insertData)
    .select("id")
    .single();

  if (tableErr) return { error: tableErr.message, tableId: null };
  const tableId = (table as { id: string }).id;

  // Auto-create default "Title" column
  const { error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .insert({
      table_id: tableId,
      slug: "title",
      display_name: "Title",
      data_type: "text",
      position: 0,
      is_required: true,
    });

  if (colErr) return { error: colErr.message, tableId };

  if (projectId) {
    const { data: projectRow } = await supabase
      .schema("core_pm")
      .from("projects")
      .select("organization_id")
      .eq("id", projectId)
      .maybeSingle();
    const orgId =
      projectRow && typeof projectRow.organization_id === "string"
        ? projectRow.organization_id
        : null;
    await writeProjectAuditLog(supabase, {
      projectId,
      actorUserId: user.id,
      action: "virtual_table.create",
      entity: "core_pm.virtual_tables",
      entityId: tableId,
      payload: { display_name: displayName, slug, scope: "project" },
    });
    if (orgId) {
      await dispatchWorkspaceNotification(supabase, {
        preferenceCategory: "schema_changes",
        kind: "virtual_table",
        organizationId: orgId,
        projectId,
        actorUserId: user.id,
        title: `Tabel ${displayName} dibuat`,
        payload: {
          event_id: "vtable.created",
          virtual_table_id: tableId,
          table_display_name: displayName,
        },
      });
    }
  } else if (organizationId) {
    await writeOrgAuditLog(supabase, {
      organizationId,
      actorUserId: user.id,
      action: "virtual_table.create",
      entity: "core_pm.virtual_tables",
      entityId: tableId,
      payload: { display_name: displayName, slug, scope: "organization" },
    });
    await dispatchWorkspaceNotification(supabase, {
      preferenceCategory: "schema_changes",
      kind: "virtual_table",
      organizationId,
      projectId: null,
      actorUserId: user.id,
      title: `Tabel ${displayName} dibuat`,
      payload: {
        event_id: "vtable.created",
        virtual_table_id: tableId,
        table_display_name: displayName,
      },
    });
  }

  revalidatePath("/", "layout");
  return { error: null, tableId };
}

export async function updateVirtualTableAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const tableId = String(formData.get("table_id") ?? "").trim();
  if (!tableId) return { error: "table_id kosong" };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const displayName = formData.get("display_name");
  if (displayName != null) {
    const name = String(displayName).trim();
    if (!name) return { error: "Nama tabel tidak boleh kosong" };
    updates.display_name = name;
  }
  if (formData.has("description")) {
    updates.description = String(formData.get("description") ?? "").trim() || null;
  }
  if (formData.has("icon")) {
    updates.icon = String(formData.get("icon") ?? "").trim() || null;
  }

  const shouldNotifyUpdate =
    "display_name" in updates || "description" in updates;

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .update(updates)
    .eq("id", tableId)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");

  const scope = await resolveVirtualTableScope(supabase, tableId);
  if (scope && shouldNotifyUpdate) {
    const updatedDisplayName =
      typeof updates.display_name === "string"
        ? updates.display_name
        : scope.displayName;
    await writeVirtualTableAuditLog(supabase, scope, {
      actorUserId: user.id,
      action: "virtual_table.update",
      entity: "core_pm.virtual_tables",
      entityId: tableId,
      payload: { display_name: updatedDisplayName },
    });
    await notifyVirtualTableMembers(supabase, scope, user.id, {
      preferenceCategory: "schema_changes",
      kind: "virtual_table",
      title: `Tabel ${updatedDisplayName} diperbarui`,
      payload: { event_id: "vtable.updated" },
    });
  }

  return { error: null };
}

export async function deleteVirtualTableAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const tableId = String(formData.get("table_id") ?? "").trim();
  if (!tableId) return { error: "table_id kosong" };

  // Fetch project_id for audit log before soft-delete
  const { data: tbl } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("project_id, organization_id, display_name")
    .eq("id", tableId)
    .is("deleted_at", null)
    .maybeSingle();

  const { error } = await supabase.schema("core_pm").rpc("soft_delete_virtual_table", {
    p_table_id: tableId,
  });

  if (error) return { error: error.message };

  if (tbl) {
    const t = tbl as {
      project_id: string | null;
      organization_id: string | null;
      display_name: string;
    };
    if (t.project_id) {
      const { data: projectRow } = await supabase
        .schema("core_pm")
        .from("projects")
        .select("organization_id")
        .eq("id", t.project_id)
        .maybeSingle();
      const orgId =
        projectRow && typeof projectRow.organization_id === "string"
          ? projectRow.organization_id
          : null;
      await writeProjectAuditLog(supabase, {
        projectId: t.project_id,
        actorUserId: user.id,
        action: "virtual_table.delete",
        entity: "core_pm.virtual_tables",
        entityId: tableId,
        payload: { display_name: t.display_name },
      });
      if (orgId) {
        await dispatchWorkspaceNotification(supabase, {
          preferenceCategory: "schema_changes",
          kind: "virtual_table",
          organizationId: orgId,
          projectId: t.project_id,
          actorUserId: user.id,
          title: `Tabel ${t.display_name} dihapus`,
          payload: {
            event_id: "vtable.deleted",
            virtual_table_id: tableId,
            table_display_name: t.display_name,
          },
        });
      }
    } else if (t.organization_id) {
      await writeOrgAuditLog(supabase, {
        organizationId: t.organization_id,
        actorUserId: user.id,
        action: "virtual_table.delete",
        entity: "core_pm.virtual_tables",
        entityId: tableId,
        payload: { display_name: t.display_name },
      });
      await dispatchWorkspaceNotification(supabase, {
        preferenceCategory: "schema_changes",
        kind: "virtual_table",
        organizationId: t.organization_id,
        projectId: null,
        actorUserId: user.id,
        title: `Tabel ${t.display_name} dihapus`,
        payload: {
          event_id: "vtable.deleted",
          virtual_table_id: tableId,
          table_display_name: t.display_name,
        },
      });
    }
  }

  revalidatePath("/", "layout");
  return { error: null };
}

// ---------------------------------------------------------------------------
// Virtual Columns
// ---------------------------------------------------------------------------

export async function addVirtualColumnAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const tableId = String(formData.get("table_id") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const dataType = String(formData.get("data_type") ?? "").trim();
  const isRequired = formData.get("is_required") === "true";
  const configRaw = String(formData.get("config") ?? "{}").trim();

  if (!tableId) return { error: "table_id kosong" };
  if (!displayName) return { error: "Nama kolom tidak boleh kosong" };
  if (!VALID_DATA_TYPES.has(dataType)) return { error: `Tipe data tidak valid: ${dataType}` };

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(configRaw);
  } catch {
    return { error: "Config bukan JSON valid" };
  }

  const slug = slugify(displayName);
  if (!slug) return { error: "Nama kolom tidak valid untuk slug" };

  // Check slug uniqueness within the table
  const { data: existingCols } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug")
    .eq("table_id", tableId);

  const existingSlugs = new Set((existingCols ?? []).map((r: { slug: string }) => r.slug));
  const finalSlug = uniqueColumnSlugForTable(existingSlugs, slug);

  // Get next position
  const { data: maxPos } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("position")
    .eq("table_id", tableId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = ((maxPos as { position: number } | null)?.position ?? -1) + 1;

  const { data: insertedCol, error } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .insert({
      table_id: tableId,
      slug: finalSlug,
      display_name: displayName,
      data_type: dataType,
      position: nextPosition,
      is_required: isRequired,
      config,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const columnId = (insertedCol as { id: string }).id;
  const scope = await resolveVirtualTableScope(supabase, tableId);
  if (scope) {
    await writeVirtualTableAuditLog(supabase, scope, {
      actorUserId: user.id,
      action: "virtual_column.create",
      entity: "core_pm.virtual_columns",
      entityId: columnId,
      payload: {
        display_name: displayName,
        slug: finalSlug,
        data_type: dataType,
        table_display_name: scope.displayName,
      },
    });
    await notifyVirtualTableMembers(supabase, scope, user.id, {
      preferenceCategory: "schema_changes",
      kind: "virtual_column",
      title: `Kolom ${displayName} ditambahkan di ${scope.displayName}`,
      payload: {
        event_id: "vcolumn.created",
        virtual_column_id: columnId,
        column_slug: finalSlug,
        column_display_name: displayName,
      },
    });
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export type UpdateVirtualColumnResult = {
  error: string | null;
  /** Slug berubah karena rename nama tampilan; data baris dimigrasikan. */
  slugChanged?: boolean;
  oldSlug?: string;
  newSlug?: string;
  rowsUpdated?: number;
};

export async function updateVirtualColumnAction(
  formData: FormData
): Promise<UpdateVirtualColumnResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const columnId = String(formData.get("column_id") ?? "").trim();
  if (!columnId) return { error: "column_id kosong" };

  const { data: colRow, error: colFetchErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("id, table_id, slug, display_name")
    .eq("id", columnId)
    .maybeSingle();

  if (colFetchErr) return { error: colFetchErr.message };
  if (!colRow) return { error: "Kolom tidak ditemukan" };

  const col = colRow as {
    id: string;
    table_id: string;
    slug: string;
    display_name: string;
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  let slugChanged = false;
  let oldSlug = col.slug;
  let newSlug = col.slug;
  let rowsUpdated = 0;

  const displayName = formData.get("display_name");
  if (displayName != null) {
    const name = String(displayName).trim();
    if (!name) return { error: "Nama kolom tidak boleh kosong" };
    updates.display_name = name;

    const baseSlug = slugify(name);
    if (!baseSlug) {
      return { error: "Nama kolom tidak valid untuk slug (gunakan huruf/angka)" };
    }

    if (baseSlug !== col.slug) {
      const { data: siblings, error: sibErr } = await supabase
        .schema("core_pm")
        .from("virtual_columns")
        .select("slug")
        .eq("table_id", col.table_id);

      if (sibErr) return { error: sibErr.message };

      const existingSlugs = new Set(
        (siblings ?? []).map((r: { slug: string }) => r.slug)
      );
      const finalSlug = uniqueColumnSlugForTable(
        existingSlugs,
        baseSlug,
        col.slug
      );

      const mig = await migrateVirtualColumnSlug(
        supabase,
        col.table_id,
        col.slug,
        finalSlug
      );
      if (mig.error) return { error: mig.error };

      slugChanged = true;
      oldSlug = col.slug;
      newSlug = finalSlug;
      rowsUpdated = mig.rowsUpdated;
      updates.slug = finalSlug;
    }
  }

  if (formData.has("is_required")) {
    updates.is_required = formData.get("is_required") === "true";
  }

  if (formData.has("config")) {
    try {
      updates.config = JSON.parse(String(formData.get("config") ?? "{}"));
    } catch {
      return { error: "Config bukan JSON valid" };
    }
  }

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .update(updates)
    .eq("id", columnId);

  if (error) return { error: error.message };

  const scope = await resolveVirtualTableScope(supabase, col.table_id);
  if (scope) {
    const colDisplayName =
      typeof updates.display_name === "string"
        ? updates.display_name
        : col.display_name;
    await writeVirtualTableAuditLog(supabase, scope, {
      actorUserId: user.id,
      action: "virtual_column.update",
      entity: "core_pm.virtual_columns",
      entityId: columnId,
      payload: {
        display_name: colDisplayName,
        slug: slugChanged ? newSlug : col.slug,
        table_display_name: scope.displayName,
      },
    });
    await notifyVirtualTableMembers(supabase, scope, user.id, {
      preferenceCategory: "schema_changes",
      kind: "virtual_column",
      title: `Kolom ${colDisplayName} diubah di ${scope.displayName}`,
      payload: {
        event_id: "vcolumn.updated",
        virtual_column_id: columnId,
        column_slug: slugChanged ? newSlug : col.slug,
        column_display_name: colDisplayName,
      },
    });
  }

  revalidatePath("/", "layout");
  return {
    error: null,
    ...(slugChanged
      ? { slugChanged: true, oldSlug, newSlug, rowsUpdated }
      : {}),
  };
}

export async function deleteVirtualColumnAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const columnId = String(formData.get("column_id") ?? "").trim();
  if (!columnId) return { error: "column_id kosong" };

  // Get column info to remove its key from all rows
  const { data: col, error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("table_id, slug, display_name")
    .eq("id", columnId)
    .maybeSingle();

  if (colErr) return { error: colErr.message };
  if (!col) return { error: "Kolom tidak ditemukan" };

  const { table_id, slug, display_name } = col as {
    table_id: string;
    slug: string;
    display_name: string;
  };

  // Remove the key from all rows' payloads using JSONB operator
  // payload - 'key' removes the key from the object
  const { data: rows } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, payload")
    .eq("table_id", table_id)
    .is("deleted_at", null);

  if (rows && rows.length > 0) {
    for (const row of rows as { id: string; payload: Record<string, unknown> }[]) {
      if (slug in row.payload) {
        const newPayload = { ...row.payload };
        delete newPayload[slug];
        await supabase
          .schema("core_pm")
          .from("virtual_rows")
          .update({ payload: newPayload, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    }
  }

  // Delete the column definition
  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .delete()
    .eq("id", columnId);

  if (error) return { error: error.message };

  const scope = await resolveVirtualTableScope(supabase, table_id);
  if (scope) {
    await writeVirtualTableAuditLog(supabase, scope, {
      actorUserId: user.id,
      action: "virtual_column.delete",
      entity: "core_pm.virtual_columns",
      entityId: columnId,
      payload: {
        display_name,
        slug,
        table_display_name: scope.displayName,
      },
    });
    await notifyVirtualTableMembers(supabase, scope, user.id, {
      preferenceCategory: "schema_changes",
      kind: "virtual_column",
      title: `Kolom ${display_name} dihapus dari ${scope.displayName}`,
      payload: {
        event_id: "vcolumn.deleted",
        column_slug: slug,
        column_display_name: display_name,
      },
    });
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function reorderVirtualColumnsAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  // column_ids: JSON array of column IDs in desired order
  const raw = String(formData.get("column_ids") ?? "[]");
  let columnIds: string[];
  try {
    columnIds = JSON.parse(raw);
    if (!Array.isArray(columnIds)) throw new Error();
  } catch {
    return { error: "column_ids bukan JSON array valid" };
  }

  for (let i = 0; i < columnIds.length; i++) {
    const { error } = await supabase
      .schema("core_pm")
      .from("virtual_columns")
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq("id", columnIds[i]);
    if (error) return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

// ---------------------------------------------------------------------------
// Virtual Rows
// ---------------------------------------------------------------------------

function validateCellValue(
  value: unknown,
  dataType: string,
  isRequired: boolean,
  columnName: string
): string | null {
  if (value == null || value === "") {
    if (isRequired) return `${columnName} wajib diisi`;
    return null;
  }
  switch (dataType) {
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) return `${columnName} harus berupa angka`;
      break;
    }
    case "date": {
      if (typeof value !== "string" || !value.match(/^\d{4}-\d{2}-\d{2}/))
        return `${columnName} harus format tanggal (YYYY-MM-DD)`;
      break;
    }
    case "checkbox": {
      if (typeof value !== "boolean")
        return `${columnName} harus boolean`;
      break;
    }
    case "select": {
      break;
    }
    case "relation": {
      if (Array.isArray(value)) {
        for (const v of value) {
          if (typeof v !== "string")
            return `${columnName}: setiap relasi harus berupa UUID string`;
        }
      } else if (typeof value !== "string") {
        return `${columnName} harus berupa UUID string`;
      }
      break;
    }
  }
  return null;
}

export async function createVirtualRowAction(
  formData: FormData
): Promise<ActionResult & { rowId?: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const tableId = String(formData.get("table_id") ?? "").trim();
  if (!tableId) return { error: "table_id kosong" };

  let payload: Record<string, unknown> = {};
  const payloadRaw = formData.get("payload");
  if (payloadRaw) {
    try {
      payload = JSON.parse(String(payloadRaw));
    } catch {
      return { error: "payload bukan JSON valid" };
    }
  }

  // Fetch columns for validation
  const { data: columns } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type, is_required")
    .eq("table_id", tableId)
    .order("position");

  // Validate only non-empty fields on create (allow blank rows for spreadsheet-style UX)
  const hasAnyValue = Object.keys(payload).length > 0;
  if (columns && hasAnyValue) {
    for (const col of columns as {
      slug: string;
      display_name: string;
      data_type: string;
      is_required: boolean;
    }[]) {
      const err = validateCellValue(
        payload[col.slug],
        col.data_type,
        col.is_required,
        col.display_name
      );
      if (err) return { error: err };
    }
  }

  // Get next sort_order
  const { data: maxSort } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("sort_order")
    .eq("table_id", tableId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSort = ((maxSort as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .insert({
      table_id: tableId,
      payload,
      sort_order: nextSort,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message, rowId: null };

  const rowId = (inserted as { id: string } | null)?.id ?? null;
  if (rowId) {
    const scope = await resolveVirtualTableScope(supabase, tableId);
    if (scope) {
      await writeVirtualTableAuditLog(supabase, scope, {
        actorUserId: user.id,
        action: "virtual_row.create",
        entity: "core_pm.virtual_rows",
        entityId: rowId,
        payload: { table_display_name: scope.displayName },
      });
      await notifyVirtualTableMembers(supabase, scope, user.id, {
        preferenceCategory: "row_lifecycle",
        kind: "virtual_row",
        title: `Baris baru di ${scope.displayName}`,
        payload: {
          event_id: "vrow.created",
          virtual_row_id: rowId,
        },
      });
    }
  }

  return { error: null, rowId };
}

export type ImportVirtualRowsCsvResult = {
  error: string | null;
  inserted: number;
  failed: number;
  skippedEmpty: number;
  skippedDuplicates: number;
  failureSamples: string[];
  unknownHeaders: string[];
};

export type VirtualTableImportRelationHint = {
  column_slug: string;
  column_display_name: string;
  target_table_id: string;
  target_table_name: string;
  lookup_slug: string;
  target_row_count: number;
  is_multi: boolean;
};

export type VirtualTableImportContextResult = {
  error: string | null;
  relation_hints: VirtualTableImportRelationHint[];
};

/** Tipe kolom tabel target yang boleh dipakai untuk lookup impor CSV relasi. */
const RELATION_LOOKUP_COLUMN_TYPES = new Set(["text", "number", "url", "select"]);

export type RelationLookupColumnOption = {
  slug: string;
  display_name: string;
  data_type: string;
};

export async function fetchRelationLookupColumnOptionsAction(
  targetTableId: string
): Promise<{ columns: RelationLookupColumnOption[]; error: string | null }> {
  const empty = { columns: [] as RelationLookupColumnOption[] };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ...empty, error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...empty, error: "Belum masuk" };

  if (!targetTableId.trim()) return { ...empty, error: "table_id kosong" };

  const { data: columnsRaw, error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type")
    .eq("table_id", targetTableId)
    .order("position");

  if (colErr) return { ...empty, error: colErr.message };

  const columns = (columnsRaw ?? [])
    .filter((c: { data_type: string }) =>
      RELATION_LOOKUP_COLUMN_TYPES.has(c.data_type)
    )
    .map(
      (c: { slug: string; display_name: string; data_type: string }) => ({
        slug: c.slug,
        display_name: c.display_name,
        data_type: c.data_type,
      })
    );

  return { columns, error: null };
}

type RelationLookupCacheEntry = {
  index: RelationLookupIndex;
  targetTableLabel: string;
  targetRowCount: number;
};

type VirtualColumnForImport = {
  slug: string;
  display_name: string;
  data_type: string;
  is_required: boolean;
  config: Record<string, unknown>;
};

function csvDedupValuesEqual(
  importVal: unknown,
  existingVal: unknown,
  col: VirtualColumnForImport | undefined
): boolean {
  const dt = col?.data_type;
  if (dt === "number") {
    const a =
      typeof importVal === "number" ? importVal : Number(importVal);
    const b =
      typeof existingVal === "number" ? existingVal : Number(existingVal);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return a === b;
  }
  if (dt === "checkbox") {
    return Boolean(importVal) === Boolean(existingVal);
  }
  if (dt === "date") {
    const a = String(importVal ?? "").slice(0, 10);
    const b = String(existingVal ?? "").slice(0, 10);
    return a === b;
  }
  if (dt === "relation") {
    const a = String(importVal ?? "").trim().toLowerCase();
    const b = String(existingVal ?? "").trim().toLowerCase();
    return a.length > 0 && a === b;
  }
  return (
    String(importVal ?? "").trim() === String(existingVal ?? "").trim()
  );
}

/** True jika nilai di payload impor untuk setiap kolom sama dengan baris yang sudah ada (kolom lain di DB diabaikan). */
function csvImportPayloadMatchesExistingRow(
  existingPayload: Record<string, unknown>,
  importPayload: Record<string, unknown>,
  colBySlug: Map<string, VirtualColumnForImport>
): boolean {
  const keys = Object.keys(importPayload);
  if (keys.length === 0) return false;
  for (const k of keys) {
    const col = colBySlug.get(k);
    if (
      !csvDedupValuesEqual(importPayload[k], existingPayload[k], col)
    ) {
      return false;
    }
  }
  return true;
}

function csvImportPayloadBatchDedupKey(
  importPayload: Record<string, unknown>,
  colBySlug: Map<string, VirtualColumnForImport>
): string {
  const keys = Object.keys(importPayload).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const col = colBySlug.get(k);
    parts.push(k);
    parts.push("=");
    if (col?.data_type === "number") {
      const n =
        typeof importPayload[k] === "number"
          ? importPayload[k]
          : Number(importPayload[k]);
      parts.push(Number.isFinite(n) ? String(n) : "NaN");
    } else if (col?.data_type === "checkbox") {
      parts.push(Boolean(importPayload[k]) ? "1" : "0");
    } else if (col?.data_type === "date") {
      parts.push(String(importPayload[k] ?? "").slice(0, 10));
    } else if (col?.data_type === "relation") {
      parts.push(String(importPayload[k] ?? "").trim().toLowerCase());
    } else {
      parts.push(String(importPayload[k] ?? "").trim());
    }
    parts.push("\x1e");
  }
  return parts.join("");
}

function resolveCsvHeaderToSlug(
  header: string,
  columns: VirtualColumnForImport[]
): string | null {
  const h = header.trim();
  if (!h) return null;
  const lower = h.toLowerCase();
  for (const col of columns) {
    if (col.slug.toLowerCase() === lower) return col.slug;
    if (col.display_name.trim().toLowerCase() === lower) return col.slug;
    if (slugify(col.display_name) === slugify(h)) return col.slug;
  }
  return null;
}

function parseCheckboxCsv(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (["true", "1", "ya", "yes", "y", "✓", "x"].includes(s)) return true;
  if (["false", "0", "tidak", "no", "n"].includes(s)) return false;
  return null;
}

function coerceCsvCellValue(
  raw: string,
  col: VirtualColumnForImport
): { value: unknown; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: undefined, error: null };

  switch (col.data_type) {
    case "text":
    case "url":
      return { value: trimmed, error: null };
    case "number": {
      const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
      const n = Number(normalized);
      if (!Number.isFinite(n)) {
        return { value: undefined, error: `bukan angka valid` };
      }
      return { value: n, error: null };
    }
    case "date": {
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        return { value: trimmed.slice(0, 10), error: null };
      }
      return {
        value: undefined,
        error: `tanggal harus YYYY-MM-DD`,
      };
    }
    case "checkbox": {
      const b = parseCheckboxCsv(trimmed);
      if (b === null) {
        return {
          value: undefined,
          error: `centang harus ya/tidak, true/false, atau 1/0`,
        };
      }
      return { value: b, error: null };
    }
    case "select": {
      const options = (col.config?.options as string[] | undefined) ?? [];
      if (options.length > 0 && !options.includes(trimmed)) {
        return {
          value: undefined,
          error: `nilai tidak ada di opsi: ${options.slice(0, 5).join(", ")}${options.length > 5 ? "…" : ""}`,
        };
      }
      return { value: trimmed, error: null };
    }
    default:
      return { value: undefined, error: null };
  }
}

async function loadRelationLookupCache(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  targetTableId: string,
  lookupSlug: string
): Promise<
  | { ok: true; entry: RelationLookupCacheEntry }
  | { ok: false; error: string }
> {
  const { data: targetTable, error: tblErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("id, display_name")
    .eq("id", targetTableId)
    .is("deleted_at", null)
    .maybeSingle();

  if (tblErr) return { ok: false, error: tblErr.message };
  if (!targetTable) {
    return { ok: false, error: `Tabel target relasi tidak ditemukan (${targetTableId})` };
  }

  const { data: targetCols, error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug")
    .eq("table_id", targetTableId);

  if (colErr) return { ok: false, error: colErr.message };

  const targetSlugs = new Set(
    (targetCols ?? []).map((c: { slug: string }) => c.slug)
  );
  if (!targetSlugs.has(lookupSlug)) {
    return {
      ok: false,
      error: `Kolom lookup "${lookupSlug}" tidak ada di tabel "${(targetTable as { display_name: string }).display_name}"`,
    };
  }

  const { data: targetRows, error: rowErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, payload")
    .eq("table_id", targetTableId)
    .is("deleted_at", null);

  if (rowErr) return { ok: false, error: rowErr.message };

  const typedRows = (targetRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    payload: (r.payload as Record<string, unknown> | null) ?? {},
  }));

  const index = buildRelationLookupIndex(typedRows, lookupSlug, targetTableId);

  return {
    ok: true,
    entry: {
      index,
      targetTableLabel: (targetTable as { display_name: string }).display_name,
      targetRowCount: typedRows.length,
    },
  };
}

export async function fetchVirtualTableImportContextAction(
  tableId: string
): Promise<VirtualTableImportContextResult> {
  const empty = { relation_hints: [] as VirtualTableImportRelationHint[] };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", ...empty };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", ...empty };

  if (!tableId.trim()) return { error: "table_id kosong", ...empty };

  const { data: columnsRaw, error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type, config")
    .eq("table_id", tableId)
    .order("position");

  if (colErr) return { error: colErr.message, ...empty };

  const columns = (columnsRaw ?? []) as VirtualColumnForImport[];
  const relationCols = columns.filter((c) => c.data_type === "relation");
  const hints: VirtualTableImportRelationHint[] = [];

  for (const col of relationCols) {
    const targetTableId = col.config?.target_table_id;
    if (typeof targetTableId !== "string" || !targetTableId) continue;

    const lookupSlug = relationLookupSlugFromConfig(col.config);
    const loaded = await loadRelationLookupCache(
      supabase,
      targetTableId,
      lookupSlug
    );
    if (!loaded.ok) {
      return { error: loaded.error, ...empty };
    }

    hints.push({
      column_slug: col.slug,
      column_display_name: col.display_name,
      target_table_id: targetTableId,
      target_table_name: loaded.entry.targetTableLabel,
      lookup_slug: lookupSlug,
      target_row_count: loaded.entry.targetRowCount,
      is_multi: col.config?.is_multi === true,
    });
  }

  return { error: null, relation_hints: hints };
}

export async function importVirtualRowsCsvAction(
  formData: FormData
): Promise<ImportVirtualRowsCsvResult> {
  const empty = {
    inserted: 0,
    failed: 0,
    skippedEmpty: 0,
    skippedDuplicates: 0,
    failureSamples: [] as string[],
    unknownHeaders: [] as string[],
  };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", ...empty };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", ...empty };

  const tableId = String(formData.get("table_id") ?? "").trim();
  const csvRaw = String(formData.get("csv_text") ?? "");
  if (!tableId) return { error: "table_id kosong", ...empty };
  if (!csvRaw.trim()) return { error: "csv_text kosong", ...empty };
  if (csvRaw.length > MAX_VIRTUAL_TABLE_CSV_CHARS) {
    return {
      error: `CSV melebihi batas ~${Math.round(MAX_VIRTUAL_TABLE_CSV_CHARS / (1024 * 1024))} MB`,
      ...empty,
    };
  }

  const { data: tableRow, error: tableErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("id, project_id, organization_id, display_name")
    .eq("id", tableId)
    .is("deleted_at", null)
    .maybeSingle();

  if (tableErr) return { error: tableErr.message, ...empty };
  if (!tableRow) return { error: "Tabel tidak ditemukan", ...empty };

  const { data: columnsRaw, error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type, is_required, config")
    .eq("table_id", tableId)
    .order("position");

  if (colErr) return { error: colErr.message, ...empty };

  const columns = (columnsRaw ?? []) as VirtualColumnForImport[];
  const importableColumns = columns.filter((c) =>
    VIRTUAL_TABLE_CSV_IMPORTABLE_TYPES.has(c.data_type)
  );

  if (importableColumns.length === 0) {
    return {
      error:
        "Tidak ada kolom yang bisa diimpor (dukungan: teks, angka, tanggal, centang, URL, pilihan, relasi tunggal).",
      ...empty,
    };
  }

  const relationLookupCaches = new Map<string, RelationLookupCacheEntry>();
  for (const col of importableColumns) {
    if (col.data_type !== "relation") continue;
    const targetTableId = col.config?.target_table_id;
    if (typeof targetTableId !== "string" || !targetTableId) {
      return {
        error: `Kolom "${col.display_name}" relasi tanpa tabel target.`,
        ...empty,
      };
    }
    const lookupSlug = relationLookupSlugFromConfig(col.config);
    const cacheKey = `${targetTableId}::${lookupSlug}`;
    if (relationLookupCaches.has(cacheKey)) continue;
    const loaded = await loadRelationLookupCache(
      supabase,
      targetTableId,
      lookupSlug
    );
    if (!loaded.ok) return { error: loaded.error, ...empty };
    relationLookupCaches.set(cacheKey, loaded.entry);
  }

  const parsed = parseSimpleCsv(csvRaw);
  if (parsed.length === 0) {
    return {
      error: "CSV kosong atau tidak valid. Pastikan ada baris header dan minimal 1 baris data.",
      ...empty,
    };
  }
  if (parsed.length > MAX_VIRTUAL_TABLE_CSV_ROWS) {
    return {
      error: `Terlalu banyak baris (maks. ${MAX_VIRTUAL_TABLE_CSV_ROWS}). Bagi file menjadi beberapa impor.`,
      ...empty,
    };
  }

  const headerKeys = Object.keys(parsed[0]);
  const headerToSlug = new Map<string, string>();
  const unknownHeaders: string[] = [];
  for (const header of headerKeys) {
    const slug = resolveCsvHeaderToSlug(header, importableColumns);
    if (slug) headerToSlug.set(header, slug);
    else unknownHeaders.push(header);
  }

  const mappedSlugs = new Set(headerToSlug.values());
  if (mappedSlugs.size === 0) {
    return {
      error:
        "Tidak ada kolom CSV yang cocok. Gunakan slug kolom (mis. title) atau nama tampilan kolom sebagai header.",
      ...empty,
      unknownHeaders,
    };
  }

  const { data: maxSort } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("sort_order")
    .eq("table_id", tableId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextSort =
    ((maxSort as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data: existingRowsRaw, error: existingErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("payload")
    .eq("table_id", tableId)
    .is("deleted_at", null);

  if (existingErr) return { error: existingErr.message, ...empty };

  const existingPayloads = (existingRowsRaw ?? []) as {
    payload: Record<string, unknown> | null;
  }[];

  const colBySlug = new Map(importableColumns.map((c) => [c.slug, c]));
  let inserted = 0;
  let failed = 0;
  let skippedEmpty = 0;
  let skippedDuplicates = 0;
  const batchDedupKeys = new Set<string>();
  const failureSamples: string[] = [];
  const inserts: {
    table_id: string;
    payload: Record<string, unknown>;
    sort_order: number;
    created_by: string;
  }[] = [];

  const pushFailure = (lineLabel: string, message: string) => {
    failed++;
    if (failureSamples.length < 12) {
      failureSamples.push(`${lineLabel}: ${message}`);
    }
  };

  for (let i = 0; i < parsed.length; i++) {
    const csvRow = parsed[i];
    const lineLabel = `Baris ${i + 2}`;
    const payload: Record<string, unknown> = {};
    let rowError: string | null = null;

    for (const [header, slug] of headerToSlug) {
      const col = colBySlug.get(slug);
      if (!col) continue;
      const raw = csvRow[header] ?? "";

      if (col.data_type === "relation") {
        if (col.config?.is_multi === true) {
          if (raw.trim()) {
            rowError = `${col.display_name}: impor CSV belum mendukung multi-relasi`;
            break;
          }
          continue;
        }
        const targetTableId = col.config?.target_table_id as string;
        const lookupSlug = relationLookupSlugFromConfig(col.config);
        const cacheKey = `${targetTableId}::${lookupSlug}`;
        const cache = relationLookupCaches.get(cacheKey);
        if (!cache) {
          rowError = `${col.display_name}: cache lookup relasi tidak tersedia`;
          break;
        }
        if (!raw.trim()) continue;
        const resolved = resolveRelationIdFromCsv(
          raw,
          cache.index,
          cache.targetTableLabel
        );
        if (resolved.error) {
          rowError = `${col.display_name}: ${resolved.error}`;
          break;
        }
        if (resolved.rowId) payload[slug] = resolved.rowId;
        continue;
      }

      const { value, error: coerceErr } = coerceCsvCellValue(raw, col);
      if (coerceErr) {
        rowError = `${col.display_name} ${coerceErr}`;
        break;
      }
      if (value !== undefined) payload[slug] = value;
    }

    if (rowError) {
      pushFailure(lineLabel, rowError);
      continue;
    }

    const hasAnyValue = Object.keys(payload).length > 0;
    if (!hasAnyValue) {
      skippedEmpty++;
      continue;
    }

    for (const col of columns) {
      if (!col.is_required) continue;
      if (!VIRTUAL_TABLE_CSV_IMPORTABLE_TYPES.has(col.data_type)) continue;
      const val = payload[col.slug];
      if (val == null || val === "") {
        rowError = `${col.display_name} wajib diisi`;
        break;
      }
      const err = validateCellValue(val, col.data_type, true, col.display_name);
      if (err) {
        rowError = err;
        break;
      }
    }

    if (rowError) {
      pushFailure(lineLabel, rowError);
      continue;
    }

    for (const col of importableColumns) {
      if (!(col.slug in payload)) continue;
      const err = validateCellValue(
        payload[col.slug],
        col.data_type,
        false,
        col.display_name
      );
      if (err) {
        rowError = err;
        break;
      }
    }

    if (rowError) {
      pushFailure(lineLabel, rowError);
      continue;
    }

    const batchKey = csvImportPayloadBatchDedupKey(payload, colBySlug);
    if (batchDedupKeys.has(batchKey)) {
      skippedDuplicates++;
      continue;
    }
    let duplicateOfExisting = false;
    for (const row of existingPayloads) {
      const ep = row.payload ?? {};
      if (csvImportPayloadMatchesExistingRow(ep, payload, colBySlug)) {
        duplicateOfExisting = true;
        break;
      }
    }
    if (duplicateOfExisting) {
      skippedDuplicates++;
      continue;
    }
    batchDedupKeys.add(batchKey);

    inserts.push({
      table_id: tableId,
      payload,
      sort_order: nextSort++,
      created_by: user.id,
    });
  }

  const CHUNK = 100;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase
      .schema("core_pm")
      .from("virtual_rows")
      .insert(chunk);
    if (insertErr) {
      return {
        error: insertErr.message,
        inserted,
        failed: failed + (inserts.length - inserted),
        skippedEmpty,
        skippedDuplicates,
        failureSamples: [
          ...failureSamples,
          `Insert batch gagal: ${insertErr.message}`,
        ].slice(0, 12),
        unknownHeaders,
      };
    }
    inserted += chunk.length;
  }

  const projectId = (tableRow as { project_id: string | null }).project_id;
  const tableDisplayName = (tableRow as { display_name: string }).display_name;
  const tableOrgId = (tableRow as { organization_id: string | null }).organization_id;
  if (projectId && (inserted > 0 || skippedDuplicates > 0 || failed > 0)) {
    await writeProjectAuditLog(supabase, {
      projectId,
      actorUserId: user.id,
      action: "virtual_table.import_csv",
      entity: "core_pm.virtual_rows",
      entityId: tableId,
      payload: {
        table_display_name: tableDisplayName,
        inserted,
        failed,
        skipped_empty: skippedEmpty,
        skipped_duplicates: skippedDuplicates,
      },
    });
  }
  if (inserted > 0 || failed > 0) {
    let orgId = tableOrgId;
    if (!orgId && projectId) {
      const { data: pr } = await supabase
        .schema("core_pm")
        .from("projects")
        .select("organization_id")
        .eq("id", projectId)
        .maybeSingle();
      orgId =
        pr && typeof pr.organization_id === "string" ? pr.organization_id : null;
    }
    if (orgId) {
      const bodyParts: string[] = [];
      if (inserted > 0) bodyParts.push(`${inserted} baris ditambahkan`);
      if (failed > 0) bodyParts.push(`${failed} gagal`);
      if (skippedDuplicates > 0) {
        bodyParts.push(`${skippedDuplicates} duplikat dilewati`);
      }
      await dispatchWorkspaceNotification(supabase, {
        preferenceCategory: "import_summary",
        kind: "virtual_import",
        organizationId: orgId,
        projectId,
        actorUserId: user.id,
        title: `Import CSV ${tableDisplayName}: ${inserted} baris`,
        body: bodyParts.length > 0 ? bodyParts.join(", ") : null,
        severity: failed > 0 ? "warning" : "info",
        payload: {
          event_id: failed > 0 ? "vtable.import_partial" : "vtable.import_csv",
          virtual_table_id: tableId,
          table_display_name: tableDisplayName,
          inserted,
          failed,
        },
      });
    }
  }

  revalidatePath("/", "layout");
  return {
    error: null,
    inserted,
    failed,
    skippedEmpty,
    skippedDuplicates,
    failureSamples,
    unknownHeaders: [...new Set(unknownHeaders)],
  };
}

export type ImportVirtualRowsGeoJsonResult = {
  error: string | null;
  inserted: number;
  updated: number;
  failed: number;
  skippedExisting: number;
  failureSamples: string[];
  /** G-H5: relasi hub nominatif terisi otomatis setelah impor geom. */
  inboundLinked?: number;
  inboundLinkFailed?: number;
};

export async function importVirtualRowsGeoJsonBatchAction(
  formData: FormData
): Promise<ImportVirtualRowsGeoJsonResult> {
  const empty = {
    inserted: 0,
    updated: 0,
    failed: 0,
    skippedExisting: 0,
    failureSamples: [] as string[],
    inboundLinked: 0,
    inboundLinkFailed: 0,
  };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", ...empty };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", ...empty };

  const tableId = String(formData.get("table_id") ?? "").trim();
  const geojsonRaw = String(formData.get("geojson_json") ?? "");
  const geometryColumnSlug = String(formData.get("geometry_column_slug") ?? "").trim();
  const matchColumnSlug = String(formData.get("match_column_slug") ?? "").trim();
  const upsertMode = String(formData.get("upsert_mode") ?? "upsert").trim();
  const desaRelationColumnSlug = String(
    formData.get("desa_relation_column_slug") ?? ""
  ).trim();
  const desaTargetRowId = String(formData.get("desa_target_row_id") ?? "").trim();
  const featureKeyPrefix = String(formData.get("feature_key_prefix") ?? "").trim();
  const desaSourceMode = String(formData.get("desa_source_mode") ?? "fixed").trim();
  const geoDesaLookup = String(formData.get("geo_desa_lookup") ?? "code").trim();
  const geoCodeProp = String(formData.get("geo_code_prop") ?? "kode_desa").trim() || "kode_desa";
  const targetCodeSlug =
    String(formData.get("target_code_slug") ?? "kode_desa").trim() || "kode_desa";
  const geoKecamatanProp =
    String(formData.get("geo_kecamatan_prop") ?? "kecamatan").trim() || "kecamatan";
  const geoNamaDesaProp =
    String(formData.get("geo_nama_desa_prop") ?? "desa").trim() || "desa";
  const targetKecamatanSlug =
    String(formData.get("target_kecamatan_slug") ?? "kecamatan").trim() || "kecamatan";
  const targetTitleSlug =
    String(formData.get("target_title_slug") ?? "title").trim() || "title";
  const linkInboundRelations =
    String(formData.get("link_inbound_relations") ?? "true").trim() !== "false";
  const geometryKind = String(formData.get("geometry_kind") ?? "polygon").trim();

  if (!tableId) return { error: "table_id kosong", ...empty };
  if (!geojsonRaw.trim()) return { error: "geojson_json kosong", ...empty };
  if (!geometryColumnSlug) return { error: "geometry_column_slug wajib", ...empty };
  if (!matchColumnSlug) {
    return {
      error: "match_column_slug wajib (mis. no_bidang) untuk cocokkan / buat baris.",
      ...empty,
    };
  }
  if (geojsonRaw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("GeoJSON"),
      ...empty,
    };
  }

  const parsedFc =
    geometryKind === "point"
      ? parseFeatureCollectionForPointImport(geojsonRaw)
      : geometryKind === "linestring"
        ? parseFeatureCollectionForLineImport(geojsonRaw)
        : parseFeatureCollectionForVirtualImport(geojsonRaw);
  if (!parsedFc.ok) return { error: parsedFc.error, ...empty };
  const { fc, rows: polygonRows } = parsedFc;

  const { data: tableRow, error: tableErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("id, project_id, organization_id, display_name")
    .eq("id", tableId)
    .is("deleted_at", null)
    .maybeSingle();

  if (tableErr) return { error: tableErr.message, ...empty };
  if (!tableRow) return { error: "Tabel tidak ditemukan", ...empty };

  const { data: columnsRaw, error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type, is_required, config")
    .eq("table_id", tableId)
    .order("position");

  if (colErr) return { error: colErr.message, ...empty };

  const projectIdForLink = (tableRow as { project_id: string | null }).project_id;
  let inboundSpecs: InboundGeomRelationSpec[] = [];
  if (linkInboundRelations && projectIdForLink) {
    const { data: projTablesRaw } = await supabase
      .schema("core_pm")
      .from("virtual_tables")
      .select("id, display_name")
      .eq("project_id", projectIdForLink)
      .is("deleted_at", null);
    const projTables = (projTablesRaw ?? []) as {
      id: string;
      display_name: string;
    }[];
    const projectTableIds = new Set(projTables.map((t) => t.id));
    const tableNameById = new Map(projTables.map((t) => [t.id, t.display_name]));

    if (projectTableIds.size > 0) {
      const { data: projColsRaw } = await supabase
        .schema("core_pm")
        .from("virtual_columns")
        .select("table_id, slug, display_name, data_type, position, config")
        .in("table_id", [...projectTableIds]);

      inboundSpecs = buildInboundGeomRelationSpecs({
        geomTableId: tableId,
        projectTableIds,
        tableNameById,
        columns: (projColsRaw ?? []) as {
          table_id: string;
          slug: string;
          display_name: string;
          data_type: string;
          position: number;
          config: Record<string, unknown> | null;
        }[],
      });
    }
  }

  const columns = (columnsRaw ?? []) as VirtualColumnForImport[];
  const geomCol = columns.find((c) => c.slug === geometryColumnSlug);
  if (!geomCol || geomCol.data_type !== "geometry") {
    return { error: `Kolom geometri "${geometryColumnSlug}" tidak ditemukan`, ...empty };
  }
  const matchCol = columns.find((c) => c.slug === matchColumnSlug);
  if (!matchCol || !["text", "number", "url"].includes(matchCol.data_type)) {
    return {
      error: `Kolom kunci "${matchColumnSlug}" harus ada (teks/angka/URL)`,
      ...empty,
    };
  }

  const desaCol = desaRelationColumnSlug
    ? columns.find((c) => c.slug === desaRelationColumnSlug)
    : undefined;

  let desaRelationRowIdFixed: string | null = null;
  let codeLookupIndex: RelationLookupIndex | null = null;
  let compositeLookupIndex: CompositeKecamatanTitleIndex | null = null;
  let targetDesaTableLabel = "tabel target";

  if (desaRelationColumnSlug) {
    if (!desaCol || desaCol.data_type !== "relation") {
      return {
        error: `Kolom relasi "${desaRelationColumnSlug}" tidak valid`,
        ...empty,
      };
    }
    if (desaCol.config?.is_multi === true) {
      return {
        error: "Kolom relasi multi tidak didukung untuk impor GeoJSON",
        ...empty,
      };
    }
  }

  if (desaSourceMode === "from_properties") {
    if (!desaRelationColumnSlug || !desaCol) {
      return {
        error:
          "Lookup dari property GeoJSON memerlukan kolom relasi ke tabel target.",
        ...empty,
      };
    }
    const targetTableId = desaCol.config?.target_table_id;
    if (typeof targetTableId !== "string" || !targetTableId) {
      return { error: "Kolom relasi tanpa tabel target", ...empty };
    }

    const { data: tgtMeta, error: tgtMetaErr } = await supabase
      .schema("core_pm")
      .from("virtual_tables")
      .select("display_name")
      .eq("id", targetTableId)
      .is("deleted_at", null)
      .maybeSingle();

    if (tgtMetaErr) return { error: tgtMetaErr.message, ...empty };
    targetDesaTableLabel =
      (tgtMeta as { display_name: string } | null)?.display_name ?? targetDesaTableLabel;

    const { data: tgtColsRaw, error: tgtColErr } = await supabase
      .schema("core_pm")
      .from("virtual_columns")
      .select("slug")
      .eq("table_id", targetTableId);

    if (tgtColErr) return { error: tgtColErr.message, ...empty };
    const tgtSlugs = new Set(
      (tgtColsRaw ?? []).map((c: { slug: string }) => c.slug)
    );

    if (geoDesaLookup === "kecamatan_title") {
      if (!tgtSlugs.has(targetKecamatanSlug) || !tgtSlugs.has(targetTitleSlug)) {
        return {
          error: `Tabel "${targetDesaTableLabel}" harus punya kolom "${targetKecamatanSlug}" dan "${targetTitleSlug}" untuk lookup dua kolom gabungan.`,
          ...empty,
        };
      }
    } else {
      if (!tgtSlugs.has(targetCodeSlug)) {
        return {
          error: `Tabel "${targetDesaTableLabel}" tidak punya kolom "${targetCodeSlug}" — gunakan mode dua kolom gabungan atau tambah kolom kode di tabel target.`,
          ...empty,
        };
      }
    }

    const { data: tgtRowsRaw, error: tgtRowErr } = await supabase
      .schema("core_pm")
      .from("virtual_rows")
      .select("id, payload")
      .eq("table_id", targetTableId)
      .is("deleted_at", null)
      .limit(MAX_GEOJSON_DESA_TARGET_ROWS);

    if (tgtRowErr) return { error: tgtRowErr.message, ...empty };
    const typedTargetRows = (tgtRowsRaw ?? []).map(
      (r: Record<string, unknown>) => ({
        id: r.id as string,
        payload: (r.payload as Record<string, unknown> | null) ?? {},
      })
    );
    if (typedTargetRows.length >= MAX_GEOJSON_DESA_TARGET_ROWS) {
      return {
        error: `Tabel target "${targetDesaTableLabel}" punya terlalu banyak baris (≥${MAX_GEOJSON_DESA_TARGET_ROWS}). Hubungi admin.`,
        ...empty,
      };
    }

    if (geoDesaLookup === "kecamatan_title") {
      compositeLookupIndex = buildCompositeKecamatanTitleIndex(
        typedTargetRows,
        targetKecamatanSlug,
        targetTitleSlug,
        targetTableId
      );
    } else {
      codeLookupIndex = buildRelationLookupIndex(
        typedTargetRows,
        targetCodeSlug,
        targetTableId
      );
    }
  } else {
    if (desaRelationColumnSlug) {
      if (!desaTargetRowId) {
        return { error: "Pilih baris tabel target untuk file ini", ...empty };
      }
      desaRelationRowIdFixed = desaTargetRowId;
    } else {
      const requiredRelation = columns.find(
        (c) => c.data_type === "relation" && c.is_required
      );
      if (requiredRelation) {
        return {
          error: `Kolom relasi "${requiredRelation.display_name}" wajib — pilih baris target atau lookup dari property GeoJSON.`,
          ...empty,
        };
      }
    }
  }

  const skipGeoPropertyLower = new Set<string>();
  if (desaSourceMode === "from_properties") {
    if (geoDesaLookup === "kecamatan_title") {
      skipGeoPropertyLower.add(geoKecamatanProp.toLowerCase());
      skipGeoPropertyLower.add(geoNamaDesaProp.toLowerCase());
    } else {
      skipGeoPropertyLower.add(geoCodeProp.toLowerCase());
    }
  }

  const { data: existingRowsRaw, error: existErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, payload")
    .eq("table_id", tableId)
    .is("deleted_at", null);

  if (existErr) return { error: existErr.message, ...empty };

  const existingByUpsertKey = new Map<
    string,
    { id: string; payload: Record<string, unknown> }
  >();
  for (const row of existingRowsRaw ?? []) {
    const r = row as { id: string; payload: Record<string, unknown> | null };
    const payload = r.payload ?? {};
    const matchK = normalizeVirtualTableMatchKey(payload[matchColumnSlug]);
    if (!matchK) continue;
    const storageKey = bidangUpsertStorageKey(
      desaRelationColumnSlug || null,
      desaRelationColumnSlug
        ? (payload[desaRelationColumnSlug] as string | undefined)
        : null,
      matchK
    );
    if (!existingByUpsertKey.has(storageKey)) {
      existingByUpsertKey.set(storageKey, { id: r.id, payload });
    }
  }

  const { data: maxSort } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("sort_order")
    .eq("table_id", tableId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextSort =
    ((maxSort as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const skipSlugs = new Set(
    [
      geometryColumnSlug,
      matchColumnSlug,
      "title",
      "label",
      "source",
      "dxf_layer",
      "dxf_polygon_index",
      desaRelationColumnSlug,
    ].filter(Boolean)
  );

  const mapColumns = columns.filter((c) =>
    ["text", "number", "select", "url"].includes(c.data_type)
  );

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let skippedExisting = 0;
  const failureSamples: string[] = [];
  const inserts: {
    table_id: string;
    payload: Record<string, unknown>;
    sort_order: number;
    created_by: string;
  }[] = [];
  const updates: { id: string; payload: Record<string, unknown> }[] = [];
  const pendingInsertIndexByKey = new Map<string, number>();
  const geomLinkByUpsertKey = new Map<
    string,
    { featureIndex: number; props: Record<string, unknown>; geomRowId?: string }
  >();

  const queueGeomLink = (
    rowUpsertKey: string,
    featureIndex: number,
    props: Record<string, unknown>,
    geomRowId?: string
  ) => {
    if (inboundSpecs.length === 0) return;
    const prev = geomLinkByUpsertKey.get(rowUpsertKey);
    geomLinkByUpsertKey.set(rowUpsertKey, {
      featureIndex,
      props,
      geomRowId: geomRowId ?? prev?.geomRowId,
    });
  };

  const pushFailure = (label: string, message: string) => {
    failed++;
    if (failureSamples.length < 12) {
      failureSamples.push(`${label}: ${message}`);
    }
  };

  for (let j = 0; j < polygonRows.length; j++) {
    const { featureIndex, props } = polygonRows[j]!;
    const lineLabel =
      geometryKind === "point"
        ? `Titik #${featureIndex + 1}`
        : geometryKind === "linestring"
          ? `Garis #${featureIndex + 1}`
          : `Poligon #${featureIndex + 1}`;
    const feat = fc.features[featureIndex];
    if (!feat || feat.type !== "Feature") {
      pushFailure(lineLabel, "bukan Feature valid");
      continue;
    }

    const matchKeyRaw = extractMatchKeyFromProperties(
      props,
      matchColumnSlug,
      featureIndex,
      featureKeyPrefix
    );
    if (!matchKeyRaw) {
      pushFailure(lineLabel, `tidak ada nilai untuk kolom kunci "${matchColumnSlug}"`);
      continue;
    }

    const matchNorm = normalizeVirtualTableMatchKey(matchKeyRaw);
    if (!matchNorm) {
      pushFailure(lineLabel, "kunci pencocokan kosong");
      continue;
    }

    let desaIdForFeature: string | null = null;
    if (desaRelationColumnSlug && desaCol) {
      if (desaSourceMode === "from_properties") {
        if (geoDesaLookup === "kecamatan_title" && compositeLookupIndex) {
          const kecRaw = geoProp(props, geoKecamatanProp);
          const desRaw = geoProp(props, geoNamaDesaProp);
          const res = resolveCompositeKecamatanTitle(
            kecRaw == null ? "" : String(kecRaw),
            desRaw == null ? "" : String(desRaw),
            compositeLookupIndex,
            targetDesaTableLabel
          );
          if (res.error) {
            pushFailure(lineLabel, res.error);
            continue;
          }
          desaIdForFeature = res.rowId ?? null;
        } else if (codeLookupIndex) {
          const rawCode = geoProp(props, geoCodeProp);
          if (rawCode == null || !String(rawCode).trim()) {
            pushFailure(
              lineLabel,
              `property "${geoCodeProp}" kosong (kode lookup wajib ada di setiap feature)`
            );
            continue;
          }
          const res = resolveRelationIdFromCsv(
            String(rawCode),
            codeLookupIndex,
            targetDesaTableLabel
          );
          if (res.error) {
            pushFailure(lineLabel, res.error);
            continue;
          }
          desaIdForFeature = res.rowId ?? null;
        }
      } else {
        desaIdForFeature = desaRelationRowIdFixed;
      }

      if (!desaIdForFeature && desaCol.is_required) {
        pushFailure(lineLabel, "kolom relasi tidak terisi");
        continue;
      }
    }

    const storedGeom =
      geometryKind === "point"
        ? featureToStoredPointGeometry(feat.geometry, props)
        : geometryKind === "linestring"
          ? featureToStoredLineGeometry(feat.geometry, props)
          : featureToStoredGeometry(feat.geometry, props);
    if (!storedGeom) {
      pushFailure(
        lineLabel,
        geometryKind === "point"
          ? "geometri bukan Point valid"
          : geometryKind === "linestring"
            ? "geometri bukan LineString valid"
            : "geometri bukan Polygon/MultiPolygon valid"
      );
      continue;
    }

    const mapped = mapPropertiesToPayload(
      props,
      mapColumns,
      skipSlugs,
      skipGeoPropertyLower
    );
    const patch: Record<string, unknown> = {
      ...mapped,
      [matchColumnSlug]:
        matchCol.data_type === "number" ? Number(matchKeyRaw) : matchKeyRaw,
      [geometryColumnSlug]: storedGeom,
    };
    // Jangan timpa kolom kunci bila slug-nya "title" (NIB sering pakai slug ini).
    if (
      columns.some((c) => c.slug === "title") &&
      matchColumnSlug !== "title"
    ) {
      patch.title = defaultTitleFromFeature(props, matchKeyRaw);
    }
    if (desaRelationColumnSlug && desaIdForFeature) {
      patch[desaRelationColumnSlug] = desaIdForFeature;
    }

    const rowUpsertKey = bidangUpsertStorageKey(
      desaRelationColumnSlug || null,
      desaIdForFeature,
      matchNorm
    );

    const existing = existingByUpsertKey.get(rowUpsertKey);
    if (existing) {
      if (upsertMode === "insert_only") {
        skippedExisting++;
        continue;
      }
      const merged = { ...existing.payload, ...patch };
      updates.push({ id: existing.id, payload: merged });
      existingByUpsertKey.set(rowUpsertKey, { id: existing.id, payload: merged });
      queueGeomLink(rowUpsertKey, featureIndex, props, existing.id);
      continue;
    }

    const pendingIdx = pendingInsertIndexByKey.get(rowUpsertKey);
    if (pendingIdx !== undefined) {
      inserts[pendingIdx]!.payload = {
        ...inserts[pendingIdx]!.payload,
        ...patch,
      };
      continue;
    }

    pendingInsertIndexByKey.set(rowUpsertKey, inserts.length);
    inserts.push({
      table_id: tableId,
      payload: patch,
      sort_order: nextSort++,
      created_by: user.id,
    });
    queueGeomLink(rowUpsertKey, featureIndex, props);
  }

  inserted = inserts.length;
  updated = updates.length;

  const CHUNK = 50;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    const { data: insertedRows, error: insertErr } = await supabase
      .schema("core_pm")
      .from("virtual_rows")
      .insert(chunk)
      .select("id, payload");
    if (insertErr) {
      return {
        error: insertErr.message,
        inserted: 0,
        updated: 0,
        failed: failed + inserts.length,
        skippedExisting,
        failureSamples: [
          ...failureSamples,
          `Insert batch gagal: ${insertErr.message}`,
        ].slice(0, 12),
        inboundLinked: 0,
        inboundLinkFailed: 0,
      };
    }

    for (const row of insertedRows ?? []) {
      const r = row as { id: string; payload: Record<string, unknown> | null };
      const payload = r.payload ?? {};
      const matchK = normalizeVirtualTableMatchKey(payload[matchColumnSlug]);
      if (!matchK) continue;
      const desaId = desaRelationColumnSlug
        ? (payload[desaRelationColumnSlug] as string | undefined)
        : null;
      const storageKey = bidangUpsertStorageKey(
        desaRelationColumnSlug || null,
        desaId,
        matchK
      );
      const link = geomLinkByUpsertKey.get(storageKey);
      if (link && !link.geomRowId) {
        link.geomRowId = r.id;
        geomLinkByUpsertKey.set(storageKey, link);
      }
    }
  }

  for (const u of updates) {
    const { error: updErr } = await supabase
      .schema("core_pm")
      .from("virtual_rows")
      .update({
        payload: u.payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", u.id);
    if (updErr) {
      pushFailure(`Update ${u.id.slice(0, 8)}`, updErr.message);
    }
  }

  let inboundLinked = 0;
  let inboundLinkFailed = 0;
  if (inboundSpecs.length > 0 && geomLinkByUpsertKey.size > 0) {
    const linkFeatures = [...geomLinkByUpsertKey.values()]
      .filter((l): l is typeof l & { geomRowId: string } => Boolean(l.geomRowId))
      .map((l) => ({
        geomRowId: l.geomRowId,
        props: l.props,
        featureIndex: l.featureIndex,
      }));
    const linkResult = await applyInboundGeomRelationLinks(
      supabase,
      inboundSpecs,
      linkFeatures
    );
    inboundLinked = linkResult.linked;
    inboundLinkFailed = linkResult.failed;
    for (const sample of linkResult.samples) {
      pushFailure("Relasi hub", sample);
    }
  }

  const projectId = (tableRow as { project_id: string | null }).project_id;
  const tableDisplayName = (tableRow as { display_name: string }).display_name;
  const tableOrgId = (tableRow as { organization_id: string | null }).organization_id;
  if (projectId && (inserted > 0 || updated > 0)) {
    await writeProjectAuditLog(supabase, {
      projectId,
      actorUserId: user.id,
      action: "virtual_table.import_geojson",
      entity: "core_pm.virtual_rows",
      entityId: tableId,
      payload: {
        table_display_name: tableDisplayName,
        inserted,
        updated,
        failed,
        skipped_existing: skippedExisting,
        geometry_column: geometryColumnSlug,
        match_column: matchColumnSlug,
        desa_source_mode: desaSourceMode,
        geo_desa_lookup: geoDesaLookup,
        inbound_linked: inboundLinked,
      },
    });
  }
  if (inserted > 0 || updated > 0 || failed > 0) {
    let orgId = tableOrgId;
    if (!orgId && projectId) {
      const { data: pr } = await supabase
        .schema("core_pm")
        .from("projects")
        .select("organization_id")
        .eq("id", projectId)
        .maybeSingle();
      orgId =
        pr && typeof pr.organization_id === "string" ? pr.organization_id : null;
    }
    if (orgId) {
      const bodyParts: string[] = [];
      if (inserted > 0) bodyParts.push(`${inserted} fitur baru`);
      if (updated > 0) bodyParts.push(`${updated} diperbarui`);
      if (failed > 0) bodyParts.push(`${failed} gagal`);
      await dispatchWorkspaceNotification(supabase, {
        preferenceCategory: "import_summary",
        kind: "virtual_import",
        organizationId: orgId,
        projectId,
        actorUserId: user.id,
        title: `Import GeoJSON ${tableDisplayName}: ${inserted} fitur`,
        body: bodyParts.length > 0 ? bodyParts.join(", ") : null,
        severity: failed > 0 ? "warning" : "info",
        payload: {
          event_id: failed > 0 ? "vtable.import_partial" : "vtable.import_geojson",
          virtual_table_id: tableId,
          table_display_name: tableDisplayName,
          inserted,
          updated,
          failed,
        },
      });
    }
  }

  revalidatePath("/", "layout");
  return {
    error: null,
    inserted,
    updated,
    failed,
    skippedExisting,
    failureSamples,
    inboundLinked,
    inboundLinkFailed,
  };
}

const VIRTUAL_IMPORT_FORM_FIELD_KEYS = [
  "table_id",
  "geometry_column_slug",
  "match_column_slug",
  "upsert_mode",
  "feature_key_prefix",
  "desa_source_mode",
  "desa_relation_column_slug",
  "desa_target_row_id",
  "geo_desa_lookup",
  "geo_code_prop",
  "target_code_slug",
  "geo_kecamatan_prop",
  "geo_nama_desa_prop",
  "target_kecamatan_slug",
  "target_title_slug",
  "link_inbound_relations",
] as const;

function copyVirtualImportFormFields(source: FormData, target: FormData): void {
  for (const key of VIRTUAL_IMPORT_FORM_FIELD_KEYS) {
    const v = source.get(key);
    if (v != null && String(v).trim() !== "") {
      target.set(key, String(v));
    }
  }
}

export type ImportVirtualRowsDxfResult = ImportVirtualRowsGeoJsonResult;

/** Impor poligon tertutup dari layer DXF → virtual_rows (WGS84, upsert sama GeoJSON). */
export async function importVirtualRowsDxfBatchAction(
  formData: FormData
): Promise<ImportVirtualRowsDxfResult> {
  const empty = {
    inserted: 0,
    updated: 0,
    failed: 0,
    skippedExisting: 0,
    failureSamples: [] as string[],
  };

  const dxfText = String(formData.get("dxf_text") ?? "");
  const layerName = String(formData.get("layer_name") ?? "").trim();
  const sourceSridRaw = String(formData.get("source_srid") ?? "4326");
  const dxfGeometryType = String(formData.get("dxf_geometry_type") ?? "polygon")
    .trim()
    .toLowerCase();
  const keysJsonRaw = String(formData.get("match_keys_json") ?? "").trim();
  const labelsJsonRaw = String(formData.get("match_labels_json") ?? "").trim();
  const matchColumnSlug = String(formData.get("match_column_slug") ?? "").trim();
  const geometryMode = parseDxfGeometryMode(
    String(formData.get("geometry_mode") ?? "closed")
  );
  const polygonizeSnapRaw = String(
    formData.get("polygonize_snap_tolerance") ?? ""
  );

  if (!dxfText.trim() || !layerName) {
    return {
      error: "dxf_text dan layer_name wajib diisi",
      ...empty,
    };
  }
  if (!matchColumnSlug) {
    return {
      error: "match_column_slug wajib (mis. no_bidang)",
      ...empty,
    };
  }
  if (!keysJsonRaw) {
    return {
      error:
        dxfGeometryType === "point"
          ? "match_keys_json wajib (satu kunci per titik)"
          : dxfGeometryType === "linestring"
            ? "match_keys_json wajib (satu kunci per garis)"
            : "match_keys_json wajib (satu kunci per poligon)",
      ...empty,
    };
  }
  if (dxfText.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("DXF"),
      ...empty,
    };
  }

  const sridParsed = parseVirtualTableDxfSourceSrid(sourceSridRaw);
  if (!sridParsed.ok) {
    return { error: sridParsed.error, ...empty };
  }
  if (!isPreviewSourceSridSupported(sridParsed.srid)) {
    return {
      error: `EPSG:${sridParsed.srid} belum didukung untuk impor DXF. Gunakan SRID dari daftar (UTM/TM-3/WGS84).`,
      ...empty,
    };
  }

  let matchKeys: string[];
  let labelPerIndex: (string | null)[] = [];
  try {
    const parsed = JSON.parse(keysJsonRaw) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        error: "match_keys_json harus berupa JSON array string yang valid.",
        ...empty,
      };
    }
    matchKeys = parsed.map((x) => String(x ?? "").trim());
    if (matchKeys.some((k) => !k)) {
      return {
        error: "Setiap kunci pencocokan pada match_keys_json tidak boleh kosong.",
        ...empty,
      };
    }
  } catch {
    return {
      error: "match_keys_json harus berupa JSON array string yang valid.",
      ...empty,
    };
  }

  if (labelsJsonRaw) {
    try {
      const labelsParsed = JSON.parse(labelsJsonRaw) as unknown;
      if (!Array.isArray(labelsParsed)) {
        return {
          error: "match_labels_json harus berupa JSON array yang valid.",
          ...empty,
        };
      }
      labelPerIndex = labelsParsed.map((x) => {
        const t = String(x ?? "").trim();
        return t.length > 0 ? t : null;
      });
    } catch {
      return {
        error: "match_labels_json harus berupa JSON array yang valid.",
        ...empty,
      };
    }
  }

  let dxf: ReturnType<typeof parseDxfDocument>;
  try {
    dxf = parseDxfDocument(dxfText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca DXF.";
    return { error: msg, ...empty };
  }

  const polygonizeOpts =
    geometryMode === "polygonize"
      ? buildDxfPolygonizeOptionsFromForm(
          sridParsed.srid,
          polygonizeSnapRaw || undefined
        )
      : undefined;

  let fc: GeoJSON.FeatureCollection;
  if (dxfGeometryType === "point") {
    const points = extractPointsFromDxfLayer(dxf, layerName);
    if (points.length === 0) {
      return {
        error:
          "Tidak ada entitas POINT pada layer ini. Periksa layer DXF atau pilih mode poligon.",
        ...empty,
      };
    }
    if (matchKeys.length !== points.length) {
      return {
        error: `match_keys_json harus ${points.length} elemen (sama dengan jumlah titik).`,
        ...empty,
      };
    }
    if (labelPerIndex.length > 0 && labelPerIndex.length !== points.length) {
      return {
        error: `match_labels_json harus ${points.length} elemen bila diisi.`,
        ...empty,
      };
    }
    while (labelPerIndex.length < points.length) {
      labelPerIndex.push(null);
    }
    try {
      fc = buildVirtualTableDxfPointFeatureCollection(
        points,
        matchKeys,
        labelPerIndex,
        matchColumnSlug,
        layerName,
        sridParsed.srid
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Gagal membangun geometri titik dari DXF.";
      return { error: msg, ...empty };
    }
  } else if (dxfGeometryType === "linestring") {
    const paths = extractOpenLineStringsFromDxfLayer(dxf, layerName);
    if (paths.length === 0) {
      return {
        error:
          "Tidak ada garis terbuka (LINE/LWPOLYLINE) pada layer ini. Periksa layer DXF atau pilih mode poligon.",
        ...empty,
      };
    }
    if (matchKeys.length !== paths.length) {
      return {
        error: `match_keys_json harus ${paths.length} elemen (sama dengan jumlah garis).`,
        ...empty,
      };
    }
    if (labelPerIndex.length > 0 && labelPerIndex.length !== paths.length) {
      return {
        error: `match_labels_json harus ${paths.length} elemen bila diisi.`,
        ...empty,
      };
    }
    while (labelPerIndex.length < paths.length) {
      labelPerIndex.push(null);
    }
    try {
      fc = buildVirtualTableDxfLineStringFeatureCollection(
        paths,
        matchKeys,
        labelPerIndex,
        matchColumnSlug,
        layerName,
        sridParsed.srid
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Gagal membangun geometri garis dari DXF.";
      return { error: msg, ...empty };
    }
  } else {
    const extracted = extractPolygonRingsFromDxfLayer(
      dxf,
      layerName,
      dxfText,
      geometryMode,
      polygonizeOpts
    );
    const rings = extracted.rings;
    if (rings.length === 0) {
      const polygonizeHint =
        geometryMode === "polygonize"
          ? extracted.polygonizeMeta?.warnings.join(" ") ||
            "Tidak ada poligon terbentuk dari garis di layer ini. Periksa LINE/LWPOLYLINE terbuka dan toleransi snap."
          : "Tidak ada poligon tertutup di layer ini. Pastikan LWPOLYLINE/POLYLINE tertutup, INSERT blok, atau HATCH boundary valid.";
      return {
        error: polygonizeHint,
        ...empty,
      };
    }
    if (matchKeys.length !== rings.length) {
      return {
        error: `match_keys_json harus ${rings.length} elemen (sama dengan jumlah poligon tertutup).`,
        ...empty,
      };
    }
    if (labelPerIndex.length > 0 && labelPerIndex.length !== rings.length) {
      return {
        error: `match_labels_json harus ${rings.length} elemen bila diisi.`,
        ...empty,
      };
    }
    while (labelPerIndex.length < rings.length) {
      labelPerIndex.push(null);
    }
    try {
      fc = buildVirtualTableDxfFeatureCollection(
        rings,
        matchKeys,
        labelPerIndex,
        matchColumnSlug,
        layerName,
        sridParsed.srid
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Gagal membangun geometri dari DXF.";
      return { error: msg, ...empty };
    }
  }

  const geojsonJson = JSON.stringify(fc);
  if (geojsonJson.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("GeoJSON hasil konversi DXF"),
      ...empty,
    };
  }

  const inner = new FormData();
  copyVirtualImportFormFields(formData, inner);
  inner.set("geojson_json", geojsonJson);
  if (dxfGeometryType === "point") {
    inner.set("geometry_kind", "point");
  } else if (dxfGeometryType === "linestring") {
    inner.set("geometry_kind", "linestring");
  }
  return importVirtualRowsGeoJsonBatchAction(inner);
}

export type ImportDxfSplitTableSummary = {
  target: DxfSplitTargetKind;
  tableId: string;
  displayName: string;
  inserted: number;
  updated: number;
  failed: number;
  skippedExisting: number;
  layerCount: number;
};

export type ImportDxfSplitMultiTableResult = {
  error: string | null;
  tables: ImportDxfSplitTableSummary[];
  totalInserted: number;
  totalUpdated: number;
  totalFailed: number;
  failureSamples: string[];
};

/** Fase 7 — impor satu file DXF campur ke beberapa tabel virtual (bootstrap + batch). */
export async function importDxfSplitMultiTableAction(
  formData: FormData
): Promise<ImportDxfSplitMultiTableResult> {
  const empty: ImportDxfSplitMultiTableResult = {
    error: null,
    tables: [],
    totalInserted: 0,
    totalUpdated: 0,
    totalFailed: 0,
    failureSamples: [],
  };

  const projectId = String(formData.get("project_id") ?? "").trim();
  const dxfText = String(formData.get("dxf_text") ?? "");
  const sourceSridRaw = String(formData.get("source_srid") ?? "4326");
  const mappingJsonRaw = String(formData.get("mapping_json") ?? "").trim();
  const polygonizeSnapRaw = String(
    formData.get("polygonize_snap_tolerance") ?? ""
  );

  if (!projectId) {
    return { ...empty, error: "project_id wajib" };
  }
  if (!dxfText.trim()) {
    return { ...empty, error: "dxf_text wajib diisi" };
  }
  if (!mappingJsonRaw) {
    return { ...empty, error: "mapping_json wajib" };
  }
  if (dxfText.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      ...empty,
      error: spatialGeometryTextTooLargeMessage("DXF"),
    };
  }

  const sridParsed = parseVirtualTableDxfSourceSrid(sourceSridRaw);
  if (!sridParsed.ok) {
    return { ...empty, error: sridParsed.error };
  }
  if (!isPreviewSourceSridSupported(sridParsed.srid)) {
    return {
      ...empty,
      error: `EPSG:${sridParsed.srid} belum didukung untuk impor DXF split.`,
    };
  }

  let payloadParsed: ReturnType<typeof parseDxfSplitImportPayload>;
  try {
    payloadParsed = parseDxfSplitImportPayload(JSON.parse(mappingJsonRaw));
  } catch {
    return { ...empty, error: "mapping_json bukan JSON valid." };
  }
  if (!payloadParsed.ok) {
    return { ...empty, error: payloadParsed.error };
  }
  const { targetTables, rows } = payloadParsed.payload;

  let dxf: ReturnType<typeof parseDxfDocument>;
  try {
    dxf = parseDxfDocument(dxfText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca DXF.";
    return { ...empty, error: msg };
  }

  const polygonizeOpts = buildDxfPolygonizeOptionsFromForm(
    sridParsed.srid,
    polygonizeSnapRaw || undefined
  );

  const tableIdByTarget = new Map<DxfSplitTargetKind, string>();
  const tableNameByTarget = new Map<DxfSplitTargetKind, string>();
  const tableStats = new Map<
    string,
    ImportDxfSplitTableSummary & { layerNames: Set<string> }
  >();

  for (const cfg of targetTables) {
    if (!cfg.enabled || cfg.target === "skip") continue;
    tableNameByTarget.set(cfg.target, cfg.displayName);
  }

  async function resolveTableId(
    target: DxfSplitTargetKind
  ): Promise<{ tableId: string; displayName: string } | { error: string }> {
    const cached = tableIdByTarget.get(target);
    const displayName =
      tableNameByTarget.get(target) ??
      (target === "titik"
        ? defaultFieldPointTableName()
        : defaultWorkbenchLayerTableName(
            workbenchKindFromSplitTarget(target) ?? "bidang"
          ));
    if (cached) {
      return { tableId: cached, displayName };
    }

    if (target === "titik") {
      const bootFd = new FormData();
      bootFd.set("project_id", projectId);
      bootFd.set("display_name", displayName);
      const boot = await bootstrapVirtualTableSurveyPointsAction(bootFd);
      if (boot.error || !boot.tableId) {
        return { error: boot.error ?? `Gagal membuat tabel titik «${displayName}».` };
      }
      tableIdByTarget.set(target, boot.tableId);
      tableNameByTarget.set(target, boot.displayName ?? displayName);
      return {
        tableId: boot.tableId,
        displayName: boot.displayName ?? displayName,
      };
    }

    const layerKind = workbenchKindFromSplitTarget(target);
    if (!layerKind) {
      return { error: `Target «${target}» tidak didukung untuk bootstrap.` };
    }
    const bootFd = new FormData();
    bootFd.set("project_id", projectId);
    bootFd.set("layer_kind", layerKind);
    bootFd.set("display_name", displayName);
    const boot = await bootstrapVirtualTableWorkbenchLayerAction(bootFd);
    if (boot.error || !boot.tableId) {
      return {
        error: boot.error ?? `Gagal membuat tabel «${displayName}».`,
      };
    }
    tableIdByTarget.set(target, boot.tableId);
    tableNameByTarget.set(target, boot.displayName ?? displayName);
    return {
      tableId: boot.tableId,
      displayName: boot.displayName ?? displayName,
    };
  }

  const activeRows = rows.filter((r) => r.enabled && r.target !== "skip");

  for (const row of activeRows) {
    const tableResolved = await resolveTableId(row.target);
    if ("error" in tableResolved) {
      return { ...empty, error: tableResolved.error };
    }

    const matchSlug = matchColumnSlugForSplitTarget(row.target);
    const geomSlug = geometryColumnSlugForSplitTarget(row.target);
    const mappingRow: DxfSplitMappingRow = {
      id: `${row.layerName}::${row.geomKind}`,
      layerName: row.layerName,
      geomKind: row.geomKind,
      target: row.target,
      enabled: true,
      entityCount: row.matchKeys.length,
      reason: "",
      matchKeys: row.matchKeys,
      matchLabels: row.matchLabels,
    };

    let fc: GeoJSON.FeatureCollection;
    try {
      fc = buildImportFeatureCollectionForMappingRow(
        dxf,
        dxfText,
        mappingRow,
        matchSlug,
        sridParsed.srid,
        polygonizeOpts
      );
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : `Gagal mengekstrak layer «${row.layerName}».`;
      return { ...empty, error: msg };
    }

    if (fc.features.length === 0) {
      return {
        ...empty,
        error: `Tidak ada fitur pada layer «${row.layerName}» (${row.geomKind}).`,
      };
    }

    const geojsonJson = JSON.stringify(fc);
    if (geojsonJson.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
      return {
        ...empty,
        error: spatialGeometryTextTooLargeMessage(
          `GeoJSON hasil layer «${row.layerName}»`
        ),
      };
    }

    const inner = new FormData();
    inner.set("table_id", tableResolved.tableId);
    inner.set("geojson_json", geojsonJson);
    inner.set("geometry_column_slug", geomSlug);
    inner.set("match_column_slug", matchSlug);
    inner.set("geometry_kind", geometryKindForSplitTarget(row.target));
    inner.set("upsert_mode", "upsert");
    inner.set("link_inbound_relations", "false");

    const imported = await importVirtualRowsGeoJsonBatchAction(inner);
    if (imported.error) {
      return {
        ...empty,
        error: `Impor layer «${row.layerName}» ke «${tableResolved.displayName}» gagal: ${imported.error}`,
        tables: [...tableStats.values()].map(
          ({ layerNames, ...rest }) => ({
            ...rest,
            layerCount: layerNames.size,
          })
        ),
        totalInserted: [...tableStats.values()].reduce(
          (s, t) => s + t.inserted,
          0
        ),
        totalUpdated: [...tableStats.values()].reduce(
          (s, t) => s + t.updated,
          0
        ),
        totalFailed: [...tableStats.values()].reduce(
          (s, t) => s + t.failed,
          0
        ),
        failureSamples: imported.failureSamples ?? [],
      };
    }

    const existing = tableStats.get(tableResolved.tableId);
    if (existing) {
      existing.inserted += imported.inserted;
      existing.updated += imported.updated;
      existing.failed += imported.failed;
      existing.skippedExisting += imported.skippedExisting;
      existing.layerNames.add(row.layerName);
    } else {
      tableStats.set(tableResolved.tableId, {
        target: row.target,
        tableId: tableResolved.tableId,
        displayName: tableResolved.displayName,
        inserted: imported.inserted,
        updated: imported.updated,
        failed: imported.failed,
        skippedExisting: imported.skippedExisting,
        layerCount: 1,
        layerNames: new Set([row.layerName]),
      });
    }
  }

  const tables = [...tableStats.values()].map(({ layerNames, ...rest }) => ({
    ...rest,
    layerCount: layerNames.size,
  }));

  revalidatePath("/");

  return {
    error: null,
    tables,
    totalInserted: tables.reduce((s, t) => s + t.inserted, 0),
    totalUpdated: tables.reduce((s, t) => s + t.updated, 0),
    totalFailed: tables.reduce((s, t) => s + t.failed, 0),
    failureSamples: [],
  };
}

export type ImportVirtualRowsPointsResult = ImportVirtualRowsGeoJsonResult;

/** Impor bidang dari CSV titik (no_bidang, x, y) → virtual_rows (WGS84, upsert sama GeoJSON). */
export async function importVirtualRowsPointsBatchAction(
  formData: FormData
): Promise<ImportVirtualRowsPointsResult> {
  const empty = {
    inserted: 0,
    updated: 0,
    failed: 0,
    skippedExisting: 0,
    failureSamples: [] as string[],
  };

  const csvText = String(formData.get("points_csv_text") ?? "");
  const columnNoBidang = String(formData.get("column_no_bidang") ?? "").trim();
  const columnX = String(formData.get("column_x") ?? "").trim();
  const columnY = String(formData.get("column_y") ?? "").trim();
  const columnUrutan = String(formData.get("column_urutan") ?? "").trim();
  const columnNamaTitik = String(formData.get("column_nama_titik") ?? "").trim();
  const pointOrderJsonRaw = String(formData.get("point_order_json") ?? "").trim();
  const sourceSridRaw = String(formData.get("source_srid") ?? "4326");
  const keysJsonRaw = String(formData.get("match_keys_json") ?? "").trim();
  const labelsJsonRaw = String(formData.get("match_labels_json") ?? "").trim();
  const matchColumnSlug = String(formData.get("match_column_slug") ?? "").trim();

  if (!csvText.trim()) {
    return { error: "points_csv_text wajib diisi", ...empty };
  }
  if (!columnNoBidang || !columnX || !columnY) {
    return {
      error: "column_no_bidang, column_x, dan column_y wajib",
      ...empty,
    };
  }
  if (!matchColumnSlug) {
    return {
      error: "match_column_slug wajib (mis. no_bidang)",
      ...empty,
    };
  }
  if (!keysJsonRaw) {
    return {
      error: "match_keys_json wajib (satu kunci per bidang)",
      ...empty,
    };
  }
  if (csvText.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("CSV titik"),
      ...empty,
    };
  }

  const sridParsed = parseVirtualTablePointsSourceSrid(sourceSridRaw);
  if (!sridParsed.ok) {
    return { error: sridParsed.error, ...empty };
  }
  if (!isPreviewSourceSridSupported(sridParsed.srid)) {
    return {
      error: `EPSG:${sridParsed.srid} belum didukung untuk impor titik. Gunakan SRID dari daftar (UTM/TM-3/WGS84).`,
      ...empty,
    };
  }

  let matchKeys: string[];
  let labelPerIndex: (string | null)[] = [];
  try {
    const parsed = JSON.parse(keysJsonRaw) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        error: "match_keys_json harus berupa JSON array string yang valid.",
        ...empty,
      };
    }
    matchKeys = parsed.map((x) => String(x ?? "").trim());
    if (matchKeys.some((k) => !k)) {
      return {
        error: "Setiap kunci pencocokan pada match_keys_json tidak boleh kosong.",
        ...empty,
      };
    }
  } catch {
    return {
      error: "match_keys_json harus berupa JSON array string yang valid.",
      ...empty,
    };
  }

  if (labelsJsonRaw) {
    try {
      const labelsParsed = JSON.parse(labelsJsonRaw) as unknown;
      if (!Array.isArray(labelsParsed)) {
        return {
          error: "match_labels_json harus berupa JSON array yang valid.",
          ...empty,
        };
      }
      labelPerIndex = labelsParsed.map((x) => {
        const t = String(x ?? "").trim();
        return t.length > 0 ? t : null;
      });
    } catch {
      return {
        error: "match_labels_json harus berupa JSON array yang valid.",
        ...empty,
      };
    }
  }

  const columnMap: PointsImportColumnMap = {
    noBidang: columnNoBidang,
    x: columnX,
    y: columnY,
    ...(columnUrutan ? { urutan: columnUrutan } : {}),
    ...(columnNamaTitik ? { namaTitik: columnNamaTitik } : {}),
  };

  let pointOrderOverrides: Record<string, number[]> | undefined;
  if (pointOrderJsonRaw) {
    try {
      const parsed = JSON.parse(pointOrderJsonRaw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        pointOrderOverrides = parsed as Record<string, number[]>;
      }
    } catch {
      return {
        error: "point_order_json tidak valid.",
        ...empty,
      };
    }
  }

  const { points, errors: pointErrors } = parseSurveyPointsCsv(
    csvText,
    columnMap
  );
  if (points.length === 0) {
    return {
      error:
        pointErrors[0] ??
        "Tidak ada titik valid di CSV. Periksa kolom no_bidang, x, y.",
      ...empty,
    };
  }

  const { polygons, errors: buildErrors } = buildBidangPolygonsFromPoints(
    points,
    columnMap,
    pointOrderOverrides
  );
  if (polygons.length === 0) {
    return {
      error:
        buildErrors[0] ??
        pointErrors[0] ??
        "Tidak ada bidang terbentuk dari titik.",
      ...empty,
    };
  }
  const selfIntersect = polygons.find((p) => p.selfIntersect);
  if (selfIntersect) {
    return {
      error: `Bidang ${selfIntersect.bidangKey} self-intersect. Perbaiki urutan titik.`,
      ...empty,
    };
  }
  if (matchKeys.length !== polygons.length) {
    return {
      error: `match_keys_json harus ${polygons.length} elemen (sama dengan jumlah bidang).`,
      ...empty,
    };
  }
  if (labelPerIndex.length > 0 && labelPerIndex.length !== polygons.length) {
    return {
      error: `match_labels_json harus ${polygons.length} elemen bila diisi.`,
      ...empty,
    };
  }
  while (labelPerIndex.length < polygons.length) {
    labelPerIndex.push(null);
  }

  let fc: GeoJSON.FeatureCollection;
  try {
    fc = buildVirtualTablePointsFeatureCollection(
      polygons,
      matchKeys,
      labelPerIndex,
      matchColumnSlug,
      sridParsed.srid
    );
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Gagal membangun geometri dari titik.";
    return { error: msg, ...empty };
  }

  const geojsonJson = JSON.stringify(fc);
  if (geojsonJson.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("GeoJSON hasil konversi titik"),
      ...empty,
    };
  }

  const inner = new FormData();
  copyVirtualImportFormFields(formData, inner);
  inner.set("geojson_json", geojsonJson);
  return importVirtualRowsGeoJsonBatchAction(inner);
}

export type ImportVirtualRowsSurveyPointsArchiveResult =
  ImportVirtualRowsGeoJsonResult;

/** Arsip titik ukur mentah (Point) tanpa membentuk poligon bidang. */
export async function importVirtualRowsSurveyPointsArchiveAction(
  formData: FormData
): Promise<ImportVirtualRowsSurveyPointsArchiveResult> {
  const empty = {
    inserted: 0,
    updated: 0,
    failed: 0,
    skippedExisting: 0,
    failureSamples: [] as string[],
    inboundLinked: 0,
    inboundLinkFailed: 0,
  };

  const csvText = String(formData.get("points_csv_text") ?? "");
  const columnNoBidang = String(formData.get("column_no_bidang") ?? "").trim();
  const columnX = String(formData.get("column_x") ?? "").trim();
  const columnY = String(formData.get("column_y") ?? "").trim();
  const columnUrutan = String(formData.get("column_urutan") ?? "").trim();
  const columnNamaTitik = String(formData.get("column_nama_titik") ?? "").trim();
  const sourceSridRaw = String(formData.get("source_srid") ?? "4326");
  const matchColumnSlug = String(formData.get("match_column_slug") ?? "").trim();
  const geometryColumnSlug = String(
    formData.get("geometry_column_slug") ?? ""
  ).trim();

  if (!csvText.trim()) {
    return { error: "points_csv_text wajib diisi", ...empty };
  }
  if (!columnNoBidang || !columnX || !columnY) {
    return {
      error: "column_no_bidang, column_x, dan column_y wajib",
      ...empty,
    };
  }
  if (!matchColumnSlug) {
    return {
      error: `match_column_slug wajib (mis. ${SURVEY_POINT_MATCH_COLUMN_SLUG})`,
      ...empty,
    };
  }
  if (!geometryColumnSlug) {
    return { error: "geometry_column_slug wajib", ...empty };
  }
  if (csvText.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("CSV titik"),
      ...empty,
    };
  }

  const sridParsed = parseSurveyPointsArchiveSourceSrid(sourceSridRaw);
  if (!sridParsed.ok) {
    return { error: sridParsed.error, ...empty };
  }
  if (!isPreviewSourceSridSupported(sridParsed.srid)) {
    return {
      error: `EPSG:${sridParsed.srid} belum didukung untuk impor titik. Gunakan SRID dari daftar (UTM/TM-3/WGS84).`,
      ...empty,
    };
  }

  const columnMap: PointsImportColumnMap = {
    noBidang: columnNoBidang,
    x: columnX,
    y: columnY,
    ...(columnUrutan ? { urutan: columnUrutan } : {}),
    ...(columnNamaTitik ? { namaTitik: columnNamaTitik } : {}),
  };

  const { points, errors: pointErrors } = parseSurveyPointsCsv(
    csvText,
    columnMap
  );
  if (points.length === 0) {
    return {
      error:
        pointErrors[0] ??
        "Tidak ada titik valid di CSV. Periksa kolom no_bidang, x, y.",
      ...empty,
    };
  }

  let fc: GeoJSON.FeatureCollection;
  try {
    fc = buildSurveyPointsArchiveFeatureCollection(
      points,
      matchColumnSlug,
      sridParsed.srid
    );
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Gagal membangun titik dari CSV.";
    return { error: msg, ...empty };
  }

  const geojsonJson = JSON.stringify(fc);
  if (geojsonJson.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("GeoJSON titik arsip"),
      ...empty,
    };
  }

  const inner = new FormData();
  copyVirtualImportFormFields(formData, inner);
  inner.set("geojson_json", geojsonJson);
  inner.set("geometry_kind", "point");
  inner.set("match_column_slug", matchColumnSlug);
  inner.set("geometry_column_slug", geometryColumnSlug);
  return importVirtualRowsGeoJsonBatchAction(inner);
}

export type ImportVirtualRowsFieldPointsResult =
  ImportVirtualRowsGeoJsonResult;

function buildFieldPointsImportColumnMap(formData: FormData): {
  ok: true;
  map: FieldPointsImportColumnMap;
} | { ok: false; error: string } {
  const columnX = String(formData.get("column_x") ?? "").trim();
  const columnY = String(formData.get("column_y") ?? "").trim();
  const columnUrutan = String(formData.get("column_urutan") ?? "").trim();
  if (!columnX || !columnY) {
    return { ok: false, error: "column_x dan column_y wajib" };
  }
  return {
    ok: true,
    map: {
      x: columnX,
      y: columnY,
      ...(columnUrutan ? { urutan: columnUrutan } : {}),
    },
  };
}

/** Impor titik lapangan mentah (x,y saja) → Point; label T1,T2… */
export async function importVirtualRowsFieldPointsAction(
  formData: FormData
): Promise<ImportVirtualRowsFieldPointsResult> {
  const empty = {
    inserted: 0,
    updated: 0,
    failed: 0,
    skippedExisting: 0,
    failureSamples: [] as string[],
    inboundLinked: 0,
    inboundLinkFailed: 0,
  };

  const tableId = String(formData.get("table_id") ?? "").trim();
  const csvText = String(formData.get("points_csv_text") ?? "");
  const sourceSridRaw = String(formData.get("source_srid") ?? "4326");
  const matchColumnSlug = String(formData.get("match_column_slug") ?? "").trim();
  const geometryColumnSlug = String(
    formData.get("geometry_column_slug") ?? ""
  ).trim();

  if (!tableId) return { error: "table_id wajib", ...empty };
  if (!csvText.trim()) {
    return { error: "points_csv_text wajib diisi", ...empty };
  }
  if (!matchColumnSlug) {
    return {
      error: `match_column_slug wajib (mis. ${SURVEY_POINT_MATCH_COLUMN_SLUG})`,
      ...empty,
    };
  }
  if (!geometryColumnSlug) {
    return { error: "geometry_column_slug wajib", ...empty };
  }
  if (csvText.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("CSV titik"),
      ...empty,
    };
  }

  const colParsed = buildFieldPointsImportColumnMap(formData);
  if (!colParsed.ok) return { error: colParsed.error, ...empty };

  const sridParsed = parseSurveyPointsArchiveSourceSrid(sourceSridRaw);
  if (!sridParsed.ok) {
    return { error: sridParsed.error, ...empty };
  }
  if (!isPreviewSourceSridSupported(sridParsed.srid)) {
    return {
      error: `EPSG:${sridParsed.srid} belum didukung untuk impor titik. Gunakan SRID dari daftar (UTM/TM-3/WGS84).`,
      ...empty,
    };
  }

  const { points, errors: pointErrors } = parseFieldPointsCsv(
    csvText,
    colParsed.map
  );
  if (points.length === 0) {
    return {
      error:
        pointErrors[0] ??
        "Tidak ada titik valid di CSV. Periksa kolom x dan y.",
      ...empty,
    };
  }

  let fc: GeoJSON.FeatureCollection;
  try {
    fc = buildFieldPointsArchiveFeatureCollection(
      points,
      matchColumnSlug,
      sridParsed.srid
    );
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Gagal membangun titik dari CSV.";
    return { error: msg, ...empty };
  }

  const geojsonJson = JSON.stringify(fc);
  if (geojsonJson.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("GeoJSON titik lapangan"),
      ...empty,
    };
  }

  const inner = new FormData();
  copyVirtualImportFormFields(formData, inner);
  inner.set("table_id", tableId);
  inner.set("geojson_json", geojsonJson);
  inner.set("geometry_kind", "point");
  inner.set("match_column_slug", matchColumnSlug);
  inner.set("geometry_column_slug", geometryColumnSlug);
  return importVirtualRowsGeoJsonBatchAction(inner);
}

export type BootstrapAndImportFieldPointsResult = {
  error: string | null;
  tableId: string | null;
  tableSlug: string | null;
  displayName: string | null;
  inserted: number;
  updated: number;
  failed: number;
  skippedExisting: number;
  failureSamples: string[];
};

/** Buat tabel titik lapangan + impor CSV mentah dalam satu langkah. */
export async function bootstrapAndImportFieldPointsAction(
  formData: FormData
): Promise<BootstrapAndImportFieldPointsResult> {
  const emptyResult = {
    tableId: null as string | null,
    tableSlug: null as string | null,
    displayName: null as string | null,
    inserted: 0,
    updated: 0,
    failed: 0,
    skippedExisting: 0,
    failureSamples: [] as string[],
  };

  const bootstrapFd = new FormData();
  bootstrapFd.set("project_id", String(formData.get("project_id") ?? ""));
  bootstrapFd.set(
    "display_name",
    String(formData.get("display_name") ?? "").trim() ||
      defaultFieldPointTableName()
  );
  const description = String(formData.get("description") ?? "").trim();
  if (description) bootstrapFd.set("description", description);

  const boot = await bootstrapVirtualTableSurveyPointsAction(bootstrapFd);
  if (boot.error || !boot.tableId) {
    return { error: boot.error ?? "Gagal membuat tabel titik", ...emptyResult };
  }

  const importFd = new FormData();
  for (const key of [
    "points_csv_text",
    "column_x",
    "column_y",
    "column_urutan",
    "source_srid",
    "upsert_mode",
    "link_inbound_relations",
  ]) {
    const v = formData.get(key);
    if (v != null) importFd.set(key, String(v));
  }
  importFd.set("table_id", boot.tableId);
  importFd.set("match_column_slug", SURVEY_POINT_MATCH_COLUMN_SLUG);
  importFd.set("geometry_column_slug", SURVEY_POINT_GEOM_SLUG);

  const imported = await importVirtualRowsFieldPointsAction(importFd);
  if (imported.error) {
    return {
      error: `Tabel «${boot.displayName}» dibuat, tetapi impor gagal: ${imported.error}`,
      tableId: boot.tableId,
      tableSlug: boot.tableSlug,
      displayName: boot.displayName,
      inserted: imported.inserted,
      updated: imported.updated,
      failed: imported.failed,
      skippedExisting: imported.skippedExisting,
      failureSamples: imported.failureSamples,
    };
  }

  return {
    error: null,
    tableId: boot.tableId,
    tableSlug: boot.tableSlug,
    displayName: boot.displayName,
    inserted: imported.inserted,
    updated: imported.updated,
    failed: imported.failed,
    skippedExisting: imported.skippedExisting,
    failureSamples: imported.failureSamples,
  };
}

export type RegenerateBidangFromSurveyPointsResult = {
  error: string | null;
  regenerated: number;
  failed: number;
  skipped: number;
  failureSamples: string[];
};

/** Bangun ulang poligon bidang dari titik arsip (WGS84) yang sudah tersimpan. */
export async function regenerateBidangPolygonsFromSurveyPointsAction(
  formData: FormData
): Promise<RegenerateBidangFromSurveyPointsResult> {
  const empty = {
    regenerated: 0,
    failed: 0,
    skipped: 0,
    failureSamples: [] as string[],
  };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", ...empty };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", ...empty };

  const bidangTableId = String(formData.get("bidang_table_id") ?? "").trim();
  const pointsTableId = String(formData.get("points_table_id") ?? "").trim();
  const bidangGeometrySlug = String(
    formData.get("bidang_geometry_column_slug") ?? ""
  ).trim();
  const bidangMatchSlug = String(
    formData.get("bidang_match_column_slug") ?? ""
  ).trim();
  const pointsNoBidangSlug = String(
    formData.get("points_no_bidang_column_slug") ?? "no_bidang"
  ).trim();
  const pointsUrutanSlug = String(
    formData.get("points_urutan_column_slug") ?? "urutan"
  ).trim();
  const pointsGeometrySlug = String(
    formData.get("points_geometry_column_slug") ?? ""
  ).trim();
  const filterNoBidang = String(formData.get("filter_no_bidang") ?? "").trim();
  const upsertMode = String(formData.get("upsert_mode") ?? "upsert").trim();

  if (!bidangTableId || !pointsTableId) {
    return { error: "bidang_table_id dan points_table_id wajib", ...empty };
  }
  if (!bidangGeometrySlug || !bidangMatchSlug || !pointsGeometrySlug) {
    return {
      error:
        "bidang_geometry_column_slug, bidang_match_column_slug, dan points_geometry_column_slug wajib",
      ...empty,
    };
  }

  const { data: pointsRowsRaw, error: pointsErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, payload")
    .eq("table_id", pointsTableId)
    .is("deleted_at", null);

  if (pointsErr) return { error: pointsErr.message, ...empty };

  const grouped = groupArchivedPointsByBidang(
    (pointsRowsRaw ?? []).map((r) => ({
      rowId: (r as { id: string }).id,
      payload:
        ((r as { payload: Record<string, unknown> | null }).payload as Record<
          string,
          unknown
        >) ?? {},
    })),
    pointsNoBidangSlug,
    pointsUrutanSlug,
    pointsGeometrySlug
  );

  if (grouped.size === 0) {
    return {
      error: "Tidak ada titik arsip yang bisa dibaca dari tabel titik.",
      ...empty,
    };
  }

  const targets = filterNoBidang
    ? (() => {
        const pts = grouped.get(filterNoBidang);
        return pts ? new Map([[filterNoBidang, pts]]) : new Map();
      })()
    : grouped;

  if (targets.size === 0) {
    return {
      error: `Tidak ada titik untuk no_bidang "${filterNoBidang}".`,
      ...empty,
    };
  }

  const { data: bidangRowsRaw, error: bidangErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, payload")
    .eq("table_id", bidangTableId)
    .is("deleted_at", null);

  if (bidangErr) return { error: bidangErr.message, ...empty };

  const existingByKey = new Map<
    string,
    { id: string; payload: Record<string, unknown> }
  >();
  for (const row of bidangRowsRaw ?? []) {
    const r = row as { id: string; payload: Record<string, unknown> | null };
    const payload = r.payload ?? {};
    const norm = normalizeVirtualTableMatchKey(payload[bidangMatchSlug]);
    if (norm) existingByKey.set(norm, { id: r.id, payload });
  }

  let regenerated = 0;
  let failed = 0;
  let skipped = 0;
  const failureSamples: string[] = [];

  const { data: maxSortRow } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("sort_order")
    .eq("table_id", bidangTableId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextSort =
    ((maxSortRow as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  for (const [noBidang, pts] of targets as Map<string, ArchivedSurveyPointRow[]>) {
    const built = buildPolygonRingFromArchivedPoints(pts);
    if (!built.ok) {
      failed++;
      if (failureSamples.length < 12) {
        failureSamples.push(`${noBidang}: ${built.error}`);
      }
      continue;
    }

    let feature: GeoJSON.Feature;
    try {
      const ringLatLng = pts.map((p) => ({ lat: p.lat, lng: p.lng }));
      feature = buildDrawnBidangGeoJsonFeature(
        ringLatLng,
        noBidang,
        bidangMatchSlug,
        `Bidang ${noBidang}`
      );
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : "Gagal membangun poligon";
      if (failureSamples.length < 12) {
        failureSamples.push(`${noBidang}: ${msg}`);
      }
      continue;
    }

    const storedGeom = featureToStoredGeometry(feature.geometry, {});
    if (!storedGeom) {
      failed++;
      if (failureSamples.length < 12) {
        failureSamples.push(`${noBidang}: geometri poligon tidak valid`);
      }
      continue;
    }

    const matchNorm = normalizeVirtualTableMatchKey(noBidang);
    if (!matchNorm) {
      failed++;
      continue;
    }

    const patch: Record<string, unknown> = {
      [bidangMatchSlug]: noBidang,
      [bidangGeometrySlug]: storedGeom,
      source: "regenerated_from_survey_points",
    };
    if (Object.prototype.hasOwnProperty.call(existingByKey.get(matchNorm)?.payload ?? {}, "title")) {
      patch.title = `Bidang ${noBidang}`;
    }

    const existing = existingByKey.get(matchNorm);
    if (existing) {
      if (upsertMode === "insert_only") {
        skipped++;
        continue;
      }
      const merged = { ...existing.payload, ...patch };
      const { error: updErr } = await supabase
        .schema("core_pm")
        .from("virtual_rows")
        .update({
          payload: merged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) {
        failed++;
        if (failureSamples.length < 12) {
          failureSamples.push(`${noBidang}: ${updErr.message}`);
        }
      } else {
        regenerated++;
        existingByKey.set(matchNorm, { id: existing.id, payload: merged });
      }
      continue;
    }

    const { error: insErr } = await supabase
      .schema("core_pm")
      .from("virtual_rows")
      .insert({
        table_id: bidangTableId,
        payload: patch,
        sort_order: nextSort++,
        created_by: user.id,
      });
    if (insErr) {
      failed++;
      if (failureSamples.length < 12) {
        failureSamples.push(`${noBidang}: ${insErr.message}`);
      }
    } else {
      regenerated++;
    }
  }

  revalidatePath("/");
  return {
    error:
      regenerated === 0 && failed > 0
        ? failureSamples[0] ?? "Regenerasi gagal"
        : null,
    regenerated,
    failed,
    skipped,
    failureSamples,
  };
}

export type BootstrapVirtualTableSurveyPointsResult = {
  error: string | null;
  tableId: string | null;
  tableSlug: string | null;
  displayName: string | null;
};

/** Buat tabel virtual baru khusus arsip titik ukur (skema standar). */
export async function bootstrapVirtualTableSurveyPointsAction(
  formData: FormData
): Promise<BootstrapVirtualTableSurveyPointsResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      error: "Supabase tidak dikonfigurasi",
      tableId: null,
      tableSlug: null,
      displayName: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Belum masuk",
      tableId: null,
      tableSlug: null,
      displayName: null,
    };
  }

  const projectId = String(formData.get("project_id") ?? "").trim();
  const displayName =
    String(formData.get("display_name") ?? "").trim() ||
    defaultSurveyPointTableName();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!projectId) {
    return {
      error: "project_id wajib",
      tableId: null,
      tableSlug: null,
      displayName: null,
    };
  }

  const baseSlug = slugify(displayName);
  if (!baseSlug) {
    return {
      error: "Nama tabel tidak valid untuk slug",
      tableId: null,
      tableSlug: null,
      displayName: null,
    };
  }

  const { data: existing } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("slug")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .like("slug", `${baseSlug}%`);

  const existingSlugs = new Set(
    (existing ?? []).map((r: { slug: string }) => r.slug)
  );
  let slug = baseSlug;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}_${suffix}`;
    suffix++;
  }

  const { data: maxSort } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("sort_order")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder =
    ((maxSort as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data: table, error: tableErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .insert({
      project_id: projectId,
      slug,
      display_name: displayName,
      description,
      icon: "📍",
      sort_order: nextSortOrder,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (tableErr) {
    return {
      error: tableErr.message,
      tableId: null,
      tableSlug: null,
      displayName: null,
    };
  }

  const tableId = (table as { id: string }).id;
  const { error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .insert(
      SURVEY_POINT_COLUMN_DEFS.map((c) => ({
        table_id: tableId,
        slug: c.slug,
        display_name: c.display_name,
        data_type: c.data_type,
        position: c.position,
        is_required: c.is_required,
        config: {},
      }))
    );

  if (colErr) {
    await softDeleteVirtualTableById(supabase, tableId);
    return {
      error: colErr.message,
      tableId: null,
      tableSlug: null,
      displayName: null,
    };
  }

  revalidatePath("/");
  return {
    error: null,
    tableId,
    tableSlug: slug,
    displayName,
  };
}

export type BootstrapVirtualTableWorkbenchLayerResult = {
  error: string | null;
  tableId: string | null;
  tableSlug: string | null;
  displayName: string | null;
  layerKind: WorkbenchLayerKind | null;
};

/** Buat tabel virtual kosong untuk digitasi Bidang / Jalan / Saluran di peta. */
export async function bootstrapVirtualTableWorkbenchLayerAction(
  formData: FormData
): Promise<BootstrapVirtualTableWorkbenchLayerResult> {
  const empty = {
    tableId: null as string | null,
    tableSlug: null as string | null,
    displayName: null as string | null,
    layerKind: null as WorkbenchLayerKind | null,
  };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", ...empty };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", ...empty };

  const projectId = String(formData.get("project_id") ?? "").trim();
  const layerKind = parseWorkbenchLayerKind(
    String(formData.get("layer_kind") ?? "")
  );
  const displayName =
    String(formData.get("display_name") ?? "").trim() ||
    (layerKind ? defaultWorkbenchLayerTableName(layerKind) : "");
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!projectId) return { error: "project_id wajib", ...empty };
  if (!layerKind) {
    return { error: "layer_kind harus bidang, jalan, atau saluran", ...empty };
  }
  if (!displayName) {
    return { error: "Nama tabel wajib diisi", ...empty };
  }

  const baseSlug = slugify(displayName);
  if (!baseSlug) {
    return { error: "Nama tabel tidak valid untuk slug", ...empty };
  }

  const { data: existing } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("slug")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .like("slug", `${baseSlug}%`);

  const existingSlugs = new Set(
    (existing ?? []).map((r: { slug: string }) => r.slug)
  );
  let slug = baseSlug;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}_${suffix}`;
    suffix++;
  }

  const { data: maxSort } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("sort_order")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder =
    ((maxSort as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data: table, error: tableErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .insert({
      project_id: projectId,
      slug,
      display_name: displayName,
      description,
      icon: WORKBENCH_LAYER_KIND_ICONS[layerKind],
      sort_order: nextSortOrder,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (tableErr) {
    return { error: tableErr.message, ...empty };
  }

  const tableId = (table as { id: string }).id;
  const columnDefs = workbenchLayerColumnDefs(layerKind);
  const { error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .insert(
      columnDefs.map((c) => ({
        table_id: tableId,
        slug: c.slug,
        display_name: c.display_name,
        data_type: c.data_type,
        position: c.position,
        is_required: c.is_required,
        config: {},
      }))
    );

  if (colErr) {
    await softDeleteVirtualTableById(supabase, tableId);
    return { error: colErr.message, ...empty };
  }

  revalidatePath("/");
  return {
    error: null,
    tableId,
    tableSlug: slug,
    displayName,
    layerKind,
  };
}

export type ImportVirtualRowsDrawnPolygonResult = ImportVirtualRowsGeoJsonResult;

/** Simpan satu poligon digambar di peta (WGS84) → virtual_rows. */
export async function importVirtualRowsDrawnPolygonBatchAction(
  formData: FormData
): Promise<ImportVirtualRowsDrawnPolygonResult> {
  const empty = {
    inserted: 0,
    updated: 0,
    failed: 0,
    skippedExisting: 0,
    failureSamples: [] as string[],
  };

  const tableId = String(formData.get("table_id") ?? "").trim();
  const ringJsonRaw = String(formData.get("ring_json") ?? "").trim();
  const geometryColumnSlug = String(
    formData.get("geometry_column_slug") ?? ""
  ).trim();
  const matchColumnSlug = String(formData.get("match_column_slug") ?? "").trim();
  const matchKey = String(formData.get("match_key") ?? "").trim();
  const labelRaw = String(formData.get("label") ?? "").trim();
  const upsertMode = String(formData.get("upsert_mode") ?? "upsert").trim();

  if (!tableId) return { error: "table_id kosong", ...empty };
  if (!ringJsonRaw) return { error: "ring_json wajib", ...empty };
  if (!geometryColumnSlug) {
    return { error: "geometry_column_slug wajib", ...empty };
  }
  if (!matchColumnSlug) {
    return { error: "match_column_slug wajib", ...empty };
  }
  if (!matchKey) {
    return { error: "match_key wajib (nomor bidang)", ...empty };
  }

  let ring: LatLngPoint[];
  try {
    const parsed = JSON.parse(ringJsonRaw) as unknown;
    if (!Array.isArray(parsed)) {
      return { error: "ring_json harus array titik {lat,lng}.", ...empty };
    }
    ring = parsed.map((p) => {
      const o = p as { lat?: unknown; lng?: unknown };
      const lat = Number(o.lat);
      const lng = Number(o.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Koordinat titik tidak valid.");
      }
      return { lat, lng };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ring_json tidak valid.";
    return { error: msg, ...empty };
  }

  const validation = validateDrawnBidangRing(ring);
  if (!validation.ok) {
    return { error: validation.error, ...empty };
  }

  let feature: GeoJSON.Feature;
  try {
    feature = buildDrawnBidangGeoJsonFeature(
      ring,
      matchKey,
      matchColumnSlug,
      labelRaw || null
    );
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Gagal membangun geometri dari gambar.";
    return { error: msg, ...empty };
  }

  const fc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [feature],
  };
  const geojsonJson = JSON.stringify(fc);

  const inner = new FormData();
  copyVirtualImportFormFields(formData, inner);
  inner.set("table_id", tableId);
  inner.set("geometry_column_slug", geometryColumnSlug);
  inner.set("match_column_slug", matchColumnSlug);
  inner.set("upsert_mode", upsertMode);
  inner.set("match_keys_json", JSON.stringify([matchKey]));
  inner.set(
    "match_labels_json",
    JSON.stringify([labelRaw || null])
  );
  inner.set("geojson_json", geojsonJson);
  return importVirtualRowsGeoJsonBatchAction(inner);
}

export type ImportVirtualRowsDrawnLineResult = ImportVirtualRowsGeoJsonResult;

/** Simpan satu LineString digambar di peta (WGS84) → virtual_rows. */
export async function importVirtualRowsDrawnLineBatchAction(
  formData: FormData
): Promise<ImportVirtualRowsDrawnLineResult> {
  const empty = {
    inserted: 0,
    updated: 0,
    failed: 0,
    skippedExisting: 0,
    failureSamples: [] as string[],
  };

  const tableId = String(formData.get("table_id") ?? "").trim();
  const lineJsonRaw = String(formData.get("line_json") ?? "").trim();
  const geometryColumnSlug = String(
    formData.get("geometry_column_slug") ?? ""
  ).trim();
  const matchColumnSlug = String(formData.get("match_column_slug") ?? "").trim();
  const matchKey = String(formData.get("match_key") ?? "").trim();
  const labelRaw = String(formData.get("label") ?? "").trim();
  const upsertMode = String(formData.get("upsert_mode") ?? "upsert").trim();

  if (!tableId) return { error: "table_id kosong", ...empty };
  if (!lineJsonRaw) return { error: "line_json wajib", ...empty };
  if (!geometryColumnSlug) {
    return { error: "geometry_column_slug wajib", ...empty };
  }
  if (!matchColumnSlug) {
    return { error: "match_column_slug wajib", ...empty };
  }
  if (!matchKey) {
    return { error: "match_key wajib (kode garis)", ...empty };
  }

  let points: LatLngPoint[];
  try {
    const parsed = JSON.parse(lineJsonRaw) as unknown;
    if (!Array.isArray(parsed)) {
      return { error: "line_json harus array titik {lat,lng}.", ...empty };
    }
    points = parsed.map((p) => {
      const o = p as { lat?: unknown; lng?: unknown };
      const lat = Number(o.lat);
      const lng = Number(o.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Koordinat titik tidak valid.");
      }
      return { lat, lng };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "line_json tidak valid.";
    return { error: msg, ...empty };
  }

  const validation = validateDrawnLine(points);
  if (!validation.ok) {
    return { error: validation.error, ...empty };
  }

  let feature: GeoJSON.Feature;
  try {
    feature = buildDrawnLineGeoJsonFeature(
      points,
      matchKey,
      matchColumnSlug,
      labelRaw || null
    );
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Gagal membangun geometri garis.";
    return { error: msg, ...empty };
  }

  const fc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [feature],
  };
  const geojsonJson = JSON.stringify(fc);

  const inner = new FormData();
  copyVirtualImportFormFields(formData, inner);
  inner.set("table_id", tableId);
  inner.set("geometry_column_slug", geometryColumnSlug);
  inner.set("match_column_slug", matchColumnSlug);
  inner.set("upsert_mode", upsertMode);
  inner.set("geometry_kind", "linestring");
  inner.set("match_keys_json", JSON.stringify([matchKey]));
  inner.set(
    "match_labels_json",
    JSON.stringify([labelRaw || null])
  );
  inner.set("geojson_json", geojsonJson);
  return importVirtualRowsGeoJsonBatchAction(inner);
}

/** Fase 8A — perbarui kolom geometri satu baris virtual (translasi di peta). */
export async function updateVirtualRowGeometryAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const rowId = String(formData.get("row_id") ?? "").trim();
  const geometryColumnSlug = String(
    formData.get("geometry_column_slug") ?? ""
  ).trim();
  const geometryJsonRaw = String(formData.get("geometry_json") ?? "").trim();

  if (!rowId) return { error: "row_id kosong" };
  if (!geometryColumnSlug) return { error: "geometry_column_slug wajib" };
  if (!geometryJsonRaw) return { error: "geometry_json wajib" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(geometryJsonRaw);
  } catch {
    return { error: "geometry_json tidak valid." };
  }

  const kind = geometryKindFromStored(parsed);
  if (!kind) {
    return { error: "Geometri tidak dikenali (Point / LineString / Polygon)." };
  }

  const { data: row, error: rowErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("payload, table_id")
    .eq("id", rowId)
    .is("deleted_at", null)
    .maybeSingle();

  if (rowErr) return { error: rowErr.message };
  if (!row) return { error: "Baris tidak ditemukan" };

  const { payload: currentPayload, table_id } = row as {
    payload: Record<string, unknown>;
    table_id: string;
  };

  const { data: col } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type, is_required, config")
    .eq("table_id", table_id)
    .eq("slug", geometryColumnSlug)
    .maybeSingle();

  if (!col || (col as { data_type: string }).data_type !== "geometry") {
    return { error: `Kolom geometri «${geometryColumnSlug}» tidak ditemukan` };
  }

  const obj = parsed as {
    type?: string;
    geometry?: unknown;
    properties?: Record<string, unknown>;
  };
  const geom = obj.type === "Feature" ? obj.geometry : parsed;
  const props =
    obj.type === "Feature" && obj.properties
      ? obj.properties
      : (currentPayload as Record<string, unknown>);

  let stored:
    | ReturnType<typeof featureToStoredGeometry>
    | ReturnType<typeof featureToStoredPointGeometry>
    | ReturnType<typeof featureToStoredLineGeometry>
    | null = null;

  if (kind === "point") {
    stored = featureToStoredPointGeometry(geom, props);
  } else if (kind === "linestring") {
    stored = featureToStoredLineGeometry(geom, props);
  } else {
    stored = featureToStoredGeometry(geom, props);
  }

  if (!stored) {
    return { error: "Geometri tidak valid setelah konversi." };
  }

  const oldValue = currentPayload[geometryColumnSlug];
  const newPayload = { ...currentPayload, [geometryColumnSlug]: stored };

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .update({ payload: newPayload, updated_at: new Date().toISOString() })
    .eq("id", rowId)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  if (!cellValuesEqual(oldValue, stored)) {
    const scope = await resolveVirtualTableScope(supabase, table_id);
    if (scope) {
      const { data: allCols } = await supabase
        .schema("core_pm")
        .from("virtual_columns")
        .select("slug, display_name, data_type, position")
        .eq("table_id", table_id)
        .order("position");

      const label = rowLabelFromPayload(
        newPayload,
        (allCols ?? []) as {
          slug: string;
          display_name: string;
          data_type: string;
          position: number;
        }[],
        rowId
      );

      await writeVirtualTableAuditLog(supabase, scope, {
        actorUserId: user.id,
        action: "virtual_row.geometry_updated",
        entity: "core_pm.virtual_rows",
        entityId: rowId,
        payload: {
          column_slug: geometryColumnSlug,
          table_display_name: scope.displayName,
          row_label: label,
          source: "move_geom_tool",
        },
      });
    }
  }

  revalidatePath("/");
  return { error: null };
}

export type BootstrapVirtualTableLayerResult = {
  error: string | null;
  tableId: string | null;
  tableSlug: string | null;
  displayName: string | null;
  inserted: number;
  failed: number;
  failureSamples: string[];
};

type LayerShellResult =
  | { ok: true; tableId: string; slug: string }
  | { ok: false; error: string };

async function softDeleteVirtualTableById(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  tableId: string
): Promise<void> {
  await supabase.schema("core_pm").rpc("soft_delete_virtual_table", {
    p_table_id: tableId,
  });
}

async function createVirtualTableLayerShell(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  userId: string,
  projectId: string,
  displayName: string,
  description: string | null
): Promise<LayerShellResult> {
  const baseSlug = slugify(displayName);
  if (!baseSlug) {
    return { ok: false, error: "Nama layer tidak valid untuk slug" };
  }

  const { data: existing } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("slug")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .like("slug", `${baseSlug}%`);

  const existingSlugs = new Set(
    (existing ?? []).map((r: { slug: string }) => r.slug)
  );
  let slug = baseSlug;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}_${suffix}`;
    suffix++;
  }

  const { data: maxSort } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("sort_order")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder =
    ((maxSort as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data: table, error: tableErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .insert({
      project_id: projectId,
      slug,
      display_name: displayName,
      description,
      icon: "🗺️",
      sort_order: nextSortOrder,
      created_by: userId,
    })
    .select("id")
    .single();

  if (tableErr) return { ok: false, error: tableErr.message };
  const tableId = (table as { id: string }).id;

  const { error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .insert(
      LAYER_COLUMN_DEFS.map((c) => ({
        table_id: tableId,
        slug: c.slug,
        display_name: c.display_name,
        data_type: c.data_type,
        position: c.position,
        is_required: c.is_required,
        config: {},
      }))
    );

  if (colErr) {
    await softDeleteVirtualTableById(supabase, tableId);
    return { ok: false, error: colErr.message };
  }

  return { ok: true, tableId, slug };
}

/**
 * Surveyor: unggah GeoJSON/DXF → tabel virtual baru (no_bidang + geom + title).
 * Admin dapat menambah kolom / impor CSV nanti di tabel yang sama.
 */
export async function bootstrapVirtualTableLayerFromSpatialAction(
  formData: FormData
): Promise<BootstrapVirtualTableLayerResult> {
  const empty = {
    tableId: null as string | null,
    tableSlug: null as string | null,
    displayName: null as string | null,
    inserted: 0,
    failed: 0,
    failureSamples: [] as string[],
  };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", ...empty };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", ...empty };

  const projectId = String(formData.get("project_id") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const sourceFormat = String(formData.get("source_format") ?? "geojson")
    .trim()
    .toLowerCase();
  const featureKeyPrefix = String(formData.get("feature_key_prefix") ?? "").trim();

  if (!projectId) return { error: "project_id wajib", ...empty };
  if (!displayName) return { error: "Nama layer/tabel wajib diisi", ...empty };
  if (sourceFormat !== "geojson" && sourceFormat !== "dxf") {
    return { error: "source_format harus geojson atau dxf", ...empty };
  }

  let expectedPolygonCount = 0;
  let dxfGeometryType: "polygon" | "point" | "linestring" = "polygon";
  if (sourceFormat === "dxf") {
    const raw = String(formData.get("dxf_geometry_type") ?? "polygon")
      .trim()
      .toLowerCase();
    dxfGeometryType =
      raw === "point"
        ? "point"
        : raw === "linestring"
          ? "linestring"
          : "polygon";
  }

  if (sourceFormat === "geojson") {
    const geojsonRaw = String(formData.get("geojson_json") ?? "");
    if (!geojsonRaw.trim()) {
      return { error: "geojson_json kosong", ...empty };
    }
    if (geojsonRaw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
      return {
        error: spatialGeometryTextTooLargeMessage("GeoJSON"),
        ...empty,
      };
    }
    const parsed = parseFeatureCollectionForVirtualImport(geojsonRaw);
    if (!parsed.ok) return { error: parsed.error, ...empty };
    expectedPolygonCount = parsed.rows.length;
  } else {
    const dxfText = String(formData.get("dxf_text") ?? "");
    const layerName = String(formData.get("layer_name") ?? "").trim();
    if (!dxfText.trim() || !layerName) {
      return { error: "dxf_text dan layer_name wajib", ...empty };
    }
    if (dxfText.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
      return {
        error: spatialGeometryTextTooLargeMessage("DXF"),
        ...empty,
      };
    }
    const keysJsonRaw = String(formData.get("match_keys_json") ?? "").trim();
    if (!keysJsonRaw) {
      return { error: "match_keys_json wajib untuk DXF", ...empty };
    }
    let dxf: ReturnType<typeof parseDxfDocument>;
    try {
      dxf = parseDxfDocument(dxfText);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal membaca DXF.";
      return { error: msg, ...empty };
    }
    let matchKeys: string[];
    try {
      const parsed = JSON.parse(keysJsonRaw) as unknown;
      if (!Array.isArray(parsed)) {
        return { error: "match_keys_json tidak valid", ...empty };
      }
      matchKeys = parsed.map((x) => String(x ?? "").trim());
    } catch {
      return { error: "match_keys_json tidak valid", ...empty };
    }

    if (dxfGeometryType === "point") {
      const points = extractPointsFromDxfLayer(dxf, layerName);
      if (points.length === 0) {
        return {
          error:
            "Tidak ada entitas POINT pada layer DXF yang dipilih.",
          ...empty,
        };
      }
      if (
        matchKeys.length !== points.length ||
        matchKeys.some((k) => !k)
      ) {
        return {
          error: `match_keys_json harus ${points.length} kunci non-kosong.`,
          ...empty,
        };
      }
      expectedPolygonCount = points.length;
    } else if (dxfGeometryType === "linestring") {
      const paths = extractOpenLineStringsFromDxfLayer(dxf, layerName);
      if (paths.length === 0) {
        return {
          error:
            "Tidak ada garis terbuka (LINE/LWPOLYLINE) pada layer DXF yang dipilih.",
          ...empty,
        };
      }
      if (
        matchKeys.length !== paths.length ||
        matchKeys.some((k) => !k)
      ) {
        return {
          error: `match_keys_json harus ${paths.length} kunci non-kosong.`,
          ...empty,
        };
      }
      expectedPolygonCount = paths.length;
    } else {
      const rings = extractClosedPolygonRingsFromDxfLayer(
        dxf,
        layerName,
        dxfText
      );
      if (rings.length === 0) {
        return {
          error: "Tidak ada poligon tertutup di layer DXF yang dipilih.",
          ...empty,
        };
      }
      if (matchKeys.length !== rings.length || matchKeys.some((k) => !k)) {
        return {
          error: `match_keys_json harus ${rings.length} kunci non-kosong.`,
          ...empty,
        };
      }
      expectedPolygonCount = rings.length;
    }
  }

  const shell = await createVirtualTableLayerShell(
    supabase,
    user.id,
    projectId,
    displayName,
    description
  );
  if (!shell.ok) return { error: shell.error, ...empty };

  const importFd = new FormData();
  importFd.set("table_id", shell.tableId);
  importFd.set("geometry_column_slug", LAYER_GEOMETRY_COLUMN_SLUG);
  importFd.set("match_column_slug", LAYER_MATCH_COLUMN_SLUG);
  importFd.set("upsert_mode", "insert_only");
  if (featureKeyPrefix) importFd.set("feature_key_prefix", featureKeyPrefix);

  let importResult: ImportVirtualRowsGeoJsonResult;

  if (sourceFormat === "geojson") {
    importFd.set("geojson_json", String(formData.get("geojson_json") ?? ""));
    importResult = await importVirtualRowsGeoJsonBatchAction(importFd);
  } else {
    importFd.set("dxf_text", String(formData.get("dxf_text") ?? ""));
    importFd.set("layer_name", String(formData.get("layer_name") ?? ""));
    importFd.set("source_srid", String(formData.get("source_srid") ?? "4326"));
    importFd.set("dxf_geometry_type", dxfGeometryType);
    importFd.set("match_keys_json", String(formData.get("match_keys_json") ?? ""));
    const labels = formData.get("match_labels_json");
    if (labels != null && String(labels).trim()) {
      importFd.set("match_labels_json", String(labels));
    }
    importResult = await importVirtualRowsDxfBatchAction(importFd);
  }

  if (importResult.error || importResult.inserted === 0) {
    await softDeleteVirtualTableById(supabase, shell.tableId);
    const geomLabel = dxfGeometryType === "point" ? "titik" : "poligon";
    const failHint =
      importResult.failureSamples.length > 0
        ? ` (${importResult.failureSamples.slice(0, 3).join("; ")})`
        : "";
    return {
      error:
        importResult.error ??
        `Tidak ada ${geomLabel} yang tersimpan (${importResult.failed} gagal).${failHint}`,
      ...empty,
    };
  }

  await writeProjectAuditLog(supabase, {
    projectId,
    actorUserId: user.id,
    action: "virtual_table.layer_bootstrap",
    entity: "core_pm.virtual_tables",
    entityId: shell.tableId,
    payload: {
      display_name: displayName,
      slug: shell.slug,
      source_format: sourceFormat,
      inserted: importResult.inserted,
      expected_polygons: expectedPolygonCount,
    },
  });

  revalidatePath("/", "layout");
  return {
    error: null,
    tableId: shell.tableId,
    tableSlug: shell.slug,
    displayName,
    inserted: importResult.inserted,
    failed: importResult.failed,
    failureSamples: importResult.failureSamples,
  };
}

export async function updateVirtualRowCellAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const rowId = String(formData.get("row_id") ?? "").trim();
  const columnSlug = String(formData.get("column_slug") ?? "").trim();
  const valueRaw = formData.get("value");

  if (!rowId) return { error: "row_id kosong" };
  if (!columnSlug) return { error: "column_slug kosong" };

  // Fetch current row
  const { data: row, error: rowErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("payload, table_id")
    .eq("id", rowId)
    .is("deleted_at", null)
    .maybeSingle();

  if (rowErr) return { error: rowErr.message };
  if (!row) return { error: "Baris tidak ditemukan" };

  const { payload: currentPayload, table_id } = row as {
    payload: Record<string, unknown>;
    table_id: string;
  };

  // Fetch column definition for validation
  const { data: col } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type, is_required, config")
    .eq("table_id", table_id)
    .eq("slug", columnSlug)
    .maybeSingle();

  let parsedValue: unknown = valueRaw;
  if (typeof valueRaw === "string") {
    // Try to parse JSON values (for checkbox booleans, etc.)
    try {
      parsedValue = JSON.parse(valueRaw);
    } catch {
      parsedValue = valueRaw;
    }
  }

  if (col) {
    const c = col as {
      slug: string;
      display_name: string;
      data_type: string;
      is_required: boolean;
      config: Record<string, unknown> | null;
    };
    const err = validateCellValue(parsedValue, c.data_type, c.is_required, c.display_name);
    if (err) return { error: err };
  }

  const oldValue = currentPayload[columnSlug];

  const newPayload = { ...currentPayload };
  if (parsedValue == null || parsedValue === "") {
    delete newPayload[columnSlug];
  } else {
    newPayload[columnSlug] = parsedValue;
  }

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .update({ payload: newPayload, updated_at: new Date().toISOString() })
    .eq("id", rowId)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  if (
    col &&
    !cellValuesEqual(
      oldValue,
      parsedValue == null || parsedValue === "" ? undefined : parsedValue
    )
  ) {
    const c = col as {
      display_name: string;
      data_type: string;
      config: Record<string, unknown> | null;
    };
    const scope = await resolveVirtualTableScope(supabase, table_id);
    if (scope) {
      const { data: allCols } = await supabase
        .schema("core_pm")
        .from("virtual_columns")
        .select("slug, display_name, data_type, position")
        .eq("table_id", table_id)
        .order("position");

      const label = rowLabelFromPayload(
        newPayload,
        (allCols ?? []) as {
          slug: string;
          display_name: string;
          data_type: string;
          position: number;
        }[],
        rowId
      );

      const newStored =
        parsedValue == null || parsedValue === "" ? null : parsedValue;
      const oldStored = oldValue === undefined ? null : oldValue;

      await writeVirtualTableAuditLog(supabase, scope, {
        actorUserId: user.id,
        action: "virtual_row.cell_changed",
        entity: "core_pm.virtual_rows",
        entityId: rowId,
        payload: {
          column_slug: columnSlug,
          column_display_name: c.display_name,
          table_display_name: scope.displayName,
          old_value: formatCellValueForNotification(oldStored, c.data_type),
          new_value: formatCellValueForNotification(newStored, c.data_type),
          row_label: label,
        },
      });
    }
  }

  return { error: null };
}

export async function updateVirtualRowAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const rowId = String(formData.get("row_id") ?? "").trim();
  if (!rowId) return { error: "row_id kosong" };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "payload bukan JSON valid" };
  }

  // Fetch table_id for column validation
  const { data: row } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("table_id")
    .eq("id", rowId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!row) return { error: "Baris tidak ditemukan" };

  const { table_id } = row as { table_id: string };

  // Validate all values against column definitions
  const { data: columns } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type, is_required")
    .eq("table_id", table_id)
    .order("position");

  if (columns) {
    for (const col of columns as {
      slug: string;
      display_name: string;
      data_type: string;
      is_required: boolean;
    }[]) {
      const err = validateCellValue(
        payload[col.slug],
        col.data_type,
        col.is_required,
        col.display_name
      );
      if (err) return { error: err };
    }
  }

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .update({ payload, updated_at: new Date().toISOString() })
    .eq("id", rowId)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  return { error: null };
}

export async function deleteVirtualRowAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const rowId = String(formData.get("row_id") ?? "").trim();
  if (!rowId) return { error: "row_id kosong" };

  const { data: rowBefore } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("table_id")
    .eq("id", rowId)
    .is("deleted_at", null)
    .maybeSingle();

  const { error } = await supabase.schema("core_pm").rpc("soft_delete_virtual_row", {
    p_row_id: rowId,
  });

  if (error) return { error: error.message };

  if (rowBefore) {
    const tableId = (rowBefore as { table_id: string }).table_id;
    const scope = await resolveVirtualTableScope(supabase, tableId);
    if (scope) {
      await writeVirtualTableAuditLog(supabase, scope, {
        actorUserId: user.id,
        action: "virtual_row.delete",
        entity: "core_pm.virtual_rows",
        entityId: rowId,
        payload: { table_display_name: scope.displayName },
      });
      await notifyVirtualTableMembers(supabase, scope, user.id, {
        preferenceCategory: "row_lifecycle",
        kind: "virtual_row",
        title: `Baris dihapus dari ${scope.displayName}`,
        payload: {
          event_id: "vrow.deleted",
          virtual_row_id: rowId,
        },
      });
    }
  }

  return { error: null };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function deleteVirtualRowsBulkAction(
  formData: FormData
): Promise<ActionResult & { deleted: number }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", deleted: 0 };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", deleted: 0 };

  const tableId = String(formData.get("table_id") ?? "").trim();
  if (!tableId) return { error: "table_id kosong", deleted: 0 };

  const rawIds = String(formData.get("row_ids") ?? "").trim();
  if (!rawIds) return { error: "row_ids kosong", deleted: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawIds);
  } catch {
    return { error: "row_ids tidak valid", deleted: 0 };
  }

  if (!Array.isArray(parsed)) {
    return { error: "row_ids harus berupa array", deleted: 0 };
  }

  const rowIds = [...new Set(parsed.map((id) => String(id).trim()).filter(Boolean))];
  if (rowIds.length === 0) {
    return { error: "Tidak ada baris yang dipilih", deleted: 0 };
  }

  if (rowIds.length > MAX_VIRTUAL_TABLE_BULK_DELETE_ROWS) {
    return {
      error: `Terlalu banyak baris (${rowIds.length}). Maks. ${MAX_VIRTUAL_TABLE_BULK_DELETE_ROWS} per penghapusan.`,
      deleted: 0,
    };
  }

  for (const id of rowIds) {
    if (!UUID_RE.test(id)) {
      return { error: `ID baris tidak valid: ${id}`, deleted: 0 };
    }
  }

  const { data: deleted, error } = await supabase.schema("core_pm").rpc(
    "soft_delete_virtual_rows",
    {
      p_table_id: tableId,
      p_row_ids: rowIds,
    }
  );

  if (error) return { error: error.message, deleted: 0 };

  const count = typeof deleted === "number" ? deleted : Number(deleted) || 0;
  if (count === 0) {
    return { error: "Tidak ada baris yang dihapus (mungkin sudah dihapus)", deleted: 0 };
  }

  const scope = await resolveVirtualTableScope(supabase, tableId);
  if (scope) {
    await writeVirtualTableAuditLog(supabase, scope, {
      actorUserId: user.id,
      action: "virtual_row.delete_bulk",
      entity: "core_pm.virtual_rows",
      entityId: tableId,
      payload: {
        deleted_count: count,
        table_display_name: scope.displayName,
      },
    });
    await notifyVirtualTableMembers(supabase, scope, user.id, {
      preferenceCategory: "row_lifecycle",
      kind: "virtual_row",
      title: `${count} baris dihapus dari ${scope.displayName}`,
      body: `${count} baris dihapus (soft delete).`,
      payload: {
        event_id: "vrow.deleted_bulk",
        deleted_count: count,
      },
    });
  }

  return { error: null, deleted: count };
}

// ---------------------------------------------------------------------------
// Fetch rows for a specific virtual table (called client-side via action)
// ---------------------------------------------------------------------------

export type FetchVirtualRowsOptions = {
  limit?: number;
  offset?: number;
};

/** Baris virtual table dengan proyeksi payload untuk lapisan peta (RPC). */
export async function fetchVirtualRowsForMapAction(
  tableId: string,
  columnSlugs: string[]
): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { rows: [], error: "Supabase tidak dikonfigurasi" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], error: "Belum masuk" };

  const slugs = [...new Set(columnSlugs.filter(Boolean))].sort();
  if (slugs.length === 0) {
    return { rows: [], error: "column_slugs kosong" };
  }

  const { data, error } = await supabase.schema("core_pm").rpc(
    "fetch_virtual_rows_map_payload",
    { p_table_id: tableId, p_column_slugs: slugs }
  );

  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    table_id: tableId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    sort_order: 0,
    created_by: null,
    created_at: null,
    updated_at: null,
  }));

  return { rows, error: null };
}

export async function fetchVirtualRowsAction(
  tableId: string,
  options?: FetchVirtualRowsOptions
): Promise<{
  rows: Record<string, unknown>[];
  totalCount: number;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { rows: [], totalCount: 0, error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], totalCount: 0, error: "Belum masuk" };

  let query = supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select(
      "id, table_id, payload, sort_order, created_by, created_at, updated_at",
      { count: "exact" }
    )
    .eq("table_id", tableId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at", { ascending: true });

  if (options?.limit != null && options.limit > 0) {
    const offset = Math.max(0, options.offset ?? 0);
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data, error, count } = await query;

  if (error) return { rows: [], totalCount: 0, error: error.message };

  const rows = (data ?? []) as Record<string, unknown>[];
  const totalCount =
    typeof count === "number" ? count : rows.length;

  return { rows, totalCount, error: null };
}

// ---------------------------------------------------------------------------
// Relation helpers
// ---------------------------------------------------------------------------

/**
 * Fetch rows from a target table for the relation picker.
 * Returns { id, displayLabel } pairs using the first 2 columns as display.
 */
export async function fetchRelationTargetRowsAction(
  targetTableId: string
): Promise<{
  rows: { id: string; label: string }[];
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { rows: [], error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], error: "Belum masuk" };

  // Get first 2 columns by position to build a composite label
  const { data: cols } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, data_type")
    .eq("table_id", targetTableId)
    .order("position")
    .limit(2);

  const labelSlugs = (cols as { slug: string; data_type: string }[] | null)
    ?.map((c) => c.slug) ?? ["title"];

  const { data: rows, error } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, payload")
    .eq("table_id", targetTableId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return { rows: [], error: error.message };

  const result = (rows ?? []).map((r: Record<string, unknown>) => {
    const payload = r.payload as Record<string, unknown> | null;
    const parts = labelSlugs
      .map((slug) => payload?.[slug])
      .filter((v) => v != null && v !== "" && v !== false)
      .map(String);
    return {
      id: r.id as string,
      label: parts.length > 0 ? parts.join(" — ") : `(${(r.id as string).slice(0, 8)})`,
    };
  });

  return { rows: result, error: null };
}

/**
 * Resolve display labels for a set of row IDs across potentially multiple tables.
 * Used by VirtualTableView to show relation cell display values.
 */
export async function resolveRelationLabelsAction(
  rowIds: string[]
): Promise<{
  labels: Record<string, string>;
  error: string | null;
}> {
  if (rowIds.length === 0) return { labels: {}, error: null };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { labels: {}, error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { labels: {}, error: "Belum masuk" };

  // Fetch the rows by IDs
  const { data: rows, error } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, table_id, payload")
    .in("id", rowIds)
    .is("deleted_at", null);

  if (error) return { labels: {}, error: error.message };
  if (!rows || rows.length === 0) return { labels: {}, error: null };

  const typedRows = rows as { id: string; table_id: string; payload: Record<string, unknown> }[];

  // Get unique table IDs to find title columns
  const tableIds = [...new Set(typedRows.map((r) => r.table_id))];

  const { data: allCols } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("table_id, slug, data_type, position")
    .in("table_id", tableIds)
    .order("position");

  // Build a map: table_id -> first 2 column slugs for composite label
  const labelSlugsByTable = new Map<string, string[]>();
  for (const tableId of tableIds) {
    const tableCols = (allCols as { table_id: string; slug: string; data_type: string; position: number }[] | null)
      ?.filter((c) => c.table_id === tableId)
      ?.slice(0, 2);
    labelSlugsByTable.set(tableId, tableCols?.map((c) => c.slug) ?? ["title"]);
  }

  const labels: Record<string, string> = {};
  for (const row of typedRows) {
    const slugs = labelSlugsByTable.get(row.table_id) ?? ["title"];
    const parts = slugs
      .map((s) => row.payload[s])
      .filter((v) => v != null && v !== "" && v !== false)
      .map(String);
    labels[row.id] = parts.length > 0 ? parts.join(" — ") : `(${row.id.slice(0, 8)})`;
  }

  return { labels, error: null };
}

// ---------------------------------------------------------------------------
// Virtual Views — saved filter/sort/group/column configs
// ---------------------------------------------------------------------------

export async function createVirtualViewAction(
  formData: FormData
): Promise<{ error: string | null; viewId: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", viewId: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", viewId: null };

  const tableId = String(formData.get("table_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const configRaw = String(formData.get("config") ?? "{}").trim();

  if (!tableId) return { error: "table_id kosong", viewId: null };
  if (!name) return { error: "Nama view tidak boleh kosong", viewId: null };

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(configRaw);
  } catch {
    return { error: "Config bukan JSON valid", viewId: null };
  }

  if (config.layoutType == null) config.layoutType = "grid";
  if (config.layoutOptions == null) config.layoutOptions = {};

  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_views")
    .insert({
      table_id: tableId,
      name,
      config,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message, viewId: null };

  revalidatePath("/", "layout");
  return { error: null, viewId: (data as { id: string }).id };
}

export async function updateVirtualViewAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const viewId = String(formData.get("view_id") ?? "").trim();
  if (!viewId) return { error: "view_id kosong" };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (formData.has("name")) {
    const name = String(formData.get("name")).trim();
    if (!name) return { error: "Nama view tidak boleh kosong" };
    updates.name = name;
  }

  if (formData.has("config")) {
    try {
      updates.config = JSON.parse(String(formData.get("config") ?? "{}"));
    } catch {
      return { error: "Config bukan JSON valid" };
    }
  }

  if (formData.has("is_default")) {
    updates.is_default = formData.get("is_default") === "true";
  }

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_views")
    .update(updates)
    .eq("id", viewId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteVirtualViewAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const viewId = String(formData.get("view_id") ?? "").trim();
  if (!viewId) return { error: "view_id kosong" };

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_views")
    .delete()
    .eq("id", viewId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}

export async function fetchVirtualViewsAction(
  tableId: string
): Promise<{ views: Record<string, unknown>[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { views: [], error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { views: [], error: "Belum masuk" };

  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_views")
    .select("id, table_id, name, config, is_default, created_by, created_at, updated_at")
    .eq("table_id", tableId)
    .order("created_at", { ascending: true });

  if (error) return { views: [], error: error.message };

  return { views: (data ?? []) as Record<string, unknown>[], error: null };
}

export async function duplicateVirtualViewAction(
  formData: FormData
): Promise<{ error: string | null; viewId: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", viewId: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", viewId: null };

  const viewId = String(formData.get("view_id") ?? "").trim();
  if (!viewId) return { error: "view_id kosong", viewId: null };

  const { data: existing, error: fetchErr } = await supabase
    .schema("core_pm")
    .from("virtual_views")
    .select("table_id, name, config")
    .eq("id", viewId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message, viewId: null };
  if (!existing) return { error: "View tidak ditemukan", viewId: null };

  const row = existing as {
    table_id: string;
    name: string;
    config: Record<string, unknown>;
  };

  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_views")
    .insert({
      table_id: row.table_id,
      name: `${row.name} (salinan)`,
      config: row.config,
      is_default: false,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message, viewId: null };

  revalidatePath("/", "layout");
  return { error: null, viewId: (data as { id: string }).id };
}

export async function setDefaultVirtualViewAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const viewId = String(formData.get("view_id") ?? "").trim();
  const tableId = String(formData.get("table_id") ?? "").trim();
  if (!viewId || !tableId) return { error: "view_id / table_id kosong" };

  const { error: clearErr } = await supabase
    .schema("core_pm")
    .from("virtual_views")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("table_id", tableId);

  if (clearErr) return { error: clearErr.message };

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_views")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", viewId)
    .eq("table_id", tableId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}

// ---------------------------------------------------------------------------
// Fetch organization members for user-type column picker
// ---------------------------------------------------------------------------

export async function fetchOrgMembersAction(
  orgId: string
): Promise<{ members: { id: string; label: string }[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { members: [], error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { members: [], error: "Belum masuk" };

  // Get all user_ids from projects in this org
  const { data: projects } = await supabase
    .schema("core_pm")
    .from("projects")
    .select("id")
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (!projects || projects.length === 0) return { members: [], error: null };

  const projectIds = (projects as { id: string }[]).map((p) => p.id);

  const { data: members } = await supabase
    .schema("core_pm")
    .from("project_members")
    .select("user_id")
    .in("project_id", projectIds);

  if (!members || members.length === 0) return { members: [], error: null };

  const uniqueUserIds = [...new Set((members as { user_id: string }[]).map((m) => m.user_id))];

  const { data: profiles } = await supabase
    .schema("core_pm")
    .from("profiles")
    .select("id, display_name")
    .in("id", uniqueUserIds);

  const result = uniqueUserIds.map((uid) => {
    const profile = (profiles as { id: string; display_name: string | null }[] ?? [])
      .find((p) => p.id === uid);
    return {
      id: uid,
      label: profile?.display_name?.trim() || uid.slice(0, 8),
    };
  });

  result.sort((a, b) => a.label.localeCompare(b.label));

  return { members: result, error: null };
}

// ---------------------------------------------------------------------------
// G-H1 — Relation explorer (inbound + row fetch for navigation)
// ---------------------------------------------------------------------------

const INBOUND_RELATION_ROW_LIMIT = 50;

function labelFromPayloadSlugs(
  payload: Record<string, unknown>,
  labelSlugs: string[]
): string {
  const parts = labelSlugs
    .map((slug) => payload[slug])
    .filter((v) => v != null && v !== "" && v !== false)
    .map(String);
  return parts.length > 0 ? parts.join(" — ") : "";
}

async function labelSlugsForTable(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  tableId: string
): Promise<string[]> {
  const { data: cols } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, data_type, position")
    .eq("table_id", tableId)
    .order("position")
    .limit(2);

  return (
    (cols as { slug: string; data_type: string }[] | null)?.map((c) => c.slug) ?? [
      "title",
    ]
  );
}

export type RelationExplorerGroupResult = {
  tableId: string;
  tableName: string;
  columnSlug: string;
  columnDisplayName: string;
  direction: "outbound" | "inbound";
  links: { rowId: string; label: string }[];
};

export async function fetchInboundRelationsForRowAction(
  tableId: string,
  rowId: string
): Promise<{
  groups: RelationExplorerGroupResult[];
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { groups: [], error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { groups: [], error: "Belum masuk" };

  if (!tableId.trim() || !rowId.trim()) {
    return { groups: [], error: "table_id / row_id kosong" };
  }

  const { data: sourceTable, error: tblErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("id, project_id, organization_id, display_name")
    .eq("id", tableId)
    .is("deleted_at", null)
    .maybeSingle();

  if (tblErr) return { groups: [], error: tblErr.message };
  if (!sourceTable) return { groups: [], error: "Tabel tidak ditemukan" };

  const { data: inboundColsRaw, error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("id, table_id, slug, display_name, config")
    .eq("data_type", "relation");

  if (colErr) return { groups: [], error: colErr.message };

  const inboundCols = (inboundColsRaw ?? []).filter((col) => {
    const c = col as {
      config: Record<string, unknown> | null;
    };
    return c.config?.target_table_id === tableId;
  }) as {
    table_id: string;
    slug: string;
    display_name: string;
  }[];

  if (inboundCols.length === 0) return { groups: [], error: null };

  const sourceTableIds = [...new Set(inboundCols.map((c) => c.table_id))];

  const { data: sourceTables, error: srcTblErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("id, project_id, organization_id, display_name")
    .in("id", sourceTableIds)
    .is("deleted_at", null);

  if (srcTblErr) return { groups: [], error: srcTblErr.message };

  const typedSourceTable = sourceTable as {
    project_id: string | null;
    organization_id: string | null;
  };

  const scopedSourceTables = (sourceTables ?? []).filter((t) => {
    const row = t as {
      id: string;
      project_id: string | null;
      organization_id: string | null;
    };
    if (typedSourceTable.project_id) {
      return row.project_id === typedSourceTable.project_id;
    }
    return row.organization_id === typedSourceTable.organization_id;
  }) as { id: string; display_name: string }[];

  const scopedSourceTableIds = new Set(scopedSourceTables.map((t) => t.id));
  const tableNameById = new Map(
    scopedSourceTables.map((t) => [t.id, t.display_name])
  );

  const groups: RelationExplorerGroupResult[] = [];

  for (const col of inboundCols) {
    if (!scopedSourceTableIds.has(col.table_id)) continue;

    const labelSlugs = await labelSlugsForTable(supabase, col.table_id);

    const { data: rows, error: rowErr } = await supabase
      .schema("core_pm")
      .from("virtual_rows")
      .select("id, payload")
      .eq("table_id", col.table_id)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at", { ascending: true })
      .limit(500);

    if (rowErr) return { groups: [], error: rowErr.message };

    const links: { rowId: string; label: string }[] = [];
    for (const r of rows ?? []) {
      const typed = r as { id: string; payload: Record<string, unknown> | null };
      const payload = typed.payload ?? {};
      const ids = relationIdsFromPayload(payload, col.slug);
      if (!ids.includes(rowId)) continue;
      links.push({
        rowId: typed.id,
        label:
          labelFromPayloadSlugs(payload, labelSlugs) ||
          typed.id.slice(0, 8),
      });
      if (links.length >= INBOUND_RELATION_ROW_LIMIT) break;
    }

    if (links.length === 0) continue;

    groups.push({
      tableId: col.table_id,
      tableName: tableNameById.get(col.table_id) ?? col.table_id.slice(0, 8),
      columnSlug: col.slug,
      columnDisplayName: col.display_name,
      direction: "inbound",
      links,
    });
  }

  return { groups, error: null };
}

export async function fetchVirtualRowByIdAction(rowId: string): Promise<{
  row: {
    id: string;
    table_id: string;
    payload: Record<string, unknown>;
  } | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { row: null, error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { row: null, error: "Belum masuk" };

  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, table_id, payload")
    .eq("id", rowId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  if (!data) return { row: null, error: null };

  const typed = data as {
    id: string;
    table_id: string;
    payload: Record<string, unknown> | null;
  };

  return {
    row: {
      id: typed.id,
      table_id: typed.table_id,
      payload: typed.payload ?? {},
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// G-H3 — Panel 360° (anchor + relasi 1 hop)
// ---------------------------------------------------------------------------

const ENTITY_360_RELATED_ROW_LIMIT = 50;

async function fetchVirtualRowsByIds(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  ids: string[]
): Promise<
  { id: string; table_id: string; payload: Record<string, unknown> }[]
> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, table_id, payload")
    .in("id", unique)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      table_id: string;
      payload: Record<string, unknown> | null;
    };
    return {
      id: row.id,
      table_id: row.table_id,
      payload: row.payload ?? {},
    };
  });
}

function rowsToSectionEntries(
  rows: { id: string; payload: Record<string, unknown> }[],
  labelSlugs: string[]
): Entity360SectionRow[] {
  return rows.map((row) => ({
    id: row.id,
    label: labelFromPayloadSlugs(row.payload, labelSlugs) || row.id.slice(0, 8),
    payload: row.payload,
  }));
}

function collectRelationIds(
  payloads: Record<string, unknown>[],
  columns: { slug: string; data_type: string }[]
): string[] {
  const ids = new Set<string>();
  for (const payload of payloads) {
    for (const col of columns) {
      if (col.data_type !== "relation") continue;
      for (const id of relationIdsFromPayload(payload, col.slug)) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

export async function fetchEntity360PanelAction(
  tableId: string,
  rowId: string,
  anchorPayload?: Record<string, unknown> | null
): Promise<{
  sections: Entity360Section[];
  relationLabels: Record<string, string>;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { sections: [], relationLabels: {}, error: "Supabase tidak dikonfigurasi" };
  }
  const db = supabase;

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return { sections: [], relationLabels: {}, error: "Belum masuk" };
  }

  if (!tableId.trim() || !rowId.trim()) {
    return { sections: [], relationLabels: {}, error: "table_id / row_id kosong" };
  }

  try {
    const { data: anchorTable, error: tblErr } = await supabase
      .schema("core_pm")
      .from("virtual_tables")
      .select("id, project_id, organization_id, display_name")
      .eq("id", tableId)
      .is("deleted_at", null)
      .maybeSingle();

    if (tblErr) return { sections: [], relationLabels: {}, error: tblErr.message };
    if (!anchorTable) {
      return { sections: [], relationLabels: {}, error: "Tabel tidak ditemukan" };
    }

    const projectId = (anchorTable as { project_id: string }).project_id;
    let entity360Profile = parseProjectEntity360Profile(null);
    if (projectId) {
      const { data: projectRow } = await supabase
        .schema("core_pm")
        .from("projects")
        .select("entity_360_profile")
        .eq("id", projectId)
        .is("deleted_at", null)
        .maybeSingle();
      entity360Profile = parseProjectEntity360Profile(
        (projectRow as { entity_360_profile?: unknown } | null)
          ?.entity_360_profile
      );
    }

    let anchorRowPayload = anchorPayload ?? null;
    if (!anchorRowPayload) {
      const fetched = await fetchVirtualRowByIdAction(rowId);
      if (fetched.error) {
        return { sections: [], relationLabels: {}, error: fetched.error };
      }
      if (!fetched.row) {
        return { sections: [], relationLabels: {}, error: "Baris tidak ditemukan" };
      }
      anchorRowPayload = fetched.row.payload;
    }

    const { data: anchorColsRaw, error: anchorColErr } = await supabase
      .schema("core_pm")
      .from("virtual_columns")
      .select("slug, display_name, data_type, position, config")
      .eq("table_id", tableId)
      .order("position");

    if (anchorColErr) {
      return { sections: [], relationLabels: {}, error: anchorColErr.message };
    }

    const anchorCols = (anchorColsRaw ?? []) as {
      slug: string;
      display_name: string;
      data_type: string;
      config: Record<string, unknown> | null;
    }[];

    const anchorLabelSlugs = await labelSlugsForTable(supabase, tableId);
    const sections: Entity360Section[] = [
      {
        tableId,
        tableName: (anchorTable as { display_name: string }).display_name,
        direction: "anchor",
        rows: rowsToSectionEntries(
          [{ id: rowId, payload: anchorRowPayload }],
          anchorLabelSlugs
        ),
      },
    ];

    const tableNameCache = new Map<string, string>([
      [tableId, (anchorTable as { display_name: string }).display_name],
    ]);

    async function tableNameFor(id: string): Promise<string> {
      const cached = tableNameCache.get(id);
      if (cached) return cached;
      const { data } = await db
        .schema("core_pm")
        .from("virtual_tables")
        .select("display_name")
        .eq("id", id)
        .maybeSingle();
      const name =
        (data as { display_name?: string } | null)?.display_name ??
        id.slice(0, 8);
      tableNameCache.set(id, name);
      return name;
    }

    for (const col of anchorCols.filter((c) => c.data_type === "relation")) {
      const targetTableId = col.config?.target_table_id as string | undefined;
      if (!targetTableId) continue;

      const targetIds = relationIdsFromPayload(anchorRowPayload!, col.slug);
      if (targetIds.length === 0) continue;

      const targetRows = await fetchVirtualRowsByIds(
        supabase,
        targetIds.slice(0, ENTITY_360_RELATED_ROW_LIMIT)
      );
      if (targetRows.length === 0) continue;

      const labelSlugs = await labelSlugsForTable(supabase, targetTableId);
      sections.push({
        tableId: targetTableId,
        tableName: await tableNameFor(targetTableId),
        direction: "outbound",
        relationColumnSlug: col.slug,
        relationColumnDisplayName: col.display_name,
        rows: rowsToSectionEntries(targetRows, labelSlugs),
      });
    }

    const inboundResult = await fetchInboundRelationsForRowAction(tableId, rowId);
    if (inboundResult.error) {
      return { sections: [], relationLabels: {}, error: inboundResult.error };
    }

    for (const group of inboundResult.groups) {
      const ids = group.links.map((l) => l.rowId);
      const inboundRows = await fetchVirtualRowsByIds(supabase, ids);
      if (inboundRows.length === 0) continue;

      const labelSlugs = await labelSlugsForTable(supabase, group.tableId);
      sections.push({
        tableId: group.tableId,
        tableName: group.tableName,
        direction: "inbound",
        relationColumnSlug: group.columnSlug,
        relationColumnDisplayName: group.columnDisplayName,
        rows: rowsToSectionEntries(inboundRows, labelSlugs),
      });
    }

    const tableIds = [...new Set(sections.map((s) => s.tableId))];
    const { data: allColsRaw } = await supabase
      .schema("core_pm")
      .from("virtual_columns")
      .select("table_id, slug, data_type")
      .in("table_id", tableIds);

    const colsByTable = new Map<string, { slug: string; data_type: string }[]>();
    for (const col of allColsRaw ?? []) {
      const c = col as { table_id: string; slug: string; data_type: string };
      const list = colsByTable.get(c.table_id) ?? [];
      list.push(c);
      colsByTable.set(c.table_id, list);
    }

    const relationIds = new Set<string>();
    for (const section of sections) {
      const cols = colsByTable.get(section.tableId) ?? [];
      for (const id of collectRelationIds(
        section.rows.map((r) => r.payload),
        cols
      )) {
        relationIds.add(id);
      }
    }

    let relationLabels: Record<string, string> = {};
    if (relationIds.size > 0) {
      const resolved = await resolveRelationLabelsAction([...relationIds]);
      if (resolved.error) {
        return { sections: [], relationLabels: {}, error: resolved.error };
      }
      relationLabels = resolved.labels;
    }

    const orderedSections = applyEntity360PanelProfile(
      sections,
      entity360Profile
    );

    return { sections: orderedSections, relationLabels, error: null };
  } catch (e) {
    return {
      sections: [],
      relationLabels: {},
      error: e instanceof Error ? e.message : "Gagal memuat panel 360°",
    };
  }
}

// ---------------------------------------------------------------------------
// G-D5 — Trace relasi (garis centroid di peta, 1 hop)
// ---------------------------------------------------------------------------

const RELATION_TRACE_ROW_LIMIT = 50;

export async function fetchRelationTraceTargetsAction(
  tableId: string,
  rowId: string,
  anchorPayload?: Record<string, unknown> | null
): Promise<{
  anchorEndpoints: RelationTraceEndpoint[];
  targets: RelationTraceTarget[];
  error: string | null;
}> {
  const empty = {
    anchorEndpoints: [] as RelationTraceEndpoint[],
    targets: [] as RelationTraceTarget[],
    error: null as string | null,
  };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ...empty, error: "Supabase tidak dikonfigurasi" };
  const db = supabase;

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ...empty, error: "Belum masuk" };

  if (!tableId.trim() || !rowId.trim()) {
    return { ...empty, error: "table_id / row_id kosong" };
  }

  try {
    const { data: anchorTable, error: tblErr } = await db
      .schema("core_pm")
      .from("virtual_tables")
      .select("id, project_id, organization_id, display_name")
      .eq("id", tableId)
      .is("deleted_at", null)
      .maybeSingle();

    if (tblErr) return { ...empty, error: tblErr.message };
    if (!anchorTable) return { ...empty, error: "Tabel tidak ditemukan" };

    const projectId = (anchorTable as { project_id: string | null }).project_id;
    const orgId = (anchorTable as { organization_id: string | null })
      .organization_id;

    let entity360Profile = parseProjectEntity360Profile(null);
    if (projectId) {
      const { data: projectRow } = await db
        .schema("core_pm")
        .from("projects")
        .select("entity_360_profile")
        .eq("id", projectId)
        .is("deleted_at", null)
        .maybeSingle();
      entity360Profile = parseProjectEntity360Profile(
        (projectRow as { entity_360_profile?: unknown } | null)
          ?.entity_360_profile
      );
    }

    let anchorRowPayload = anchorPayload ?? null;
    if (!anchorRowPayload) {
      const fetched = await fetchVirtualRowByIdAction(rowId);
      if (fetched.error) return { ...empty, error: fetched.error };
      if (!fetched.row) return { ...empty, error: "Baris tidak ditemukan" };
      anchorRowPayload = fetched.row.payload;
    }

    if (!projectId && !orgId) return empty;

    const scopeFilter = projectId
      ? { col: "project_id" as const, val: projectId }
      : { col: "organization_id" as const, val: orgId };

    const { data: projectTablesRaw, error: ptErr } = await db
      .schema("core_pm")
      .from("virtual_tables")
      .select("id")
      .eq(scopeFilter.col, scopeFilter.val)
      .is("deleted_at", null);

    if (ptErr) return { ...empty, error: ptErr.message };

    const projectTableIds = (projectTablesRaw ?? []).map(
      (t) => (t as { id: string }).id
    );
    if (projectTableIds.length === 0) return empty;

    const { data: allColsRaw, error: allColErr } = await db
      .schema("core_pm")
      .from("virtual_columns")
      .select("table_id, slug, display_name, data_type, position, config")
      .in("table_id", projectTableIds)
      .order("position");

    if (allColErr) return { ...empty, error: allColErr.message };

    const columnsByTableId = buildVirtualColumnsByTableId(
      (allColsRaw ?? []).map((c) => {
        const col = c as {
          table_id: string;
          slug: string;
          display_name: string;
          data_type: string;
          position: number;
          config: Record<string, unknown> | null;
        };
        return {
          id: `${col.table_id}:${col.slug}`,
          table_id: col.table_id,
          slug: col.slug,
          display_name: col.display_name,
          data_type: col.data_type as import("./virtual-table-types").VirtualColumnDataType,
          position: col.position,
          is_required: false,
          config: col.config ?? {},
        };
      })
    );

    const anchorCols = columnsByTableId.get(tableId) ?? [];

    async function endpointsForRow(
      sourceTableId: string,
      sourceRowId: string,
      payload: Record<string, unknown>,
      viaLabel?: string
    ): Promise<RelationTraceTarget[]> {
      const cols = columnsByTableId.get(sourceTableId) ?? [];
      const geoCol = cols.find((c) => c.data_type === "geometry");
      const labelSlugs = await labelSlugsForTable(db, sourceTableId);
      const rowLabel =
        labelFromPayloadSlugs(payload, labelSlugs) || sourceRowId.slice(0, 8);

      if (geoCol) {
        const geo = payload[geoCol.slug];
        if (geo != null && geo !== "") {
          return [
            {
              tableId: sourceTableId,
              rowId: sourceRowId,
              label: rowLabel,
              viaLabel,
            },
          ];
        }
        return [];
      }

      const path = pickFindOnMapRelationPath(cols, columnsByTableId, {
        sourceTableId,
        geometryHolder: entity360Profile.geometry_holder,
      });
      if (!path) return [];

      const geomRowIds = relationIdsFromPayload(
        payload,
        path.relationColumnSlug
      );
      if (geomRowIds.length === 0) return [];

      const geomRows = await fetchVirtualRowsByIds(
        db,
        geomRowIds.slice(0, RELATION_TRACE_ROW_LIMIT)
      );
      const geomLabelSlugs = await labelSlugsForTable(
        db,
        path.targetTableId
      );

      return geomRows.map((gr) => ({
        tableId: path.targetTableId,
        rowId: gr.id,
        label:
          labelFromPayloadSlugs(gr.payload, geomLabelSlugs) ||
          gr.id.slice(0, 8),
        viaLabel: viaLabel ?? path.relationColumnLabel,
      }));
    }

    const anchorExpanded = await endpointsForRow(
      tableId,
      rowId,
      anchorRowPayload
    );
    const anchorEndpoints: RelationTraceEndpoint[] = anchorExpanded.map(
      ({ tableId: tId, rowId: rId, label }) => ({
        tableId: tId,
        rowId: rId,
        label,
      })
    );

    const anchorKeys = new Set(
      anchorEndpoints.map((ep) => `${ep.tableId}:${ep.rowId}`)
    );
    anchorKeys.add(`${tableId}:${rowId}`);

    const targets: RelationTraceTarget[] = [];
    const seenTarget = new Set<string>();

    function addTargets(rows: RelationTraceTarget[]) {
      for (const row of rows) {
        const key = `${row.tableId}:${row.rowId}`;
        if (anchorKeys.has(key) || seenTarget.has(key)) continue;
        seenTarget.add(key);
        targets.push(row);
        if (targets.length >= RELATION_TRACE_ROW_LIMIT) return;
      }
    }

    for (const col of anchorCols.filter((c) => c.data_type === "relation")) {
      const targetTableId = col.config?.target_table_id as string | undefined;
      if (!targetTableId) continue;

      const targetIds = relationIdsFromPayload(anchorRowPayload!, col.slug);
      if (targetIds.length === 0) continue;

      const targetRows = await fetchVirtualRowsByIds(
        db,
        targetIds.slice(0, RELATION_TRACE_ROW_LIMIT)
      );
      for (const tr of targetRows) {
        const eps = await endpointsForRow(
          tr.table_id,
          tr.id,
          tr.payload,
          col.display_name
        );
        addTargets(eps);
        if (targets.length >= RELATION_TRACE_ROW_LIMIT) break;
      }
      if (targets.length >= RELATION_TRACE_ROW_LIMIT) break;
    }

    if (targets.length < RELATION_TRACE_ROW_LIMIT) {
      const inboundResult = await fetchInboundRelationsForRowAction(
        tableId,
        rowId
      );
      if (inboundResult.error) {
        return { ...empty, error: inboundResult.error };
      }

      for (const group of inboundResult.groups) {
        const ids = group.links.map((l) => l.rowId);
        const inboundRows = await fetchVirtualRowsByIds(db, ids);
        for (const ir of inboundRows) {
          const eps = await endpointsForRow(
            ir.table_id,
            ir.id,
            ir.payload,
            group.columnDisplayName
          );
          addTargets(eps);
          if (targets.length >= RELATION_TRACE_ROW_LIMIT) break;
        }
        if (targets.length >= RELATION_TRACE_ROW_LIMIT) break;
      }
    }

    return { anchorEndpoints, targets, error: null };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : "Gagal memuat trace relasi",
    };
  }
}
