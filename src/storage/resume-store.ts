import type { ResumeMetadata } from "../domain/types";

const DATABASE = "localapply-documents-v1";
const STORE = "documents";

interface StoredDocument {
  metadata: ResumeMetadata;
  bytes: ArrayBuffer;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "metadata.id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open document database"));
  });
}

export async function putResume(metadata: ResumeMetadata, bytes: ArrayBuffer): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ metadata, bytes } satisfies StoredDocument);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save resume"));
  });
  database.close();
}

export async function getResume(id: string): Promise<StoredDocument | undefined> {
  const database = await openDatabase();
  const result = await new Promise<StoredDocument | undefined>((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result as StoredDocument | undefined);
    request.onerror = () => reject(request.error ?? new Error("Unable to read resume"));
  });
  database.close();
  return result;
}

export async function deleteResume(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to delete resume"));
  });
  database.close();
}

export async function clearResumeStore(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear resume storage"));
  });
  database.close();
}

export async function digestFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
