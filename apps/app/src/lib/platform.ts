/** The desktop app runs inside Tauri, which adds its internals to the window. The web app does not have them. */
export function isDesktop(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
