"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UpsertIssueGeometryFeatureResult = { error: string | null };
export type UpsertIssueGeometryFeatureBatchResult = {
  error: string | null;
  insertedOrUpdated: number;
  failed: number;
  failureSamples: string[];
};

export type DeleteIssueGeometryFeatureResult = { error: string | null };
export type DeleteAllIssueGeometryFeaturesResult = {
  error: string | null;
  deleted: number;
};

export type UpdateIssueGeometryFeaturePropertiesResult = {
  error: string | null;
};

type Position = [number, number];
type LinearRing = Position[];
type PolygonCoords = LinearRing[];
type MultiPolygonCoords = PolygonCoords[];

function closeRingIfNeeded(ring: LinearRing): LinearRing {
  if (ring.length === 0) return ring;
  const [ax, ay] = ring[0];
  const [bx, by] = ring[ring.length - 1];
  if (ax === bx && ay === by) return ring;
  return [...ring, ring[0]];
}

function parseRing(raw: unknown): LinearRing | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const out: LinearRing = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([x, y]);
  }
  return closeRingIfNeeded(out);
}

function parsePolygon(raw: unknown): PolygonCoords | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: PolygonCoords = [];
  for (const ring of raw) {
    const parsed = parseRing(ring);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

function extractMultiPolygonFromGeoJSON(input: unknown): MultiPolygonCoords | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as { type?: string; geometry?: unknown; coordinates?: unknown; features?: unknown[] };

  if (obj.type === "Feature") {
    return extractMultiPolygonFromGeoJSON(obj.geometry);
  }
  if (obj.type === "FeatureCollection") {
    if (!Array.isArray(obj.features) || obj.features.length === 0) return null;
    const all: MultiPolygonCoords = [];
    for (const f of obj.features) {
      const mp = extractMultiPolygonFromGeoJSON(f);
      if (!mp) continue;
      all.push(...mp);
    }
    return all.length > 0 ? all : null;
  }
  if (obj.type === "Polygon") {
    const poly = parsePolygon(obj.coordinates);
    return poly ? [poly] : null;
  }
  if (obj.type === "MultiPolygon") {
    if (!Array.isArray(obj.coordinates) || obj.coordinates.length === 0) return null;
    const out: MultiPolygonCoords = [];
    for (const poly of obj.coordinates) {
      const parsed = parsePolygon(poly);
      if (!parsed) return null;
      out.push(parsed);
    }
    return out;
  }
  return null;
}

function multiPolygonToEWKT(coords: MultiPolygonCoords): string {
  const polyText = coords
    .map((poly) => {
      const rings = poly
        .map((ring) => `(${ring.map(([x, y]) => `${x} ${y}`).join(", ")})`)
        .join(", ");
      return `(${rings})`;
    })
    .join(", ");
  return `SRID=4326;MULTIPOLYGON(${polyText})`;
}

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

async function ensureIssueInProject(
  supabase: ServerSupabase,
  projectId: string,
  issueId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: issue, error: issueErr } = await supabase
    .schema("core_pm")
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (issueErr) return { ok: false, error: issueErr.message };
  if (!issue?.id) return { ok: false, error: "Unit kerja tidak ditemukan pada project ini" };
  return { ok: true };
}

export async function upsertIssueGeometryFeatureAction(
  formData: FormData
): Promise<UpsertIssueGeometryFeatureResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { error: "Supabase tidak dikonfigurasi" };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Belum masuk" };
  }

  const projectId = String(formData.get("project_id") ?? "").trim();
  const issueId = String(formData.get("issue_id") ?? "").trim();
  const featureKey = String(formData.get("feature_key") ?? "").trim();
  const labelRaw = String(formData.get("label") ?? "").trim();
  const propertiesRaw = String(formData.get("properties_json") ?? "").trim();
  const geojsonRaw = String(formData.get("geojson_json") ?? "").trim();

  if (!projectId || !issueId || !featureKey || !geojsonRaw) {
    return { error: "project/unit kerja, feature_key, dan geojson wajib diisi" };
  }

  let properties: Record<string, unknown> = {};
  if (propertiesRaw) {
    try {
      const parsed = JSON.parse(propertiesRaw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: "properties_json harus object JSON (contoh: {})" };
      }
      properties = parsed as Record<string, unknown>;
    } catch {
      return { error: "properties_json tidak valid" };
    }
  }

  let parsedGeo: unknown;
  try {
    parsedGeo = JSON.parse(geojsonRaw);
  } catch {
    return { error: "geojson_json tidak valid" };
  }
  const multiPoly = extractMultiPolygonFromGeoJSON(parsedGeo);
  if (!multiPoly) {
    return {
      error:
        "GeoJSON harus Polygon/MultiPolygon (atau Feature/FeatureCollection yang memuat keduanya)",
    };
  }
  const ewkt = multiPolygonToEWKT(multiPoly);

  const issueCheck = await ensureIssueInProject(supabase, projectId, issueId);
  if (!issueCheck.ok) return { error: issueCheck.error };

  const { error: upsertErr } = await supabase
    .schema("spatial")
    .from("issue_geometry_features")
    .upsert(
      {
        issue_id: issueId,
        feature_key: featureKey,
        label: labelRaw || null,
        properties,
        geom: ewkt,
      },
      { onConflict: "issue_id,feature_key" }
    );
  if (upsertErr) {
    return { error: upsertErr.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function upsertIssueGeometryFeatureBatchAction(
  formData: FormData
): Promise<UpsertIssueGeometryFeatureBatchResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      error: "Supabase tidak dikonfigurasi",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Belum masuk",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  const projectId = String(formData.get("project_id") ?? "").trim();
  const issueId = String(formData.get("issue_id") ?? "").trim();
  const batchRaw = String(formData.get("batch_geojson_json") ?? "").trim();
  const keyPrefix = String(formData.get("feature_key_prefix") ?? "").trim();
  if (!projectId || !issueId || !batchRaw) {
    return {
      error: "project/unit kerja dan batch_geojson_json wajib diisi",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  const issueCheck = await ensureIssueInProject(supabase, projectId, issueId);
  if (!issueCheck.ok) {
    return {
      error: issueCheck.error,
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(batchRaw);
  } catch {
    return {
      error: "batch_geojson_json tidak valid",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      error: "batch_geojson_json harus object JSON",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  const obj = parsed as { type?: string; features?: unknown[] };
  if (obj.type !== "FeatureCollection" || !Array.isArray(obj.features)) {
    return {
      error: "Batch harus GeoJSON FeatureCollection dengan array features",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  let insertedOrUpdated = 0;
  let failed = 0;
  const failureSamples: string[] = [];
  for (let i = 0; i < obj.features.length; i++) {
    const feat = obj.features[i];
    const f = feat as { properties?: unknown; geometry?: unknown; type?: string };
    if (!f || typeof f !== "object" || f.type !== "Feature") {
      failed++;
      if (failureSamples.length < 10) {
        failureSamples.push(`#${i + 1}: bukan Feature valid`);
      }
      continue;
    }
    const propsRaw = f.properties;
    const props =
      propsRaw && typeof propsRaw === "object" && !Array.isArray(propsRaw)
        ? ({ ...propsRaw } as Record<string, unknown>)
        : {};
    const mp = extractMultiPolygonFromGeoJSON({
      type: "Feature",
      properties: props,
      geometry: f.geometry,
    });
    if (!mp) {
      failed++;
      if (failureSamples.length < 10) {
        failureSamples.push(`#${i + 1}: geometry bukan Polygon/MultiPolygon valid`);
      }
      continue;
    }

    const keyCandidate = props.feature_key ?? props.id ?? props.ID ?? props.Id;
    const keyRaw = keyCandidate == null ? "" : String(keyCandidate).trim();
    const fallbackKey = String(i + 1);
    const featureKey = `${keyPrefix}${keyRaw || fallbackKey}`;
    if (!featureKey.trim()) {
      failed++;
      if (failureSamples.length < 10) {
        failureSamples.push(`#${i + 1}: feature_key kosong`);
      }
      continue;
    }

    const labelCandidate = props.label ?? props.Label ?? props.Nama ?? props.nama;
    const label = labelCandidate == null ? null : String(labelCandidate).trim() || null;
    if ("feature_key" in props) delete props.feature_key;

    const { error: upsertErr } = await supabase
      .schema("spatial")
      .from("issue_geometry_features")
      .upsert(
        {
          issue_id: issueId,
          feature_key: featureKey,
          label,
          properties: props,
          geom: multiPolygonToEWKT(mp),
        },
        { onConflict: "issue_id,feature_key" }
      );
    if (upsertErr) {
      failed++;
      if (failureSamples.length < 10) {
        failureSamples.push(`#${i + 1}/${featureKey}: ${upsertErr.message}`);
      }
      continue;
    }
    insertedOrUpdated++;
  }

  revalidatePath("/", "layout");
  return {
    error: null,
    insertedOrUpdated,
    failed,
    failureSamples,
  };
}

export async function updateIssueGeometryFeaturePropertiesAction(
  formData: FormData
): Promise<UpdateIssueGeometryFeaturePropertiesResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { error: "Supabase tidak dikonfigurasi" };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Belum masuk" };
  }

  const projectId = String(formData.get("project_id") ?? "").trim();
  const issueId = String(formData.get("issue_id") ?? "").trim();
  const featureId = String(formData.get("feature_id") ?? "").trim();
  const propertiesRaw = String(formData.get("properties_json") ?? "").trim();

  if (!projectId || !issueId || !featureId) {
    return { error: "project_id, issue_id, dan feature_id wajib diisi" };
  }

  let properties: Record<string, unknown> = {};
  if (propertiesRaw) {
    try {
      const parsed = JSON.parse(propertiesRaw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: "properties_json harus object JSON" };
      }
      properties = parsed as Record<string, unknown>;
    } catch {
      return { error: "properties_json tidak valid" };
    }
  }

  const issueCheck = await ensureIssueInProject(supabase, projectId, issueId);
  if (!issueCheck.ok) {
    return { error: issueCheck.error };
  }

  const { data: row, error: rowErr } = await supabase
    .schema("spatial")
    .from("issue_geometry_features")
    .select("id")
    .eq("id", featureId)
    .eq("issue_id", issueId)
    .maybeSingle();
  if (rowErr) return { error: rowErr.message };
  if (!row?.id) return { error: "Fitur geometri tidak ditemukan" };

  const labelCandidate =
    properties.Nama ?? properties.nama ?? properties.name ?? properties.Name;
  const label =
    labelCandidate != null && String(labelCandidate).trim() !== ""
      ? String(labelCandidate).trim()
      : null;

  const { error: updErr } = await supabase
    .schema("spatial")
    .from("issue_geometry_features")
    .update({
      properties,
      ...(label != null ? { label } : {}),
    })
    .eq("id", featureId)
    .eq("issue_id", issueId);

  if (updErr) {
    return { error: updErr.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteIssueGeometryFeatureByIdAction(
  formData: FormData
): Promise<DeleteIssueGeometryFeatureResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { error: "Supabase tidak dikonfigurasi" };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Belum masuk" };
  }

  const projectId = String(formData.get("project_id") ?? "").trim();
  const issueId = String(formData.get("issue_id") ?? "").trim();
  const featureId = String(formData.get("feature_id") ?? "").trim();
  if (!projectId || !issueId || !featureId) {
    return { error: "project_id, issue_id, dan feature_id wajib diisi" };
  }

  const issueCheck = await ensureIssueInProject(supabase, projectId, issueId);
  if (!issueCheck.ok) {
    return { error: issueCheck.error };
  }

  const { error: delErr } = await supabase
    .schema("spatial")
    .from("issue_geometry_features")
    .delete()
    .eq("id", featureId)
    .eq("issue_id", issueId);

  if (delErr) {
    return { error: delErr.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteAllIssueGeometryFeaturesForIssueAction(
  formData: FormData
): Promise<DeleteAllIssueGeometryFeaturesResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { error: "Supabase tidak dikonfigurasi", deleted: 0 };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Belum masuk", deleted: 0 };
  }

  const projectId = String(formData.get("project_id") ?? "").trim();
  const issueId = String(formData.get("issue_id") ?? "").trim();
  if (!projectId || !issueId) {
    return { error: "project_id dan issue_id wajib diisi", deleted: 0 };
  }

  const issueCheck = await ensureIssueInProject(supabase, projectId, issueId);
  if (!issueCheck.ok) {
    return { error: issueCheck.error, deleted: 0 };
  }

  const { data: removed, error: delErr } = await supabase
    .schema("spatial")
    .from("issue_geometry_features")
    .delete()
    .eq("issue_id", issueId)
    .select("id");

  if (delErr) {
    return { error: delErr.message, deleted: 0 };
  }

  revalidatePath("/", "layout");
  return { error: null, deleted: removed?.length ?? 0 };
}
