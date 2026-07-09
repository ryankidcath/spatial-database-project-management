/**
 * Smoke test heuristik klasifikasi layer CAD (Fase 7).
 * Jalankan: npx --yes tsx src/lib/dxf-layer-classification.smoke.ts
 * (dari folder app/)
 */

import {
  buildSplitGroupsFromGeometry,
  classifyDxfLayer,
  matchDxfLayerAlias,
  normalizeDxfLayerNameForAlias,
  type DxfLayerGeomCounts,
} from "./dxf-layer-classification";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function counts(partial: Partial<DxfLayerGeomCounts>): DxfLayerGeomCounts {
  return {
    closedPolygonCount: 0,
    hatchCount: 0,
    openLineCount: 0,
    pointCount: 0,
    lineSegmentCount: 0,
    polygonizeRingCount: 0,
    ...partial,
  };
}

function main() {
  assert(
    normalizeDxfLayerNameForAlias("BIDANG_TANAH") === "bidangtanah",
    "normalize strips separators"
  );
  assert(
    normalizeDxfLayerNameForAlias("Jalan-Utama") === "jalanutama",
    "normalize lowercases"
  );

  const bidangAlias = matchDxfLayerAlias("BIDANG");
  assert(bidangAlias?.target === "bidang", "BIDANG → bidang");
  assert(matchDxfLayerAlias("persil_bpn")?.target === "bidang", "persil → bidang");
  assert(matchDxfLayerAlias("JALAN")?.target === "jalan", "JALAN → jalan");
  assert(matchDxfLayerAlias("SALURAN_DRAIN")?.target === "saluran", "drain → saluran");
  assert(matchDxfLayerAlias("TITIK_UKUR")?.target === "titik", "titik → titik");
  assert(matchDxfLayerAlias("POINTS")?.target === "titik", "POINTS → titik");
  assert(matchDxfLayerAlias("0") === null, "layer 0 no alias");
  assert(matchDxfLayerAlias("Layer1") === null, "Layer1 no alias");

  // A: alias homogen
  const a1 = classifyDxfLayer(
    "BIDANG",
    counts({ closedPolygonCount: 5 })
  );
  assert(a1.suggestedTarget === "bidang", "alias BIDANG + poligon");
  assert(a1.source === "layer_alias", "source alias");
  assert(a1.confidence === "high", "high confidence");

  const a2 = classifyDxfLayer("JALAN", counts({ openLineCount: 3 }));
  assert(a2.suggestedTarget === "jalan", "alias JALAN + garis");

  const a3 = classifyDxfLayer("SALURAN", counts({ openLineCount: 2 }));
  assert(a3.suggestedTarget === "saluran", "alias SALURAN overrides default jalan");

  const a4 = classifyDxfLayer("TITIK", counts({ pointCount: 10 }));
  assert(a4.suggestedTarget === "titik", "alias TITIK + point");

  // B: geom tanpa alias
  const b1 = classifyDxfLayer("L-01", counts({ closedPolygonCount: 2, hatchCount: 1 }));
  assert(b1.suggestedTarget === "bidang", "closed+hatch → bidang");
  assert(b1.source === "geometry", "geom source");

  const b2 = classifyDxfLayer("L-02", counts({ openLineCount: 4 }));
  assert(b2.suggestedTarget === "jalan", "open lines default jalan");
  assert(b2.confidence === "medium", "jalan default medium");

  const b3 = classifyDxfLayer("L-03", counts({ pointCount: 7 }));
  assert(b3.suggestedTarget === "titik", "points → titik");

  // Polygonize jaringan
  const b4 = classifyDxfLayer(
    "GARIS",
    counts({ openLineCount: 8, lineSegmentCount: 12, polygonizeRingCount: 3 })
  );
  assert(b4.suggestedTarget === null, "polygonize → pecah, no single target");
  assert(b4.source === "mixed", "polygonize marked mixed");
  assert(
    b4.splitGroups.some((g) => g.geomKind === "polygonize" && g.suggestedTarget === "bidang"),
    "polygonize group → bidang"
  );
  assert(
    b4.splitGroups.some((g) => g.geomKind === "linestring" && g.suggestedTarget === "jalan"),
    "sisa garis → jalan"
  );

  // Campuran
  const m1 = classifyDxfLayer(
    "CAMPUR",
    counts({ closedPolygonCount: 2, openLineCount: 3, pointCount: 4 })
  );
  assert(m1.suggestedTarget === null, "mixed → null target");
  assert(m1.splitGroups.length === 3, "3 split groups");
  assert(m1.source === "mixed", "mixed source");

  // Konflik alias vs geom
  const c1 = classifyDxfLayer("BIDANG", counts({ pointCount: 5 }));
  assert(c1.suggestedTarget === "titik", "conflict: follow geom");
  assert(c1.confidence === "low", "conflict low confidence");
  assert(c1.aliasMatch?.target === "bidang", "alias still recorded");

  // Sistem
  const s1 = classifyDxfLayer("Defpoints", counts({ pointCount: 1 }));
  assert(s1.suggestedTarget === "skip", "defpoints skip");
  assert(s1.source === "skip_system", "skip_system");

  // Empty
  const e1 = classifyDxfLayer("KOSONG", counts({}));
  assert(e1.suggestedTarget === "skip", "empty skip");
  assert(e1.source === "empty", "empty source");

  // buildSplitGroups
  const groups = buildSplitGroupsFromGeometry(
    counts({ closedPolygonCount: 1, openLineCount: 2, pointCount: 3 }),
    "saluran"
  );
  assert(groups.find((g) => g.geomKind === "linestring")?.suggestedTarget === "saluran", "lineDefault saluran");

  console.log("OK: dxf-layer-classification smoke tests passed");
}

main();
