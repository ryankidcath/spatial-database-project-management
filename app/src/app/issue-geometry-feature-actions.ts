"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  extractClosedPolygonRingsFromDxfLayer,
  featureKeysForDxfPolygons,
  parseDxfDocument,
  ringToSinglePolygonWkt,
} from "@/lib/dxf-import-utils";
import {
  extractMultiPolygonFromGeoJSON,
  multiPolygonToWKT,
} from "@/lib/geojson-multipolygon";
import {
  MAX_SPATIAL_GEOMETRY_TEXT_CHARS,
  spatialGeometryTextTooLargeMessage,
} from "@/lib/spatial-import-limits";

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

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

function parseSourceSrid(raw: string): { ok: true; srid: number } | { ok: false; error: string } {
  const val = raw.trim();
  if (!val) return { ok: true, srid: 4326 };
  const num = Number(val);
  if (!Number.isInteger(num) || num <= 0) {
    return { ok: false, error: "EPSG/SRID sumber harus bilangan bulat positif (contoh: 32748)" };
  }
  return { ok: true, srid: num };
}

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
  const sourceSridRaw = String(formData.get("source_srid") ?? "4326");

  if (!projectId || !issueId || !featureKey || !geojsonRaw) {
    return { error: "project/unit kerja, feature_key, dan geojson wajib diisi" };
  }
  if (geojsonRaw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return { error: spatialGeometryTextTooLargeMessage("GeoJSON") };
  }
  const sridParsed = parseSourceSrid(sourceSridRaw);
  if (!sridParsed.ok) return { error: sridParsed.error };

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
  const wkt = multiPolygonToWKT(multiPoly);

  const issueCheck = await ensureIssueInProject(supabase, projectId, issueId);
  if (!issueCheck.ok) return { error: issueCheck.error };

  const { error: upsertErr } = await supabase.schema("spatial").rpc(
    "upsert_issue_geometry_feature_from_wkt",
    {
      p_issue_id: issueId,
      p_feature_key: featureKey,
      p_label: labelRaw || null,
      p_properties: properties,
      p_geom_wkt: wkt,
      p_source_srid: sridParsed.srid,
    }
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
  const sourceSridRaw = String(formData.get("source_srid") ?? "4326");
  if (!projectId || !issueId || !batchRaw) {
    return {
      error: "project/unit kerja dan batch_geojson_json wajib diisi",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }
  if (batchRaw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("Batch GeoJSON"),
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }
  const sridParsed = parseSourceSrid(sourceSridRaw);
  if (!sridParsed.ok) {
    return {
      error: sridParsed.error,
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

    const { error: upsertErr } = await supabase.schema("spatial").rpc(
      "upsert_issue_geometry_feature_from_wkt",
      {
        p_issue_id: issueId,
        p_feature_key: featureKey,
        p_label: label,
        p_properties: props,
        p_geom_wkt: multiPolygonToWKT(mp),
        p_source_srid: sridParsed.srid,
      }
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


/** Impor polygon tertutup (LWPOLYLINE / POLYLINE, INSERT blok, HATCH) dari satu layer DXF. */
export async function upsertIssueGeometryFeaturesFromDxfAction(
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
  const dxfText = String(formData.get("dxf_text") ?? "");
  const layerName = String(formData.get("layer_name") ?? "").trim();
  const keyPrefix = String(formData.get("feature_key_prefix") ?? "").trim();
  const sourceSridRaw = String(formData.get("source_srid") ?? "4326");

  if (!projectId || !issueId || !dxfText.trim() || !layerName) {
    return {
      error: "project_id, issue_id, teks DXF, dan layer wajib diisi",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }
  if (dxfText.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
    return {
      error: spatialGeometryTextTooLargeMessage("DXF"),
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  const sridParsed = parseSourceSrid(sourceSridRaw);
  if (!sridParsed.ok) {
    return {
      error: sridParsed.error,
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

  let dxf: ReturnType<typeof parseDxfDocument>;
  try {
    dxf = parseDxfDocument(dxfText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca DXF.";
    return {
      error: msg,
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  const rings = extractClosedPolygonRingsFromDxfLayer(dxf, layerName, dxfText);
  if (rings.length === 0) {
    return {
      error:
        "Tidak ada poligon tertutup di layer ini. Pastikan LWPOLYLINE/POLYLINE tertutup, INSERT blok (definisi berisi poligon tertutup), atau HATCH boundary valid, pada layer yang dipilih.",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  const keysJsonRaw = String(formData.get("feature_keys_json") ?? "").trim();
  let featureKeys: string[];
  let labelPerIndex: (string | null)[] | null = null;
  if (keysJsonRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(keysJsonRaw);
    } catch {
      return {
        error: "feature_keys_json harus berupa JSON array string yang valid.",
        insertedOrUpdated: 0,
        failed: 0,
        failureSamples: [],
      };
    }
    if (!Array.isArray(parsed) || parsed.length !== rings.length) {
      return {
        error: `feature_keys_json harus array dengan ${rings.length} elemen (sama dengan jumlah poligon tertutup).`,
        insertedOrUpdated: 0,
        failed: 0,
        failureSamples: [],
      };
    }
    featureKeys = parsed.map((x) => String(x ?? "").trim());
    if (featureKeys.some((k) => !k)) {
      return {
        error: "Setiap feature_key pada feature_keys_json tidak boleh kosong.",
        insertedOrUpdated: 0,
        failed: 0,
        failureSamples: [],
      };
    }

    const labelsJsonRaw = String(formData.get("feature_labels_json") ?? "").trim();
    if (labelsJsonRaw) {
      let labelsParsed: unknown;
      try {
        labelsParsed = JSON.parse(labelsJsonRaw);
      } catch {
        return {
          error: "feature_labels_json harus berupa JSON array yang valid.",
          insertedOrUpdated: 0,
          failed: 0,
          failureSamples: [],
        };
      }
      if (!Array.isArray(labelsParsed) || labelsParsed.length !== rings.length) {
        return {
          error: `feature_labels_json harus array dengan ${rings.length} elemen (sama dengan jumlah poligon).`,
          insertedOrUpdated: 0,
          failed: 0,
          failureSamples: [],
        };
      }
      labelPerIndex = labelsParsed.map((x) => {
        const t = String(x ?? "").trim();
        return t.length > 0 ? t : null;
      });
    }
  } else {
    if (!keyPrefix) {
      return {
        error:
          "Isi prefix feature_key atau kirim feature_keys_json (mapping per poligon).",
        insertedOrUpdated: 0,
        failed: 0,
        failureSamples: [],
      };
    }
    featureKeys = featureKeysForDxfPolygons(keyPrefix, layerName, rings.length);
  }

  let insertedOrUpdated = 0;
  let failed = 0;
  const failureSamples: string[] = [];

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]!;
    const featureKey = featureKeys[i]!;
    let wkt: string;
    try {
      wkt = ringToSinglePolygonWkt(ring);
    } catch {
      failed++;
      if (failureSamples.length < 10) {
        failureSamples.push(`#${i + 1}/${featureKey}: ring tidak valid`);
      }
      continue;
    }

    const properties: Record<string, unknown> = {
      source: "dxf",
      dxf_layer: layerName,
      dxf_polygon_index: i + 1,
    };

    const defaultLabel = `DXF ${layerName} #${i + 1}`;
    const customLabel = labelPerIndex?.[i];
    const resolvedLabel =
      customLabel != null && customLabel.trim() !== ""
        ? customLabel.trim()
        : defaultLabel;

    const { error: upsertErr } = await supabase.schema("spatial").rpc(
      "upsert_issue_geometry_feature_from_wkt",
      {
        p_issue_id: issueId,
        p_feature_key: featureKey,
        p_label: resolvedLabel,
        p_properties: properties,
        p_geom_wkt: wkt,
        p_source_srid: sridParsed.srid,
      }
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
