import type { LinearRing } from "@/lib/dxf-import-utils";
import { reprojectLinearRingTo4326 } from "@/lib/crs-reproject";
import type { BidangPolygonBuild } from "@/lib/points-to-polygon-import";

export { VIRTUAL_TABLE_DXF_SOURCE_SRID_OPTIONS as VIRTUAL_TABLE_POINTS_SOURCE_SRID_OPTIONS } from "@/lib/virtual-table-dxf-import";
export { parseVirtualTableDxfSourceSrid as parseVirtualTablePointsSourceSrid } from "@/lib/virtual-table-dxf-import";

/** FeatureCollection WGS84 untuk impor virtual_rows (satu bidang = satu feature). */
export function buildVirtualTablePointsFeatureCollection(
  polygons: BidangPolygonBuild[],
  matchKeys: string[],
  labels: (string | null)[],
  matchColumnSlug: string,
  sourceEpsg: number
): GeoJSON.FeatureCollection {
  const slug = matchColumnSlug.trim();
  if (!slug) {
    throw new Error("match_column_slug kosong");
  }
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i]!;
    const matchKey = matchKeys[i]!.trim();
    if (!matchKey) {
      throw new Error(`Bidang #${i + 1}: kunci pencocokan kosong`);
    }
    const ring: LinearRing = poly.ring;
    const ll = reprojectLinearRingTo4326(ring, sourceEpsg);
    if (ll.length < 4) {
      throw new Error(
        `Bidang #${i + 1} tidak valid setelah proyeksi (terlalu sedikit titik).`
      );
    }
    const customLabel = labels[i];
    const displayLabel =
      customLabel != null && customLabel.trim() !== ""
        ? customLabel.trim()
        : `Bidang ${matchKey}`;
    const properties: Record<string, unknown> = {
      [slug]: matchKey,
      label: displayLabel,
      source: "survey_points",
      point_count: poly.points.length,
      bidang_key: poly.bidangKey,
    };
    features.push({
      type: "Feature",
      properties,
      geometry: {
        type: "Polygon",
        coordinates: [ll.map(([lng, lat]) => [lng, lat])],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function bidangPolygonsToSourceRings(
  polygons: BidangPolygonBuild[]
): LinearRing[] {
  return polygons.map((p) => p.ring);
}
