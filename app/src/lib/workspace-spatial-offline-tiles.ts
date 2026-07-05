import type { WorkspaceBasemapId } from "@/lib/workspace-map-basemaps";
import { getWorkspaceBasemap } from "@/lib/workspace-map-basemaps";

const OFFLINE_PREFS_KEY_PREFIX = "spatial-pm-offline-v1:";
const DB_NAME = "spatial-pm-offline-tiles-v1";
const STORE_NAME = "tiles";
const DB_VERSION = 1;

export type OfflineTileBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type OfflineTilePack = {
  id: string;
  name: string;
  basemapId: WorkspaceBasemapId;
  bounds: OfflineTileBounds;
  minZoom: number;
  maxZoom: number;
  createdAt: number;
  tileCount: number;
};

export type OfflineTilePrefs = {
  offlineMode: boolean;
  packs: OfflineTilePack[];
};

const DEFAULT_OFFLINE_PREFS: OfflineTilePrefs = {
  offlineMode: false,
  packs: [],
};

function prefsKey(projectId: string): string {
  return `${OFFLINE_PREFS_KEY_PREFIX}${projectId}`;
}

function tileKey(basemapId: string, z: number, x: number, y: number): string {
  return `${basemapId}/${z}/${x}/${y}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export function loadOfflineTilePrefs(projectId: string): OfflineTilePrefs {
  if (typeof window === "undefined" || !projectId) {
    return { ...DEFAULT_OFFLINE_PREFS, packs: [] };
  }
  try {
    const raw = localStorage.getItem(prefsKey(projectId));
    if (!raw) return { ...DEFAULT_OFFLINE_PREFS, packs: [] };
    const parsed = JSON.parse(raw) as Partial<OfflineTilePrefs>;
    const packs = Array.isArray(parsed.packs)
      ? parsed.packs.filter(
          (p) =>
            p &&
            typeof p === "object" &&
            typeof p.id === "string" &&
            typeof p.name === "string"
        )
      : [];
    return {
      offlineMode: parsed.offlineMode === true,
      packs: packs as OfflineTilePack[],
    };
  } catch {
    return { ...DEFAULT_OFFLINE_PREFS, packs: [] };
  }
}

export function saveOfflineTilePrefs(
  projectId: string,
  prefs: OfflineTilePrefs
): void {
  if (typeof window === "undefined" || !projectId) return;
  try {
    localStorage.setItem(prefsKey(projectId), JSON.stringify(prefs));
  } catch {
    /* quota */
  }
}

export function createOfflinePackId(): string {
  return `pack_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function getOfflineTileBlob(
  basemapId: string,
  z: number,
  x: number,
  y: number
): Promise<Blob | null> {
  const db = await openDb();
  const key = tileKey(basemapId, z, x, y);
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed"));
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      const v = req.result;
      resolve(v instanceof Blob ? v : null);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB get failed"));
  });
  db.close();
  return blob;
}

export async function saveOfflineTileBlob(
  basemapId: string,
  z: number,
  x: number,
  y: number,
  blob: Blob
): Promise<void> {
  const db = await openDb();
  const key = tileKey(basemapId, z, x, y);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.objectStore(STORE_NAME).put(blob, key);
  });
  db.close();
}

export async function deleteOfflineTilesForPack(
  pack: OfflineTilePack
): Promise<void> {
  const coords = listTileCoordsInBounds(
    pack.bounds,
    pack.minZoom,
    pack.maxZoom
  );
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    const store = tx.objectStore(STORE_NAME);
    for (const c of coords) {
      store.delete(tileKey(pack.basemapId, c.z, c.x, c.y));
    }
  });
  db.close();
}

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

export function listTileCoordsInBounds(
  bounds: OfflineTileBounds,
  minZoom: number,
  maxZoom: number
): { z: number; x: number; y: number }[] {
  const coords: { z: number; x: number; y: number }[] = [];
  const zMin = Math.min(minZoom, maxZoom);
  const zMax = Math.max(minZoom, maxZoom);
  for (let z = zMin; z <= zMax; z++) {
    const xMin = lonToTileX(bounds.west, z);
    const xMax = lonToTileX(bounds.east, z);
    const yMin = latToTileY(bounds.north, z);
    const yMax = latToTileY(bounds.south, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        coords.push({ z, x, y });
      }
    }
  }
  return coords;
}

function resolveTileUrl(
  template: string,
  z: number,
  x: number,
  y: number
): string {
  return template
    .replace(/\{z\}/g, String(z))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y))
    .replace(/\{s\}/g, "a");
}

export async function downloadOfflineTilePack(params: {
  basemapId: WorkspaceBasemapId;
  bounds: OfflineTileBounds;
  minZoom: number;
  maxZoom: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<{ tileCount: number; failed: number }> {
  const basemap = getWorkspaceBasemap(params.basemapId);
  const coords = listTileCoordsInBounds(
    params.bounds,
    params.minZoom,
    params.maxZoom
  );
  let done = 0;
  let failed = 0;

  for (const c of coords) {
    if (params.signal?.aborted) break;
    const url = resolveTileUrl(basemap.url, c.z, c.x, c.y);
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      await saveOfflineTileBlob(params.basemapId, c.z, c.x, c.y, blob);
    } catch {
      failed += 1;
    }
    done += 1;
    params.onProgress?.(done, coords.length);
  }

  return { tileCount: done - failed, failed };
}

export function countTilesInBounds(
  bounds: OfflineTileBounds,
  minZoom: number,
  maxZoom: number
): number {
  return listTileCoordsInBounds(bounds, minZoom, maxZoom).length;
}

export function offlineBoundsFromMapView(view: {
  lat: number;
  lng: number;
  zoom: number;
}): OfflineTileBounds {
  const span = 360 / Math.pow(2, view.zoom);
  const latSpan = span * 0.55;
  const lngSpan = span * 0.75;
  return {
    north: Math.min(85, view.lat + latSpan / 2),
    south: Math.max(-85, view.lat - latSpan / 2),
    east: view.lng + lngSpan / 2,
    west: view.lng - lngSpan / 2,
  };
}
