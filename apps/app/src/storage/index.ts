import type { Storage } from "@betternotez/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { IndexedDbStorage } from "./indexeddb";
import { TauriFsStorage } from "./tauri";

/** The desktop app keeps the library in a folder on disk. The web app keeps it in IndexedDB. */
export async function createStorage(): Promise<Storage> {
  if ("__TAURI_INTERNALS__" in window) {
    return new TauriFsStorage(await join(await homeDir(), "BetterNotez Library"));
  }
  return new IndexedDbStorage();
}
