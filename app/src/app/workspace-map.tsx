"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  deleteIssueGeometryFeatureByIdAction,
  updateIssueGeometryFeaturePropertiesAction,
} from "./issue-geometry-feature-actions";
import { buildChatRowPathSegments } from "@/lib/chat-row-context";
import { useIsBelowMd } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import {
  getWorkspaceBasemap,
  type WorkspaceBasemapId,
} from "@/lib/workspace-map-basemaps";
import type { MapExtentBookmark } from "@/lib/workspace-spatial-map-preferences";
import {
  dashArrayForStyle,
  type SpatialLayerSymbolStyle,
} from "@/lib/workspace-spatial-layer-style-preference";
import {
  computeFootprintsBounds,
  type LatLngBoundsTuple,
} from "@/lib/workspace-map-bounds";
import {
  WorkspaceMapNorthArrow,
  WorkspaceMapStatusBar,
  type MapStatusState,
} from "./workspace-map-gis-chrome";
import { WorkspaceMapToolController } from "./workspace-map-tool-controller";
import { WorkspaceMapDrawBidangController } from "./workspace-map-draw-bidang-controller";
import type { DrawBidangControllerState } from "./workspace-map-draw-bidang-controller";
import { WorkspaceMapDrawLineController } from "./workspace-map-draw-line-controller";
import type { DrawLineControllerState } from "./workspace-map-draw-line-controller";
import { WorkspaceMapMoveGeomController } from "./workspace-map-move-geom-controller";
import type { MeasureDraftState } from "./workspace-map-tool-controller";
import { WorkspaceMapRelationTraceLayer } from "./workspace-map-relation-trace-layer";
import type {
  MapIdentifyHit,
  MapMeasureResult,
  MoveGeomSelection,
  MoveGeomEditSubMode,
  WorkspaceMapToolMode,
} from "@/lib/workspace-map-tool-types";
import type { LatLngPoint } from "@/lib/workspace-map-draw-bidang";
import type { CoordinateDisplayMode } from "@/lib/workspace-map-tool-types";
import { createCachedBasemapLayer } from "@/lib/workspace-map-cached-tile-layer";
import type { ResolvedExternalMapLayer } from "@/lib/workspace-spatial-external-layers";
import {
  createExternalLeafletLayer,
  ensureExternalReferencePane,
} from "@/lib/workspace-map-external-layers";
import {
  applyBasemapSwipeClips,
  clearBasemapSwipeClips,
} from "@/lib/workspace-map-basemap-swipe";

export type MapFootprintLayerKind =
  | "demo"
  | "bidang_hasil_ukur"
  | "issue_geometry"
  | "virtual_table"
  | "import_preview";

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
  /** Hanya `virtual_table` — untuk chat baris dari popup. */
  virtualTableId?: string;
  /** Hanya `virtual_table` — metadata klik → panel detail. */
  virtualRowId?: string;
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
  chatPathSegments?: string[];
};

export type VirtualRowMapSelect = {
  rowId: string;
  tableId: string;
  pathSegments: string[];
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
};

export type WorkspaceMapHandle = {
  fitAllFootprints: () => void;
  fitFootprints: (footprints: MapFootprint[]) => void;
  fitBounds: (bounds: L.LatLngBounds) => void;
  fitBoundsTuple: (bounds: LatLngBoundsTuple) => void;
  getLeafletMap: () => L.Map | null;
  getView: () => MapExtentBookmark | null;
  setView: (view: MapExtentBookmark) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const FEATURE_LABEL_MIN_ZOOM = 14;
const SURVEY_POINT_LABEL_MIN_ZOOM = 12;

const DEFAULT_CENTER: L.LatLngExpression = [-6.74, 108.55];
const DEFAULT_ZOOM = 12;

function mapFootprintsBoundsKey(
  footprints: MapFootprint[],
  highlightBerkasId: string | null | undefined
): string {
  return `${highlightBerkasId ?? ""}|${footprints.map((f) => f.id).join(",")}`;
}
const MAX_PROPERTY_VALUE_CHARS = 1200;
const POPUP_OPTIONS: L.PopupOptions = { className: "workspace-map-popup" };

function escapePopupText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupTitle(
  label: string,
  layerKind: MapFootprintLayerKind,
  properties?: Record<string, unknown>
): string {
  if (layerKind === "bidang_hasil_ukur") {
    return `${label} (hasil ukur PLM)`;
  }
  if (layerKind === "virtual_table") {
    const table =
      typeof properties?.Tabel === "string" ? properties.Tabel.trim() : "";
    const row =
      typeof properties?._popup_row_title === "string"
        ? properties._popup_row_title.trim()
        : "";
    if (table && row) return `${table} — ${row}`;
    if (table) return table;
  }
  if (layerKind === "import_preview") {
    return "Pratinjau impor (belum disimpan)";
  }
  return label;
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
  fallbackProperties?: unknown,
  layerKind?: MapFootprintLayerKind
): Record<string, unknown> {
  const featureProps =
    isRecord(value) && isRecord(value.properties) ? value.properties : null;
  const fallbackProps = isRecord(fallbackProperties)
    ? fallbackProperties
    : null;
  // Tabel virtual: data baris dari DB (fallback) mengalahkan properties GeoJSON.
  if (layerKind === "virtual_table") {
    return { ...(featureProps ?? {}), ...(fallbackProps ?? {}) };
  }
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
  const properties = mergedPopupProperties(value, fp.popupProperties, layerKind);
  const title = escapePopupText(popupTitle(fp.label, layerKind, properties));
  const virtualRowId =
    typeof properties._virtual_row_id === "string"
      ? properties._virtual_row_id.trim()
      : "";
  const visibleProperties = Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) =>
        key !== "_row_id" &&
        key !== "_popup_row_title" &&
        key !== "_virtual_row_id" &&
        key !== "_virtual_table_id" &&
        key !== "_chat_path_segments" &&
        key !== "_popup_project_name"
    )
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
  const chatPathJson =
    typeof properties._chat_path_segments === "string"
      ? properties._chat_path_segments
      : "";
  const chatTable =
    typeof properties.Tabel === "string" ? properties.Tabel.trim() : "";
  const chatRowTitle =
    typeof properties._popup_row_title === "string"
      ? properties._popup_row_title.trim()
      : "";
  const chatProject =
    typeof properties._popup_project_name === "string"
      ? properties._popup_project_name.trim()
      : "";
  const virtualTableId =
    typeof properties._virtual_table_id === "string"
      ? properties._virtual_table_id.trim()
      : "";
  const chatBtnHtml =
    layerKind === "virtual_table" && virtualRowId
      ? `<div style="margin-top:10px"><button type="button" data-vt-chat-row-id="${escapePopupText(virtualRowId)}" data-vt-chat-table-id="${escapePopupText(virtualTableId)}" data-vt-chat-path="${escapePopupText(chatPathJson)}" data-vt-chat-row-title="${escapePopupText(chatRowTitle || title)}" data-vt-chat-table="${escapePopupText(chatTable)}" data-vt-chat-project="${escapePopupText(chatProject)}" style="font-size:12px;padding:6px 12px;border-radius:6px;border:1px solid var(--primary);background:var(--primary);cursor:pointer;color:var(--primary-foreground)">Chat baris</button></div>`
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
${chatBtnHtml}
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

function buildVirtualRowSelect(
  fp: MapFootprint,
  feature?: GeoJSON.Feature
): VirtualRowMapSelect | null {
  const props = mergedPopupProperties(
    feature,
    fp.popupProperties,
    "virtual_table"
  );
  const rowId = (
    fp.virtualRowId ??
    (typeof props._virtual_row_id === "string" ? props._virtual_row_id : "")
  ).trim();
  const tableId = (
    fp.virtualTableId ??
    (typeof props._virtual_table_id === "string" ? props._virtual_table_id : "")
  ).trim();
  if (!rowId || !tableId) return null;

  let pathSegments = fp.chatPathSegments ?? [];
  if (pathSegments.length === 0) {
    const pathRaw =
      typeof props._chat_path_segments === "string"
        ? props._chat_path_segments.trim()
        : "";
    if (pathRaw) {
      try {
        const parsed = JSON.parse(pathRaw) as unknown;
        if (Array.isArray(parsed)) {
          pathSegments = parsed
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean);
        }
      } catch {
        pathSegments = [];
      }
    }
  }
  if (pathSegments.length === 0) {
    const rowTitle =
      typeof props._popup_row_title === "string"
        ? props._popup_row_title.trim()
        : rowId.slice(0, 8);
    const table =
      typeof props.Tabel === "string" ? props.Tabel.trim() : fp.label;
    const project =
      typeof props._popup_project_name === "string"
        ? props._popup_project_name.trim()
        : "";
    pathSegments = buildChatRowPathSegments({
      projectName: project || null,
      tableDisplayName: table,
      rowLabel: rowTitle,
    });
  }

  return {
    rowId,
    tableId,
    pathSegments,
    rowPayload: fp.rowPayload,
    relationLabels: fp.relationLabels,
  };
}

function ensureVirtualTableFeatureProperties(
  feature: GeoJSON.Feature,
  fp: MapFootprint
): void {
  if (!feature.properties) {
    feature.properties = {};
  }
  const props = feature.properties as Record<string, unknown>;
  if (fp.virtualRowId) props._virtual_row_id = fp.virtualRowId;
  if (fp.virtualTableId) props._virtual_table_id = fp.virtualTableId;
  if (fp.popupProperties && typeof fp.popupProperties === "object") {
    Object.assign(props, fp.popupProperties);
  }
}

function wireVirtualTableFeatureClick(
  layer: L.Layer,
  fp: MapFootprint,
  feature: GeoJSON.Feature,
  onSelect?: (select: VirtualRowMapSelect) => void
): void {
  if (!onSelect || (fp.layerKind ?? "demo") !== "virtual_table") return;
  const select = buildVirtualRowSelect(fp, feature);
  if (!select) return;
  layer.on("click", (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    onSelect(select);
  });
}

function mapFeatureLabel(fp: MapFootprint): string {
  if (fp.popupProperties && isRecord(fp.popupProperties)) {
    const title = fp.popupProperties._popup_row_title;
    if (typeof title === "string" && title.trim()) return title.trim();
  }
  const idx = fp.label.indexOf(": ");
  return idx >= 0 ? fp.label.slice(idx + 2) : fp.label;
}

function resolveFootprintOpacity(
  fp: MapFootprint,
  layerOpacityByTableId: Record<string, number>,
  importPreviewOpacity: number
): number {
  if (fp.layerKind === "import_preview") return importPreviewOpacity;
  if (fp.layerKind === "virtual_table" && fp.virtualTableId) {
    const v = layerOpacityByTableId[fp.virtualTableId];
    return v == null ? 1 : Math.min(1, Math.max(0.1, v));
  }
  return 1;
}

function fitMapToBounds(map: L.Map, bounds: LatLngBoundsTuple): void {
  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
}

function bindFeatureLabel(
  featureLayer: L.Layer,
  fp: MapFootprint,
  map: L.Map,
  showLabels: boolean
): void {
  if (!showLabels || !("bindTooltip" in featureLayer)) return;
  const text = mapFeatureLabel(fp);
  if (!text) return;
  featureLayer.bindTooltip(text, {
    permanent: true,
    direction: "center",
    className: "workspace-map-feature-label",
    opacity: 0.92,
  });
  const updateVisibility = () => {
    const tip = featureLayer.getTooltip?.();
    const el = tip?.getElement?.();
    if (el) {
      el.style.display =
        map.getZoom() >= FEATURE_LABEL_MIN_ZOOM ? "" : "none";
    }
  };
  updateVisibility();
  map.on("zoomend", updateVisibility);
  featureLayer.on("remove", () => {
    map.off("zoomend", updateVisibility);
  });
}

/** Label T1,T2… pada titik lapangan (cocok sketsa kertas). */
function surveyPointDisplayLabel(feature: GeoJSON.Feature): string | null {
  const props = feature.properties;
  if (!props || typeof props !== "object") return null;
  const src = props.source;
  const namaTitik = props.nama_titik;
  if (typeof namaTitik === "string" && namaTitik.trim()) {
    return namaTitik.trim();
  }
  const raw = props.label;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const text = raw.trim();
  if (src === "field_points" || src === "survey_points_archive") return text;
  if (/^T\d+$/i.test(text)) return text;
  const m = text.match(/\bT\d+\b/i);
  if (m) return m[0]!.toUpperCase();
  return null;
}

function bindSurveyPointMapLabel(
  featureLayer: L.Layer,
  feature: GeoJSON.Feature,
  map: L.Map
): void {
  const text = surveyPointDisplayLabel(feature);
  if (!text || !("bindTooltip" in featureLayer)) return;
  featureLayer.bindTooltip(text, {
    permanent: true,
    direction: "top",
    offset: L.point(0, -7),
    className: "workspace-map-survey-point-label",
    opacity: 1,
  });
  const updateVisibility = () => {
    const tip = featureLayer.getTooltip?.();
    const el = tip?.getElement?.();
    if (el) {
      el.style.display =
        map.getZoom() >= SURVEY_POINT_LABEL_MIN_ZOOM ? "" : "none";
    }
  };
  updateVisibility();
  map.on("zoomend", updateVisibility);
  featureLayer.on("remove", () => {
    map.off("zoomend", updateVisibility);
  });
}

function polygonStyle(
  feature: GeoJSON.Feature | undefined,
  layerKind: MapFootprintLayerKind,
  isBerkasHighlight: boolean,
  highlightVirtualRowId: string | null | undefined,
  highlightVirtualRowIds: ReadonlySet<string> | undefined,
  layerOpacity: number,
  isImportOverlap: boolean,
  isMoveGeomOverlap: boolean,
  isAnalysisHighlight: boolean,
  customSymbol?: SpatialLayerSymbolStyle
): L.PathOptions {
  if (isImportOverlap || isMoveGeomOverlap) {
    return {
      color: "#dc2626",
      fillColor: "#f87171",
      fillOpacity: 0.35 * Math.min(1, Math.max(0.1, layerOpacity)),
      opacity: layerOpacity,
      weight: 3,
      dashArray: "5 3",
    };
  }
  if (isAnalysisHighlight) {
    return {
      color: "#7c3aed",
      fillColor: "#a78bfa",
      fillOpacity: 0.45 * Math.min(1, Math.max(0.1, layerOpacity)),
      opacity: layerOpacity,
      weight: 3,
      dashArray: "4 2",
    };
  }
  const props = feature?.properties as Record<string, unknown> | undefined;
  const virtualRowId =
    typeof props?._virtual_row_id === "string"
      ? props._virtual_row_id.trim()
      : "";
  const isVirtualRowHighlight =
    layerKind === "virtual_table" &&
    virtualRowId !== "" &&
    ((highlightVirtualRowIds != null && highlightVirtualRowIds.has(virtualRowId)) ||
      (highlightVirtualRowId != null &&
        highlightVirtualRowId !== "" &&
        virtualRowId === highlightVirtualRowId));

  if (isBerkasHighlight || isVirtualRowHighlight) {
    return {
      color: "#c2410c",
      fillColor: "#ea580c",
      fillOpacity: 0.44,
      weight: 4,
    };
  }
  const defaultStroke =
    layerKind === "bidang_hasil_ukur"
      ? "#047857"
      : layerKind === "issue_geometry"
        ? "#6d28d9"
        : layerKind === "virtual_table"
          ? "#b45309"
          : layerKind === "import_preview"
            ? "#0d9488"
            : "#2563eb";
  const defaultFill =
    layerKind === "bidang_hasil_ukur"
      ? "#10b981"
      : layerKind === "issue_geometry"
        ? "#a78bfa"
        : layerKind === "virtual_table"
          ? "#fbbf24"
          : layerKind === "import_preview"
            ? "#5eead4"
            : "#3b82f6";
  const stroke =
    customSymbol?.strokeColor ??
    (typeof props?.stroke === "string" ? props.stroke : defaultStroke);
  let fillColor =
    customSymbol?.fillColor ??
    (typeof props?.fill === "string" ? props.fill : defaultFill);
  let fillOpacity = 0.35;
  if (/^#[0-9a-fA-F]{8}$/.test(fillColor)) {
    fillOpacity = parseInt(fillColor.slice(7, 9), 16) / 255;
    fillColor = fillColor.slice(0, 7);
  }
  const opacity = Math.min(1, Math.max(0.1, layerOpacity));
  fillOpacity = (layerKind === "import_preview" ? 0.28 : fillOpacity) * opacity;
  const weight =
    customSymbol?.strokeWidth ??
    (layerKind === "import_preview" ? 2.5 : 2);
  const dashArray =
    dashArrayForStyle(customSymbol?.dash) ??
    (layerKind === "import_preview" ? "6 4" : undefined);
  return {
    color: stroke,
    fillColor,
    fillOpacity,
    opacity,
    weight,
    dashArray,
  };
}

function pointMarkerStyle(
  layerKind: MapFootprintLayerKind,
  layerOpacity: number,
  customSymbol?: SpatialLayerSymbolStyle
): L.CircleMarkerOptions {
  const stroke =
    customSymbol?.strokeColor ??
    (layerKind === "virtual_table" ? "#1d4ed8" : "#2563eb");
  const fill =
    customSymbol?.fillColor ??
    (layerKind === "virtual_table" ? "#3b82f6" : "#60a5fa");
  const opacity = Math.min(1, Math.max(0.1, layerOpacity));
  return {
    radius: 5,
    color: stroke,
    fillColor: fill,
    fillOpacity: 0.88 * opacity,
    opacity,
    weight: 2,
  };
}

export type WorkspaceMapProps = {
  footprints: MapFootprint[];
  /** Semua footprint (termasuk lapisan off) untuk zoom ke lapisan. */
  allFootprints?: MapFootprint[];
  highlightBerkasId?: string | null;
  highlightVirtualRowId?: string | null;
  highlightVirtualRowIds?: ReadonlySet<string>;
  onVirtualRowSelect?: (select: VirtualRowMapSelect) => void;
  onMapBackgroundClick?: () => void;
  basemapId?: WorkspaceBasemapId;
  showFeatureLabels?: boolean;
  layerOpacityByTableId?: Record<string, number>;
  layerStyleByTableId?: Record<string, SpatialLayerSymbolStyle>;
  importPreviewOpacity?: number;
  enableGisChrome?: boolean;
  toolMode?: WorkspaceMapToolMode;
  importOverlapFootprintIds?: ReadonlySet<string>;
  moveGeomOverlapFootprintIds?: ReadonlySet<string>;
  analysisHighlightFootprintIds?: ReadonlySet<string>;
  identifyFootprints?: MapFootprint[];
  onIdentifyResults?: (hits: MapIdentifyHit[], lat: number, lng: number) => void;
  onMeasureDraftChange?: (draft: MeasureDraftState) => void;
  onMeasureFinished?: (result: MapMeasureResult) => void;
  finishMeasureSignal?: number;
  clearMeasureSignal?: number;
  drawBidangSnapEnabled?: boolean;
  drawSnapFootprints?: MapFootprint[];
  onDrawBidangDraftChange?: (draft: DrawBidangControllerState) => void;
  onDrawRingClosed?: (ring: LatLngPoint[]) => void;
  closeDrawRingSignal?: number;
  undoDrawPointSignal?: number;
  clearDrawSignal?: number;
  drawGarisSnapEnabled?: boolean;
  onDrawLineDraftChange?: (draft: DrawLineControllerState) => void;
  onDrawLineFinished?: (line: LatLngPoint[]) => void;
  finishDrawLineSignal?: number;
  moveGeomFootprints?: MapFootprint[];
  moveGeomSnapEnabled?: boolean;
  moveGeomSnapFootprints?: MapFootprint[];
  moveGeomSelection?: MoveGeomSelection | null;
  moveGeomEditSubMode?: MoveGeomEditSubMode;
  moveGeomDeltaLat?: number;
  moveGeomDeltaLng?: number;
  moveGeomRotationDeg?: number;
  moveGeomRotationPivotVertexIndex?: number | null;
  moveGeomVertexEdits?: import("@/lib/workspace-map-vertex-edit-geom").MoveGeomVertexEdits;
  moveGeomRotationSupported?: boolean;
  moveGeomVertexEditSupported?: boolean;
  moveGeomHideFootprintId?: string | null;
  onMoveGeomSelect?: (selection: MoveGeomSelection) => void;
  onMoveGeomDeltaChange?: (deltaLat: number, deltaLng: number) => void;
  onMoveGeomRotationChange?: (rotationDeg: number) => void;
  onMoveGeomRotationPivotChange?: (pivotVertexIndex: number | null) => void;
  onMoveGeomVertexEditChange?: (index: number, lat: number, lng: number) => void;
  onMoveGeomSubModeChange?: (mode: MoveGeomEditSubMode) => void;
  onMoveGeomDragStart?: () => void;
  onMoveGeomDragEnd?: () => void;
  coordinateDisplay?: CoordinateDisplayMode;
  onCoordinateDisplayToggle?: () => void;
  onMapReady?: (map: L.Map | null) => void;
  swipeCompareEnabled?: boolean;
  compareBasemapId?: WorkspaceBasemapId | null;
  swipePercent?: number;
  externalLayers?: ResolvedExternalMapLayer[];
  offlineBasemapMode?: boolean;
  externalStatusBar?: boolean;
  onStatusStateChange?: (state: MapStatusState) => void;
  relationTraceSegments?: import("@/lib/workspace-map-relation-trace").RelationTraceSegment[];
  showRelationTrace?: boolean;
};

export const WorkspaceMap = forwardRef<WorkspaceMapHandle, WorkspaceMapProps>(
  function WorkspaceMap(
    {
      footprints,
      allFootprints,
      highlightBerkasId = null,
      highlightVirtualRowId = null,
      highlightVirtualRowIds,
      onVirtualRowSelect,
      onMapBackgroundClick,
      basemapId = "osm",
      showFeatureLabels = false,
      layerOpacityByTableId = {},
      layerStyleByTableId = {},
      importPreviewOpacity = 1,
      enableGisChrome = false,
      toolMode = "navigate",
      importOverlapFootprintIds,
      moveGeomOverlapFootprintIds,
      analysisHighlightFootprintIds,
      identifyFootprints,
      onIdentifyResults,
      onMeasureDraftChange,
      onMeasureFinished,
      finishMeasureSignal = 0,
      clearMeasureSignal = 0,
      drawBidangSnapEnabled = true,
      drawSnapFootprints = [],
      onDrawBidangDraftChange,
      onDrawRingClosed,
      closeDrawRingSignal = 0,
      undoDrawPointSignal = 0,
      clearDrawSignal = 0,
      drawGarisSnapEnabled = true,
      onDrawLineDraftChange,
      onDrawLineFinished,
      finishDrawLineSignal = 0,
      moveGeomFootprints = [],
      moveGeomSnapEnabled = true,
      moveGeomSnapFootprints = [],
      moveGeomSelection = null,
      moveGeomEditSubMode = "translate",
      moveGeomDeltaLat = 0,
      moveGeomDeltaLng = 0,
      moveGeomRotationDeg = 0,
      moveGeomRotationPivotVertexIndex = null,
      moveGeomVertexEdits = {},
      moveGeomRotationSupported = false,
      moveGeomVertexEditSupported = false,
      moveGeomHideFootprintId = null,
      onMoveGeomSelect,
      onMoveGeomDeltaChange,
      onMoveGeomRotationChange,
      onMoveGeomRotationPivotChange,
      onMoveGeomVertexEditChange,
      onMoveGeomSubModeChange,
      onMoveGeomDragStart,
      onMoveGeomDragEnd,
      coordinateDisplay = "latlng",
      onCoordinateDisplayToggle,
      onMapReady,
      swipeCompareEnabled = false,
      compareBasemapId = null,
      swipePercent = 50,
      externalLayers = [],
      offlineBasemapMode = false,
      externalStatusBar = false,
      onStatusStateChange,
      relationTraceSegments = [],
      showRelationTrace = false,
    },
    ref
  ) {
  const router = useRouter();
  const isBelowMd = useIsBelowMd();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const zoomControlRef = useRef<L.Control.Zoom | null>(null);
  const basemapLayerRef = useRef<L.TileLayer | null>(null);
  const compareBasemapLayerRef = useRef<L.TileLayer | null>(null);
  const swipePercentRef = useRef(swipePercent);
  const externalLayersGroupRef = useRef<L.LayerGroup | null>(null);
  const lastBasemapStateRef = useRef({
    id: basemapId,
    offline: offlineBasemapMode,
  });
  const currentBasemapIdRef = useRef<WorkspaceBasemapId>(basemapId);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const allFootprintsRef = useRef<MapFootprint[]>([]);
  const reopenPopupForFootprintIdRef = useRef<string | null>(null);
  const lastAutoFitBoundsKeyRef = useRef<string | null>(null);
  const userAdjustedViewRef = useRef(false);
  const [statusState, setStatusState] = useState<MapStatusState>({
    lat: DEFAULT_CENTER[0],
    lng: DEFAULT_CENTER[1],
    zoom: DEFAULT_ZOOM,
    hasPointer: false,
  });

  useEffect(() => {
    onStatusStateChange?.(statusState);
  }, [statusState, onStatusStateChange]);

  useEffect(() => {
    swipePercentRef.current = swipePercent;
    const map = mapRef.current;
    const primary = basemapLayerRef.current;
    const compare = compareBasemapLayerRef.current;
    if (!map || !primary || !compare) return;
    applyBasemapSwipeClips(map, primary, compare, swipePercent);
  }, [swipePercent]);

  useEffect(() => {
    allFootprintsRef.current = allFootprints ?? footprints;
  }, [allFootprints, footprints]);

  useImperativeHandle(
    ref,
    () => ({
      fitAllFootprints: () => {
        const map = mapRef.current;
        if (!map) return;
        const bounds = computeFootprintsBounds(allFootprintsRef.current);
        if (bounds) {
          fitMapToBounds(map, bounds);
          userAdjustedViewRef.current = true;
        }
      },
      fitFootprints: (fps: MapFootprint[]) => {
        const map = mapRef.current;
        if (!map) return;
        const bounds = computeFootprintsBounds(fps);
        if (bounds) {
          fitMapToBounds(map, bounds);
          userAdjustedViewRef.current = true;
        }
      },
      fitBounds: (bounds: L.LatLngBounds) => {
        const map = mapRef.current;
        if (!map || !bounds.isValid()) return;
        fitMapToBounds(map, [
          [bounds.getSouth(), bounds.getWest()],
          [bounds.getNorth(), bounds.getEast()],
        ]);
        userAdjustedViewRef.current = true;
      },
      fitBoundsTuple: (bounds: LatLngBoundsTuple) => {
        const map = mapRef.current;
        if (!map) return;
        fitMapToBounds(map, bounds);
        userAdjustedViewRef.current = true;
      },
      getView: () => {
        const map = mapRef.current;
        if (!map) return null;
        const c = map.getCenter();
        return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
      },
      setView: (view: MapExtentBookmark) => {
        const map = mapRef.current;
        if (!map) return;
        map.setView([view.lat, view.lng], view.zoom, { animate: true });
        userAdjustedViewRef.current = true;
      },
      zoomIn: () => {
        mapRef.current?.zoomIn();
      },
      zoomOut: () => {
        mapRef.current?.zoomOut();
      },
      getLeafletMap: () => mapRef.current,
    }),
    []
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      zoomControl: false,
      scrollWheelZoom: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    const zoom = L.control.zoom({
      position: isBelowMd ? "topright" : "topleft",
    });
    zoom.addTo(map);
    zoomControlRef.current = zoom;

    map.attributionControl.setPosition(isBelowMd ? "bottomleft" : "bottomright");

    const basemap = getWorkspaceBasemap(basemapId);
    const tile = createCachedBasemapLayer(basemap.url, {
      maxZoom: basemap.maxZoom,
      attribution: basemap.attribution,
      cacheBasemapId: basemap.id,
      offlineMode: offlineBasemapMode,
    });
    tile.addTo(map);
    tile.setZIndex(1);
    basemapLayerRef.current = tile;
    currentBasemapIdRef.current = basemap.id;
    lastBasemapStateRef.current = {
      id: basemap.id,
      offline: offlineBasemapMode,
    };

    // Skala grafis Leaflet dihilangkan — angka skala ada di status bar GIS.
    const markUserAdjusted = () => {
      userAdjustedViewRef.current = true;
    };
    const syncStatusZoom = () => {
      setStatusState((prev) => ({
        ...prev,
        zoom: map.getZoom(),
      }));
    };
    map.on("zoomend", markUserAdjusted);
    map.on("moveend", markUserAdjusted);
    map.on("zoomend", syncStatusZoom);
    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      setStatusState({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        zoom: map.getZoom(),
        hasPointer: true,
      });
    });
    map.on("mouseout", () => {
      setStatusState((prev) => ({ ...prev, hasPointer: false }));
    });

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    setMapInstance(map);
    layerGroupRef.current = group;
    onMapReady?.(map);

    return () => {
      onMapReady?.(null);
      map.off("zoomend", markUserAdjusted);
      map.off("moveend", markUserAdjusted);
      map.off("zoomend", syncStatusZoom);
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
      layerGroupRef.current = null;
      externalLayersGroupRef.current = null;
      basemapLayerRef.current = null;
      compareBasemapLayerRef.current = null;
      lastAutoFitBoundsKeyRef.current = null;
      userAdjustedViewRef.current = false;
      zoomControlRef.current = null;
    };
  }, [isBelowMd, enableGisChrome]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const prev = lastBasemapStateRef.current;
    if (prev.id === basemapId && prev.offline === offlineBasemapMode) return;

    const basemap = getWorkspaceBasemap(basemapId);
    const existing = basemapLayerRef.current;
    if (existing) map.removeLayer(existing);
    const next = createCachedBasemapLayer(basemap.url, {
      maxZoom: basemap.maxZoom,
      attribution: basemap.attribution,
      cacheBasemapId: basemap.id,
      offlineMode: offlineBasemapMode,
    });
    next.addTo(map);
    next.setZIndex(1);
    basemapLayerRef.current = next;
    currentBasemapIdRef.current = basemap.id;
    lastBasemapStateRef.current = {
      id: basemap.id,
      offline: offlineBasemapMode,
    };
    compareBasemapLayerRef.current?.setZIndex(2);
  }, [basemapId, offlineBasemapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    ensureExternalReferencePane(map);

    const existing = externalLayersGroupRef.current;
    if (existing && !map.hasLayer(existing)) {
      externalLayersGroupRef.current = null;
    }
    if (!externalLayersGroupRef.current) {
      externalLayersGroupRef.current = L.layerGroup().addTo(map);
    }
    const group = externalLayersGroupRef.current;
    group.clearLayers();
    for (const layer of externalLayers) {
      const leafletLayer = createExternalLeafletLayer(layer);
      if (leafletLayer) group.addLayer(leafletLayer);
    }
  }, [externalLayers, mapInstance]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const removeCompare = () => {
      const primary = basemapLayerRef.current;
      const layer = compareBasemapLayerRef.current;
      if (layer) {
        map.removeLayer(layer);
        compareBasemapLayerRef.current = null;
      }
      clearBasemapSwipeClips(primary, layer);
    };

    if (
      !swipeCompareEnabled ||
      !compareBasemapId ||
      compareBasemapId === basemapId
    ) {
      removeCompare();
      return;
    }

    const primary = basemapLayerRef.current;
    if (!primary) return;

    const compareDef = getWorkspaceBasemap(compareBasemapId);
    removeCompare();
    const compareLayer = L.tileLayer(compareDef.url, {
      maxZoom: compareDef.maxZoom,
      attribution: compareDef.attribution,
      crossOrigin: true,
    });
    compareLayer.addTo(map);
    compareLayer.setZIndex(2);
    primary.setZIndex(1);
    compareBasemapLayerRef.current = compareLayer;

    const syncClip = () => {
      const p = basemapLayerRef.current;
      const c = compareBasemapLayerRef.current;
      if (!p || !c) return;
      applyBasemapSwipeClips(map, p, c, swipePercentRef.current);
    };

    compareLayer.on("load", syncClip);
    compareLayer.on("add", syncClip);
    map.on("move", syncClip);
    map.on("zoom", syncClip);
    map.on("zoomend", syncClip);
    map.on("moveend", syncClip);
    map.on("resize", syncClip);
    requestAnimationFrame(syncClip);

    return () => {
      compareLayer.off("load", syncClip);
      compareLayer.off("add", syncClip);
      map.off("move", syncClip);
      map.off("zoom", syncClip);
      map.off("zoomend", syncClip);
      map.off("moveend", syncClip);
      map.off("resize", syncClip);
      removeCompare();
    };
  }, [
    swipeCompareEnabled,
    compareBasemapId,
    basemapId,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const zoom = zoomControlRef.current;
    if (!map || !zoom) return;
    const position = isBelowMd ? "topright" : "topleft";
    if (zoom.getPosition() !== position) {
      zoom.setPosition(position);
    }
    map.attributionControl.setPosition(isBelowMd ? "bottomleft" : "bottomright");
  }, [isBelowMd]);

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
      const emptyKey = mapFootprintsBoundsKey(footprints, highlightBerkasId);
      if (
        lastAutoFitBoundsKeyRef.current !== emptyKey &&
        !userAdjustedViewRef.current
      ) {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        lastAutoFitBoundsKeyRef.current = emptyKey;
      }
      return;
    }

    const fg = L.featureGroup();
    let layerToReopen: L.Layer | null = null;
    for (const fp of footprints) {
      if (
        moveGeomHideFootprintId &&
        fp.id === moveGeomHideFootprintId &&
        toolMode === "move-geom"
      ) {
        continue;
      }
      if (!fp.geojson || typeof fp.geojson !== "object") continue;
      const layerKind = fp.layerKind ?? "demo";
      const isBerkasHighlight =
        layerKind === "bidang_hasil_ukur" &&
        highlightBerkasId != null &&
        highlightBerkasId !== "" &&
        fp.berkasId === highlightBerkasId;
        const useVirtualRowClick =
          layerKind === "virtual_table" &&
          onVirtualRowSelect != null &&
          toolMode === "navigate";
        const allowFeaturePopup = toolMode === "navigate";
        const layerInteractive = allowFeaturePopup;
      const fpOpacity = resolveFootprintOpacity(
        fp,
        layerOpacityByTableId,
        importPreviewOpacity
      );
      const isImportOverlap =
        importOverlapFootprintIds?.has(fp.id) ?? false;
      const isMoveGeomOverlap =
        moveGeomOverlapFootprintIds?.has(fp.id) ?? false;
      const isAnalysisHighlight =
        analysisHighlightFootprintIds?.has(fp.id) ?? false;
      const customSymbol =
        fp.virtualTableId && layerStyleByTableId[fp.virtualTableId]
          ? layerStyleByTableId[fp.virtualTableId]
          : undefined;
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
          interactive: layerInteractive,
          pointToLayer: (feature, latlng) =>
            L.circleMarker(
              latlng,
              pointMarkerStyle(layerKind, fpOpacity, customSymbol)
            ),
          style: (feat) =>
            polygonStyle(
              feat as GeoJSON.Feature | undefined,
              layerKind,
              isBerkasHighlight,
              highlightVirtualRowId,
              highlightVirtualRowIds,
              fpOpacity,
              isImportOverlap,
              isMoveGeomOverlap,
              isAnalysisHighlight,
              customSymbol
            ),
          onEachFeature: (feature, featureLayer) => {
            if (layerKind === "virtual_table") {
              ensureVirtualTableFeatureProperties(feature, fp);
            }
            if (feature.geometry?.type === "Point") {
              bindSurveyPointMapLabel(
                featureLayer,
                feature as GeoJSON.Feature,
                map
              );
            }
            bindFeatureLabel(featureLayer, fp, map, showFeatureLabels);
            if (useVirtualRowClick) {
              wireVirtualTableFeatureClick(
                featureLayer,
                fp,
                feature,
                onVirtualRowSelect
              );
            } else if (allowFeaturePopup) {
              featureLayer.bindPopup(
                popupHtmlWithGeoJson(fp, feature),
                POPUP_OPTIONS
              );
            }
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
          if (!useVirtualRowClick && allowFeaturePopup) {
            layer.bindPopup(popupHtmlWithGeoJson(fp, fp.geojson), POPUP_OPTIONS);
          } else if (useVirtualRowClick) {
            const select = buildVirtualRowSelect(fp);
            if (select) {
              layer.on("click", (e: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(e);
                onVirtualRowSelect?.(select);
              });
            }
          }
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

    const boundsKey = mapFootprintsBoundsKey(footprints, highlightBerkasId);
    const boundsKeyChanged = lastAutoFitBoundsKeyRef.current !== boundsKey;
    const shouldAutoFit =
      boundsKeyChanged && !userAdjustedViewRef.current;

    if (shouldAutoFit) {
      const b = fg.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [28, 28], maxZoom: 16 });
      } else if (footprints.length === 0) {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
      lastAutoFitBoundsKeyRef.current = boundsKey;
    }

    if (layerToReopen && toolMode === "navigate") {
      openLayerPopup(layerToReopen);
    }
  }, [
    footprints,
    highlightBerkasId,
    highlightVirtualRowId,
    highlightVirtualRowIds,
    onVirtualRowSelect,
    router,
    layerOpacityByTableId,
    layerStyleByTableId,
    importPreviewOpacity,
    showFeatureLabels,
    toolMode,
    moveGeomHideFootprintId,
    importOverlapFootprintIds,
    moveGeomOverlapFootprintIds,
    analysisHighlightFootprintIds,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapBackgroundClick) return;
    if (toolMode !== "navigate") return;
    const handler = () => onMapBackgroundClick();
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [onMapBackgroundClick, toolMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (toolMode !== "navigate") {
      map.closePopup();
    }
  }, [toolMode]);

  const northClass = isBelowMd ? "right-12 top-2" : "right-2 top-2";

  return (
    <div className="relative h-full min-h-0 w-full min-w-0 flex-1">
      <div
        ref={containerRef}
        className={cn(
          "workspace-map-root h-full min-h-0 w-full min-w-0 border border-slate-200 bg-slate-100",
          enableGisChrome ? "rounded-none" : "rounded-md",
          enableGisChrome && "workspace-map-root--gis",
          isBelowMd && "touch-manipulation"
        )}
        role="presentation"
        aria-label="Spasial Portal"
      />
      {enableGisChrome ? (
        <>
          <WorkspaceMapNorthArrow className={northClass} />
          {!externalStatusBar ? (
            <WorkspaceMapStatusBar
              state={statusState}
              coordinateDisplay={coordinateDisplay}
              onCoordinateDisplayToggle={onCoordinateDisplayToggle}
            />
          ) : null}
        </>
      ) : null}
      {mapInstance && enableGisChrome ? (
        <WorkspaceMapToolController
          map={mapInstance}
          toolMode={toolMode}
          identifyFootprints={identifyFootprints ?? footprints}
          onIdentifyResults={onIdentifyResults ?? (() => {})}
          onMeasureDraftChange={onMeasureDraftChange ?? (() => {})}
          onMeasureFinished={onMeasureFinished ?? (() => {})}
          finishMeasureSignal={finishMeasureSignal}
          clearMeasureSignal={clearMeasureSignal}
        />
      ) : null}
      {mapInstance && enableGisChrome ? (
        <WorkspaceMapDrawBidangController
          map={mapInstance}
          active={toolMode === "draw-bidang"}
          snapEnabled={drawBidangSnapEnabled}
          snapFootprints={drawSnapFootprints}
          onDraftChange={onDrawBidangDraftChange ?? (() => {})}
          onRingClosed={onDrawRingClosed ?? (() => {})}
          closeRingSignal={closeDrawRingSignal}
          undoPointSignal={undoDrawPointSignal}
          clearDrawSignal={clearDrawSignal}
        />
      ) : null}
      {mapInstance && enableGisChrome ? (
        <WorkspaceMapDrawLineController
          map={mapInstance}
          active={toolMode === "draw-garis"}
          snapEnabled={drawGarisSnapEnabled}
          snapFootprints={drawSnapFootprints}
          onDraftChange={onDrawLineDraftChange ?? (() => {})}
          onLineFinished={onDrawLineFinished ?? (() => {})}
          finishLineSignal={finishDrawLineSignal}
          undoPointSignal={undoDrawPointSignal}
          clearDrawSignal={clearDrawSignal}
        />
      ) : null}
      {mapInstance && enableGisChrome ? (
        <WorkspaceMapMoveGeomController
          map={mapInstance}
          active={toolMode === "move-geom"}
          footprints={moveGeomFootprints}
          snapEnabled={moveGeomSnapEnabled}
          snapFootprints={moveGeomSnapFootprints}
          selection={moveGeomSelection}
          editSubMode={moveGeomEditSubMode}
          deltaLat={moveGeomDeltaLat}
          deltaLng={moveGeomDeltaLng}
          rotationDeg={moveGeomRotationDeg}
          rotationPivotVertexIndex={moveGeomRotationPivotVertexIndex}
          vertexEdits={moveGeomVertexEdits}
          rotationSupported={moveGeomRotationSupported}
          vertexEditSupported={moveGeomVertexEditSupported}
          onSelect={onMoveGeomSelect ?? (() => {})}
          onDeltaChange={(dLat, dLng) =>
            onMoveGeomDeltaChange?.(dLat, dLng)
          }
          onRotationChange={(deg) => onMoveGeomRotationChange?.(deg)}
          onRotationPivotChange={(index) =>
            onMoveGeomRotationPivotChange?.(index)
          }
          onVertexEditChange={(index, lat, lng) =>
            onMoveGeomVertexEditChange?.(index, lat, lng)
          }
          onDragStart={onMoveGeomDragStart}
          onDragEnd={onMoveGeomDragEnd}
        />
      ) : null}
      {mapInstance && enableGisChrome ? (
        <WorkspaceMapRelationTraceLayer
          map={mapInstance}
          segments={relationTraceSegments}
          enabled={showRelationTrace}
        />
      ) : null}
    </div>
  );
});
