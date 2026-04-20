"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  deleteIssueGeometryFeatureByIdAction,
  updateIssueGeometryFeaturePropertiesAction,
} from "./issue-geometry-feature-actions";

export type MapFootprintLayerKind =
  | "demo"
  | "bidang_hasil_ukur"
  | "issue_geometry";

export type MapFootprint = {
  id: string;
  label: string;
  geojson: unknown;
  /** Properti fallback untuk popup bila feature.properties kosong. */
  popupProperties?: unknown;
  /** Default `demo` — warna stroke/fill berbeda untuk hasil ukur PLM. */
  layerKind?: MapFootprintLayerKind;
  /** Hanya `bidang_hasil_ukur` — untuk sorotan berkas di peta (F4-3). */
  berkasId?: string;
  /** Hanya `issue_geometry` — metadata untuk simpan properti ke baris fitur. */
  issueGeometryEdit?: {
    projectId: string;
    issueId: string;
    featureId: string;
  };
};

const DEFAULT_CENTER: L.LatLngExpression = [-6.74, 108.55];
const DEFAULT_ZOOM = 12;
const MAX_PROPERTY_VALUE_CHARS = 1200;
const POPUP_OPTIONS: L.PopupOptions = { className: "workspace-map-popup" };

function escapePopupText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupTitle(label: string, layerKind: MapFootprintLayerKind): string {
  return layerKind === "bidang_hasil_ukur"
    ? `${label} (hasil ukur PLM)`
    : label;
}

function stringifyValueForPopup(value: unknown): string {
  try {
    const pretty = JSON.stringify(value, null, 2) ?? "";
    if (pretty.length <= MAX_PROPERTY_VALUE_CHARS) return pretty;
    return `${pretty.slice(0, MAX_PROPERTY_VALUE_CHARS)} ... (dipotong)`;
  } catch {
    return String(value);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergedPopupProperties(
  value: unknown,
  fallbackProperties?: unknown
): Record<string, unknown> {
  const featureProps =
    isRecord(value) && isRecord(value.properties) ? value.properties : null;
  const fallbackProps = isRecord(fallbackProperties)
    ? fallbackProperties
    : null;
  return { ...(fallbackProps ?? {}), ...(featureProps ?? {}) };
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function cellValueForInput(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function parseValueCell(text: string): unknown {
  const t = text.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (
    !/^["[{]/.test(t) &&
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)
  ) {
    return Number(t);
  }
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return text;
  }
}

const NON_EDITABLE_PROP_KEYS = new Set(["_row_id", "feature_key"]);

function propertyGridRowsHtml(properties: Record<string, unknown>): string {
  const rows = Object.entries(properties)
    .filter(([key]) => key !== "_row_id")
    .map(([key, rawValue]) => {
      const value =
        rawValue == null
          ? "—"
          : typeof rawValue === "string" ||
              typeof rawValue === "number" ||
              typeof rawValue === "boolean"
            ? String(rawValue)
            : stringifyValueForPopup(rawValue);
      return `<div style="display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px;padding:6px 0;border-top:1px solid var(--border)">
<div style="font-size:11px;font-weight:600;color:var(--foreground);word-break:break-word">${escapePopupText(key)}</div>
<div style="font-size:11px;color:var(--foreground);white-space:pre-wrap;word-break:break-word">${escapePopupText(value)}</div>
</div>`;
    });
  return rows.join("");
}

function issueGeometryEditorRowsHtml(
  editableEntries: [string, unknown][]
): string {
  const rowStrings = editableEntries.map(
    ([key, raw]) =>
      `<div class="igm-row" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:6px;margin-bottom:6px;align-items:center">
<input type="text" class="igm-key" value="${escapeAttr(key)}" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;min-width:0;background:var(--background);color:var(--foreground)" />
<input type="text" class="igm-val" value="${escapeAttr(cellValueForInput(raw))}" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;min-width:0;background:var(--background);color:var(--foreground)" />
<button type="button" data-igm-del title="Hapus baris" style="font-size:14px;line-height:1;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--background);cursor:pointer;color:var(--muted-foreground)">×</button>
</div>`
  );
  if (rowStrings.length === 0) {
    rowStrings.push(
      `<div class="igm-row" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:6px;margin-bottom:6px;align-items:center">
<input type="text" class="igm-key" value="" placeholder="key" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;min-width:0;background:var(--background);color:var(--foreground)" />
<input type="text" class="igm-val" value="" placeholder="value" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;min-width:0;background:var(--background);color:var(--foreground)" />
<button type="button" data-igm-del title="Hapus baris" style="font-size:14px;line-height:1;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--background);cursor:pointer;color:var(--muted-foreground)">×</button>
</div>`
    );
  }
  return rowStrings.join("");
}

function issueGeometryEditorSectionHtml(
  editableEntries: [string, unknown][]
): string {
  const rowsHtml = issueGeometryEditorRowsHtml(editableEntries);
  return `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
<div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
<button type="button" data-igm-toggle style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--popover);cursor:pointer;color:var(--foreground)">Edit atribut</button>
<button type="button" data-igm-delete-feature style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid color-mix(in srgb, var(--destructive) 45%, var(--border));background:var(--popover);cursor:pointer;color:var(--destructive)">Hapus bidang</button>
</div>
<div data-igm-delete-confirm style="display:none;margin-top:8px;padding:8px;border:1px solid color-mix(in srgb, var(--destructive) 35%, var(--border));border-radius:8px;background:color-mix(in srgb, var(--destructive) 8%, var(--background))">
<div style="font-size:12px;color:var(--foreground);margin-bottom:8px">Hapus bidang terpilih ini?</div>
<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
<button type="button" data-igm-delete-cancel style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--popover);cursor:pointer;color:var(--foreground)">Batal</button>
<button type="button" data-igm-delete-confirm-yes style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--destructive);background:var(--destructive);cursor:pointer;color:var(--destructive-foreground)">Ya, hapus</button>
</div>
</div>
<div data-igm-editor data-igm-open="0" style="display:none;margin-top:10px">
<div style="font-size:12px;font-weight:600;color:var(--foreground);margin-bottom:8px">Edit / tambah / hapus atribut</div>
<div data-igm-rows>${rowsHtml}</div>
<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
<button type="button" data-igm-add style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--popover);cursor:pointer;color:var(--foreground)">Tambah baris</button>
<button type="button" data-igm-save style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--primary);background:var(--primary);cursor:pointer;color:var(--primary-foreground)">Simpan</button>
</div>
<div data-igm-msg style="font-size:11px;margin-top:6px;min-height:1em;color:var(--muted-foreground)"></div>
</div>
</div>`;
}

function popupHtmlWithGeoJson(
  fp: MapFootprint,
  value: unknown
): string {
  const layerKind = fp.layerKind ?? "demo";
  const title = escapePopupText(popupTitle(fp.label, layerKind));
  const properties = mergedPopupProperties(value, fp.popupProperties);
  const visibleProperties = Object.fromEntries(
    Object.entries(properties).filter(([key]) => key !== "_row_id")
  );
  const hasProperties = Object.keys(visibleProperties).length > 0;
  const rowsHtml = propertyGridRowsHtml(visibleProperties);
  const editableEntries = Object.entries(visibleProperties).filter(
    ([k]) => !NON_EDITABLE_PROP_KEYS.has(k)
  );
  const editorHtml =
    layerKind === "issue_geometry" && fp.issueGeometryEdit
      ? issueGeometryEditorSectionHtml(editableEntries)
      : layerKind === "issue_geometry"
        ? `<div style="margin-top:10px;font-size:11px;color:var(--muted-foreground)">Properti geometri unit kerja hanya bisa diedit jika data terhubung ke server.</div>`
        : "";
  return `<div style="min-width:260px;max-width:520px;color:var(--foreground)">
<div style="font-weight:600;margin-bottom:6px;color:var(--foreground)">${title}</div>
<div data-igm-view>
${
  hasProperties
    ? `<div data-igm-view-body style="max-height:280px;overflow:auto;padding:0">${rowsHtml}</div>`
    : `<div style="font-size:12px;color:var(--muted-foreground)">Tidak ada properti pada feature ini.</div>`
}
</div>
${editorHtml}
</div>`;
}

function collectPropertiesFromEditor(root: HTMLElement): Record<string, unknown> {
  const rows = root.querySelectorAll(".igm-row");
  const out: Record<string, unknown> = {};
  rows.forEach((row) => {
    const keyInput = row.querySelector(".igm-key") as HTMLInputElement | null;
    const valInput = row.querySelector(".igm-val") as HTMLInputElement | null;
    const k = keyInput?.value?.trim() ?? "";
    if (!k || k.startsWith("_")) return;
    if (NON_EDITABLE_PROP_KEYS.has(k)) return;
    const rawVal = valInput?.value ?? "";
    out[k] = parseValueCell(rawVal);
  });
  return out;
}

function appendEmptyEditorRow(rowsRoot: HTMLElement): void {
  const wrap = document.createElement("div");
  wrap.className = "igm-row";
  wrap.style.cssText =
    "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:6px;margin-bottom:6px;align-items:center";
  wrap.innerHTML = `<input type="text" class="igm-key" value="" placeholder="key" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;min-width:0;background:var(--background);color:var(--foreground)" />
<input type="text" class="igm-val" value="" placeholder="value" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;min-width:0;background:var(--background);color:var(--foreground)" />
<button type="button" data-igm-del title="Hapus baris" style="font-size:14px;line-height:1;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--background);cursor:pointer;color:var(--muted-foreground)">×</button>`;
  rowsRoot.appendChild(wrap);
}

function wireIssueGeometryPopupEditing(
  leafletLayer: L.Layer,
  meta: NonNullable<MapFootprint["issueGeometryEdit"]>,
  onSaved: () => void
): void {
  leafletLayer.on("popupopen", () => {
    const popup = leafletLayer.getPopup();
    const el = popup?.getElement();
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const actionButton = target.closest("button");
      if (!actionButton) return;
      const editor = el.querySelector("[data-igm-editor]") as HTMLElement | null;
      const viewPanel = el.querySelector("[data-igm-view]") as HTMLElement | null;
      const viewBody = el.querySelector("[data-igm-view-body]") as HTMLElement | null;
      const toggleBtn = el.querySelector(
        "[data-igm-toggle]"
      ) as HTMLButtonElement | null;
      const rowsRoot = el.querySelector("[data-igm-rows]") as HTMLElement | null;
      const msg = el.querySelector("[data-igm-msg]") as HTMLElement | null;
      const deleteConfirm = el.querySelector(
        "[data-igm-delete-confirm]"
      ) as HTMLElement | null;
      if (actionButton.hasAttribute("data-igm-toggle")) {
        e.preventDefault();
        if (!editor) return;
        const isHidden = editor.dataset.igmOpen !== "1";
        editor.dataset.igmOpen = isHidden ? "1" : "0";
        editor.style.display = isHidden ? "block" : "none";
        if (viewPanel) {
          viewPanel.style.display = isHidden ? "none" : "block";
        }
        if (toggleBtn) {
          toggleBtn.textContent = isHidden ? "Lihat atribut" : "Edit atribut";
        }
        if (deleteConfirm) deleteConfirm.style.display = "none";
        return;
      }

      if (!rowsRoot) return;

      if (actionButton.hasAttribute("data-igm-add")) {
        e.preventDefault();
        appendEmptyEditorRow(rowsRoot as HTMLElement);
        if (msg) {
          msg.textContent = "";
          msg.style.color = "var(--muted-foreground)";
        }
        return;
      }

      const delBtn = actionButton.hasAttribute("data-igm-del")
        ? actionButton
        : null;
      if (delBtn) {
        e.preventDefault();
        delBtn.closest(".igm-row")?.remove();
        if (msg) {
          msg.textContent = "";
          msg.style.color = "var(--muted-foreground)";
        }
        return;
      }

      if (actionButton.hasAttribute("data-igm-save")) {
        e.preventDefault();
        void (async () => {
          if (msg) {
            msg.textContent = "Menyimpan…";
            msg.style.color = "var(--muted-foreground)";
          }
          const props = collectPropertiesFromEditor(rowsRoot as HTMLElement);
          const fd = new FormData();
          fd.set("project_id", meta.projectId);
          fd.set("issue_id", meta.issueId);
          fd.set("feature_id", meta.featureId);
          fd.set("properties_json", JSON.stringify(props));
          const res =
            await updateIssueGeometryFeaturePropertiesAction(fd);
          if (res.error) {
            if (msg) {
              msg.textContent = res.error;
              msg.style.color = "var(--destructive)";
            }
            return;
          }
          if (msg) {
            msg.textContent = "Tersimpan.";
            msg.style.color = "var(--foreground)";
          }
          if (viewBody) {
            const keys = Object.keys(props);
            viewBody.innerHTML =
              keys.length > 0
                ? propertyGridRowsHtml(props)
                : `<div style="font-size:12px;color:var(--muted-foreground);padding:8px 0">Tidak ada properti pada feature ini.</div>`;
          }
          if (editor) {
            editor.dataset.igmOpen = "0";
            editor.style.display = "none";
          }
          if (viewPanel) viewPanel.style.display = "block";
          if (toggleBtn) toggleBtn.textContent = "Edit atribut";
          if (deleteConfirm) deleteConfirm.style.display = "none";
          onSaved();
        })();
        return;
      }

      if (actionButton.hasAttribute("data-igm-delete-feature")) {
        e.preventDefault();
        if (deleteConfirm) deleteConfirm.style.display = "block";
        return;
      }

      if (actionButton.hasAttribute("data-igm-delete-cancel")) {
        e.preventDefault();
        if (deleteConfirm) deleteConfirm.style.display = "none";
        return;
      }

      if (actionButton.hasAttribute("data-igm-delete-confirm-yes")) {
        e.preventDefault();
        if (deleteConfirm) {
          const yesBtn = deleteConfirm.querySelector(
            "[data-igm-delete-confirm-yes]"
          ) as HTMLButtonElement | null;
          const cancelBtn = deleteConfirm.querySelector(
            "[data-igm-delete-cancel]"
          ) as HTMLButtonElement | null;
          if (yesBtn) yesBtn.disabled = true;
          if (cancelBtn) cancelBtn.disabled = true;
        }
        void (async () => {
          if (msg) {
            msg.textContent = "Menghapus…";
            msg.style.color = "var(--muted-foreground)";
          }
          const fd = new FormData();
          fd.set("project_id", meta.projectId);
          fd.set("issue_id", meta.issueId);
          fd.set("feature_id", meta.featureId);
          const res = await deleteIssueGeometryFeatureByIdAction(fd);
          if (res.error) {
            if (msg) {
              msg.textContent = res.error;
              msg.style.color = "var(--destructive)";
            }
            if (deleteConfirm) {
              const yesBtn = deleteConfirm.querySelector(
                "[data-igm-delete-confirm-yes]"
              ) as HTMLButtonElement | null;
              const cancelBtn = deleteConfirm.querySelector(
                "[data-igm-delete-cancel]"
              ) as HTMLButtonElement | null;
              if (yesBtn) yesBtn.disabled = false;
              if (cancelBtn) cancelBtn.disabled = false;
            }
            return;
          }
          popup?.remove();
          onSaved();
        })();
      }
    };
    el.addEventListener("click", onClick);
    popup?.once("remove", () => {
      el.removeEventListener("click", onClick);
    });
  });
}

function openLayerPopup(layer: L.Layer): boolean {
  if ("openPopup" in layer && typeof layer.openPopup === "function") {
    layer.openPopup();
    return true;
  }
  if ("eachLayer" in layer && typeof layer.eachLayer === "function") {
    let opened = false;
    (layer as L.LayerGroup).eachLayer((child) => {
      if (opened) return;
      opened = openLayerPopup(child);
    });
    return opened;
  }
  return false;
}

function polygonStyle(
  feature: GeoJSON.Feature | undefined,
  layerKind: MapFootprintLayerKind,
  isHighlight: boolean
): L.PathOptions {
  if (isHighlight) {
    return {
      color: "#c2410c",
      fillColor: "#ea580c",
      fillOpacity: 0.44,
      weight: 4,
    };
  }
  const props = feature?.properties as Record<string, unknown> | undefined;
  const defaultStroke =
    layerKind === "bidang_hasil_ukur"
      ? "#047857"
      : layerKind === "issue_geometry"
        ? "#6d28d9"
        : "#2563eb";
  const defaultFill =
    layerKind === "bidang_hasil_ukur"
      ? "#10b981"
      : layerKind === "issue_geometry"
        ? "#a78bfa"
        : "#3b82f6";
  const stroke =
    typeof props?.stroke === "string" ? props.stroke : defaultStroke;
  let fillColor =
    typeof props?.fill === "string" ? props.fill : defaultFill;
  let fillOpacity = 0.35;
  if (/^#[0-9a-fA-F]{8}$/.test(fillColor)) {
    fillOpacity = parseInt(fillColor.slice(7, 9), 16) / 255;
    fillColor = fillColor.slice(0, 7);
  }
  return {
    color: stroke,
    fillColor,
    fillOpacity,
    weight: 2,
  };
}

export function WorkspaceMap({
  footprints,
  highlightBerkasId = null,
}: {
  footprints: MapFootprint[];
  /** Sorot poligon hasil ukur yang terikat `berkas_id` ini. */
  highlightBerkasId?: string | null;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const reopenPopupForFootprintIdRef = useRef<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (footprints.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const fg = L.featureGroup();
    let layerToReopen: L.Layer | null = null;
    for (const fp of footprints) {
      if (!fp.geojson || typeof fp.geojson !== "object") continue;
      const layerKind = fp.layerKind ?? "demo";
      const isHighlight =
        layerKind === "bidang_hasil_ukur" &&
        highlightBerkasId != null &&
        highlightBerkasId !== "" &&
        fp.berkasId === highlightBerkasId;
      try {
        const geojsonObject = fp.geojson as
          | { type?: string }
          | GeoJSON.GeoJsonObject;
        const isFeatureSource =
          geojsonObject &&
          typeof geojsonObject === "object" &&
          (geojsonObject.type === "Feature" ||
            geojsonObject.type === "FeatureCollection");
        const layer = L.geoJSON(fp.geojson as GeoJSON.GeoJsonObject, {
          style: (feat) =>
            polygonStyle(
              feat as GeoJSON.Feature | undefined,
              layerKind,
              isHighlight
            ),
          onEachFeature: (feature, featureLayer) => {
            featureLayer.bindPopup(
              popupHtmlWithGeoJson(fp, feature),
              POPUP_OPTIONS
            );
            if (layerKind === "issue_geometry" && fp.issueGeometryEdit) {
              wireIssueGeometryPopupEditing(
                featureLayer,
                fp.issueGeometryEdit,
                () => {
                  reopenPopupForFootprintIdRef.current = fp.id;
                  router.refresh();
                }
              );
            }
          },
        });
        // Fallback jika source bukan Feature/FeatureCollection.
        if (!isFeatureSource) {
          layer.bindPopup(popupHtmlWithGeoJson(fp, fp.geojson), POPUP_OPTIONS);
          if (layerKind === "issue_geometry" && fp.issueGeometryEdit) {
            wireIssueGeometryPopupEditing(layer, fp.issueGeometryEdit, () => {
              reopenPopupForFootprintIdRef.current = fp.id;
              router.refresh();
            });
          }
        }
        fg.addLayer(layer);
        if (reopenPopupForFootprintIdRef.current === fp.id) {
          layerToReopen = layer;
          reopenPopupForFootprintIdRef.current = null;
        }
      } catch {
        /* invalid GeoJSON — skip */
      }
    }

    fg.addTo(group);
    const b = fg.getBounds();
    if (b.isValid()) {
      map.fitBounds(b, { padding: [28, 28], maxZoom: 16 });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
    if (layerToReopen) {
      openLayerPopup(layerToReopen);
    }
  }, [footprints, highlightBerkasId, router]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-100"
      role="presentation"
    />
  );
}
