const DB_NAME = "spatial-pm-geojson-v1";
const STORE_NAME = "geojson";
const DB_VERSION = 1;

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

export async function saveGeoJsonBlob(
  key: string,
  data: GeoJSON.GeoJsonObject
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.objectStore(STORE_NAME).put(data, key);
  });
  db.close();
}

export async function loadGeoJsonBlob(
  key: string
): Promise<GeoJSON.GeoJsonObject | null> {
  const db = await openDb();
  const value = await new Promise<GeoJSON.GeoJsonObject | null>(
    (resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed"));
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v && typeof v === "object" ? (v as GeoJSON.GeoJsonObject) : null);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB get failed"));
    }
  );
  db.close();
  return value;
}

export async function deleteGeoJsonBlob(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    tx.objectStore(STORE_NAME).delete(key);
  });
  db.close();
}

export function createGeoJsonStoreKey(layerId: string): string {
  return `geojson:${layerId}`;
}

export function parseGeoJsonFileText(text: string): GeoJSON.GeoJsonObject {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Bukan objek GeoJSON valid.");
  }
  const type = (parsed as { type?: string }).type;
  if (
    type !== "Feature" &&
    type !== "FeatureCollection" &&
    type !== "GeometryCollection" &&
    type !== "Point" &&
    type !== "MultiPoint" &&
    type !== "LineString" &&
    type !== "MultiLineString" &&
    type !== "Polygon" &&
    type !== "MultiPolygon"
  ) {
    throw new Error("Tipe GeoJSON tidak dikenali.");
  }
  return parsed as GeoJSON.GeoJsonObject;
}
