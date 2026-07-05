import {
  extractMatchKeyFromProperties,
  normalizeVirtualTableMatchKey,
  pickDefaultVirtualTableMatchColumn,
  type VirtualTableMatchColumnPick,
} from "@/lib/virtual-table-geojson-import";
import { normalizeRelationLookupKey } from "@/lib/virtual-table-relation-import";
import type { SupabaseClient } from "@supabase/supabase-js";

export type InboundGeomRelationSpec = {
  hubTableId: string;
  hubTableName: string;
  relationColumnSlug: string;
  relationColumnDisplayName: string;
  /** Kolom di tabel hub yang dicocokkan ke property GeoJSON/DXF. */
  hubMatchSlug: string;
};

type VirtualColumnRow = {
  table_id: string;
  slug: string;
  display_name: string;
  data_type: string;
  position: number;
  config?: Record<string, unknown> | null;
};

/** Kolom relasi di tabel lain yang menunjuk ke `geomTableId` (pola B). */
export function buildInboundGeomRelationSpecs(args: {
  geomTableId: string;
  projectTableIds: Set<string>;
  tableNameById: Map<string, string>;
  columns: VirtualColumnRow[];
}): InboundGeomRelationSpec[] {
  const { geomTableId, projectTableIds, tableNameById, columns } = args;
  const specs: InboundGeomRelationSpec[] = [];
  const seen = new Set<string>();

  const byTable = new Map<string, VirtualColumnRow[]>();
  for (const col of columns) {
    if (!projectTableIds.has(col.table_id)) continue;
    const list = byTable.get(col.table_id) ?? [];
    list.push(col);
    byTable.set(col.table_id, list);
  }

  for (const [hubTableId, hubCols] of byTable) {
    if (hubTableId === geomTableId) continue;
    const sorted = [...hubCols].sort((a, b) => a.position - b.position);
    const matchPick = pickDefaultVirtualTableMatchColumn(
      sorted
        .filter((c) => ["text", "number", "url"].includes(c.data_type))
        .map(
          (c): VirtualTableMatchColumnPick => ({
            slug: c.slug,
            display_name: c.display_name,
            data_type: c.data_type,
          })
        )
    );
    if (!matchPick) continue;

    for (const col of sorted) {
      if (col.data_type !== "relation") continue;
      if (col.config?.is_multi === true) continue;
      const targetId = col.config?.target_table_id as string | undefined;
      if (targetId !== geomTableId) continue;

      const key = `${hubTableId}:${col.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);

      specs.push({
        hubTableId,
        hubTableName: tableNameById.get(hubTableId) ?? hubTableId.slice(0, 8),
        relationColumnSlug: col.slug,
        relationColumnDisplayName: col.display_name,
        hubMatchSlug: matchPick.slug,
      });
    }
  }

  return specs;
}

export type GeomImportLinkFeature = {
  geomRowId: string;
  props: Record<string, unknown>;
  featureIndex: number;
};

/** Setelah impor ke tabel geom: isi kolom relasi di tabel hub (G-H5). */
export async function applyInboundGeomRelationLinks(
  supabase: SupabaseClient,
  specs: InboundGeomRelationSpec[],
  features: GeomImportLinkFeature[]
): Promise<{ linked: number; failed: number; samples: string[] }> {
  if (specs.length === 0 || features.length === 0) {
    return { linked: 0, failed: 0, samples: [] };
  }

  let linked = 0;
  let failed = 0;
  const samples: string[] = [];

  const pushSample = (msg: string) => {
    failed++;
    if (samples.length < 10) samples.push(msg);
  };

  for (const spec of specs) {
    const { data: hubRowsRaw, error: hubErr } = await supabase
      .schema("core_pm")
      .from("virtual_rows")
      .select("id, payload")
      .eq("table_id", spec.hubTableId)
      .is("deleted_at", null);

    if (hubErr) {
      pushSample(`${spec.hubTableName}: ${hubErr.message}`);
      continue;
    }

    const hubByKey = new Map<string, { id: string; payload: Record<string, unknown> }>();
    const ambiguous = new Set<string>();

    for (const row of hubRowsRaw ?? []) {
      const r = row as { id: string; payload: Record<string, unknown> | null };
      const payload = r.payload ?? {};
      const key = normalizeRelationLookupKey(payload[spec.hubMatchSlug]);
      if (!key) continue;
      if (hubByKey.has(key)) {
        ambiguous.add(key);
        hubByKey.delete(key);
      } else if (!ambiguous.has(key)) {
        hubByKey.set(key, { id: r.id, payload });
      }
    }

    for (const feature of features) {
      const raw = extractMatchKeyFromProperties(
        feature.props,
        spec.hubMatchSlug,
        feature.featureIndex
      );
      const norm = raw ? normalizeVirtualTableMatchKey(raw) : null;
      if (!norm) continue;

      if (ambiguous.has(norm)) {
        pushSample(
          `Poligon #${feature.featureIndex + 1}: "${raw}" cocok banyak baris di ${spec.hubTableName}`
        );
        continue;
      }

      const hub = hubByKey.get(norm);
      if (!hub) {
        pushSample(
          `Poligon #${feature.featureIndex + 1}: tidak ada baris ${spec.hubTableName} dengan ${spec.hubMatchSlug}="${raw}"`
        );
        continue;
      }

      const merged = {
        ...hub.payload,
        [spec.relationColumnSlug]: feature.geomRowId,
      };

      const { error: updErr } = await supabase
        .schema("core_pm")
        .from("virtual_rows")
        .update({
          payload: merged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", hub.id);

      if (updErr) {
        pushSample(
          `Poligon #${feature.featureIndex + 1}: gagal hubungkan ${spec.hubTableName} — ${updErr.message}`
        );
        continue;
      }

      hubByKey.set(norm, { id: hub.id, payload: merged });
      linked++;
    }
  }

  return { linked, failed, samples };
}
