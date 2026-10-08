import { watch } from "@tauri-apps/plugin-fs";
import { libraryFolder } from "./index";

const DEBOUNCE_MS = 300;

/**
 * Calls `onChange` when anything in the library folder changes on disk, including edits an AI
 * assistant makes through MCP. Bursts of changes within 300 ms are reported once. Resolves to a
 * function that stops watching.
 */
export async function watchLibraryFolder(onChange: () => void): Promise<() => void> {
  const folder = await libraryFolder();
  if (folder === undefined) {
    throw new Error("Only the desktop app can watch the library folder.");
  }
  return watch(folder, onChange, { recursive: true, delayMs: DEBOUNCE_MS });
}
