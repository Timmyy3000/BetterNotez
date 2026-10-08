import type { Storage } from "@betternotez/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { isDesktop } from "../lib/platform";
import { IndexedDbStorage } from "./indexeddb";
import { TauriFsStorage } from "./tauri";

const LIBRARY_FOLDER = "BetterNotez Library";

/** The library folder on this computer, or undefined on the web, where the library lives in the browser. */
export async function libraryFolder(): Promise<string | undefined> {
  if (!isDesktop()) return undefined;
  return join(await homeDir(), LIBRARY_FOLDER);
}

/** The desktop app keeps the library in a folder on disk. The web app keeps it in IndexedDB. */
export async function createStorage(): Promise<Storage> {
  const folder = await libraryFolder();
  return folder === undefined ? new IndexedDbStorage() : new TauriFsStorage(folder);
}
