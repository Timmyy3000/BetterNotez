import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { isDesktop } from "./platform";

/**
 * Saves a PDF the student asked for. The desktop app shows a save dialog and writes the bytes to
 * the chosen path. The web app downloads the file. Cancelling the dialog saves nothing.
 */
export async function savePdf(bytes: Uint8Array, name: string): Promise<void> {
  if (isDesktop()) {
    const path = await save({ defaultPath: name, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (path === null) return;
    await writeFile(path, bytes);
    return;
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
