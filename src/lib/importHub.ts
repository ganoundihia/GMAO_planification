/**
 * Shared import-hub storage (IndexedDB), ported 1:1 from the legacy
 * "Centre d'Import" static page. Schema (db name, store name, record
 * shape) is unchanged on purpose: the legacy Ingénierie tools that are
 * not yet ported (Analyse MBF/RAM/Rapport Journalier/Suivi des
 * Performances, served from /legacy/departements/ingenierie/*.html) read
 * these same IndexedDB records directly. They share this app's origin,
 * so IndexedDB access works across the React/legacy boundary — but only
 * as long as this schema stays identical. Do not rename the db/store or
 * change the record shape without updating the legacy pages too.
 */
export const IMPORT_DB_NAME = 'setram-import-hub';
const IMPORT_STORE = 'slots';

export interface PackedFile {
  name: string;
  type: string;
  lastModified: number;
  size: number;
  data: ArrayBuffer;
}

export interface ImportSlotRecord {
  slotId: string;
  files: PackedFile[];
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IMPORT_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IMPORT_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function packFiles(files: File[]): Promise<PackedFile[]> {
  return Promise.all(
    files.map(async (f) => ({
      name: f.name,
      type: f.type,
      lastModified: f.lastModified,
      size: f.size,
      data: await f.arrayBuffer(),
    })),
  );
}

export async function importSlotGet(slotId: string): Promise<ImportSlotRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMPORT_STORE, 'readonly');
    const r = tx.objectStore(IMPORT_STORE).get(slotId);
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => reject(r.error);
  });
}

export async function importSlotPut(record: ImportSlotRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMPORT_STORE, 'readwrite');
    tx.objectStore(IMPORT_STORE).put(record, record.slotId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function importSlotClear(slotId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMPORT_STORE, 'readwrite');
    tx.objectStore(IMPORT_STORE).delete(slotId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Adds files to a slot — replaces the record for single-file slots, appends for multi-file slots. */
export async function importSlotAddFiles(slotId: string, incoming: File[], multi: boolean): Promise<void> {
  if (!incoming.length) return;
  if (multi) {
    const existing = await importSlotGet(slotId);
    const prevFiles = existing ? existing.files : [];
    const packedNew = await packFiles(incoming);
    await importSlotPut({ slotId, files: [...prevFiles, ...packedNew], savedAt: new Date().toISOString() });
  } else {
    const packed = await packFiles([incoming[0]]);
    await importSlotPut({ slotId, files: packed, savedAt: new Date().toISOString() });
  }
}

export async function importSlotRemoveFile(slotId: string, index: number): Promise<void> {
  const record = await importSlotGet(slotId);
  if (!record) return;
  record.files.splice(index, 1);
  if (record.files.length) {
    await importSlotPut(record);
  } else {
    await importSlotClear(slotId);
  }
}

/** Deletes the whole shared import hub — same behavior as the portal's "always blank on open" reset. */
export function importHubResetOnLoad(): void {
  try {
    const req = indexedDB.deleteDatabase(IMPORT_DB_NAME);
    req.onerror = () => {};
  } catch {
    /* never block app startup */
  }
}

export function formatFileSize(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}
