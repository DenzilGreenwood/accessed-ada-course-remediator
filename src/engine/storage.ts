import type { CoursePackage } from '../types';

const DB_NAME = 'accessed_workspace_db';
const STORE_NAME = 'workspaces';
const ACTIVE_KEY = 'active_course_v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveWorkspaceToDb(pkg: CoursePackage): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(
        { savedAt: Date.now(), course: pkg },
        ACTIVE_KEY
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Gracefully ignore in private browsing or test environments without IndexedDB
  }
}

export async function loadWorkspaceFromDb(): Promise<{
  savedAt: number;
  course: CoursePackage;
} | null> {
  try {
    const db = await openDb();
    const record = await new Promise<{ savedAt: number; course: CoursePackage } | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(ACTIVE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }
    );
    db.close();
    return record;
  } catch {
    return null;
  }
}

export async function clearWorkspaceFromDb(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(ACTIVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

interface SerializedWorkspaceFile {
  format: 'accessed-workspace';
  version: 1;
  savedAt: string;
  course: Omit<CoursePackage, 'zipArrayBuffer'> & {
    zipBase64?: string;
  };
}

/** Exports the entire active workspace as a portable .accessed project file */
export function exportWorkspaceFile(pkg: CoursePackage): Blob {
  const { zipArrayBuffer, ...rest } = pkg;
  const payload: SerializedWorkspaceFile = {
    format: 'accessed-workspace',
    version: 1,
    savedAt: new Date().toISOString(),
    course: {
      ...rest,
      zipBase64: zipArrayBuffer ? arrayBufferToBase64(zipArrayBuffer) : undefined,
    },
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
}

/** Imports a previously saved .accessed workspace file */
export async function importWorkspaceFile(file: File): Promise<CoursePackage> {
  const text = await file.text();
  const parsed = JSON.parse(text) as SerializedWorkspaceFile;
  if (parsed?.format !== 'accessed-workspace' || !parsed.course?.pages) {
    throw new Error('This file is not a valid AccessEd (.accessed) workspace file.');
  }
  const { zipBase64, ...rest } = parsed.course;
  return {
    ...rest,
    zipArrayBuffer: zipBase64 ? base64ToArrayBuffer(zipBase64) : undefined,
  };
}
