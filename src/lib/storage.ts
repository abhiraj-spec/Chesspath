/**
 * Asks the browser to keep ChessPath's data (IndexedDB) instead of deleting it when space runs low.
 * Chrome and Edge decide silently (installed or frequently used sites usually qualify); Firefox may ask;
 * Safari keeps data for Home Screen apps but can clear a website's data after about 7 days without a visit.
 */
export type StorageProtection = "protected" | "not-protected" | "unsupported";

export async function storageProtection(): Promise<StorageProtection> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) return "unsupported";
  try {
    return (await navigator.storage.persisted()) ? "protected" : "not-protected";
  } catch {
    return "unsupported";
  }
}

export async function requestStorageProtection(): Promise<StorageProtection> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return "unsupported";
  try {
    if (await navigator.storage.persisted()) return "protected";
    return (await navigator.storage.persist()) ? "protected" : "not-protected";
  } catch {
    return "unsupported";
  }
}
