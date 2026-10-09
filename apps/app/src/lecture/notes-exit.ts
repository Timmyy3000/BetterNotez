import { isDesktop } from "../lib/platform";
import { flushAllNotes, hasUnsavedNotes } from "./page-notes";

/**
 * Keeps typed notes from being lost when the page is hidden or left. Unsaved text is written when the page becomes
 * hidden and on pagehide. On the web, leaving with unsaved text asks first. Call once, at startup.
 *
 * The desktop window's close request is not intercepted. Doing so needs the window destroy permission and a change to
 * the close path, and neither has been run in a desktop build. On the desktop the webview's own hidden and pagehide
 * events are the only chance to write, so text typed just before a close can be lost.
 */
export function guardNotesOnExit(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushAllNotes();
  });
  window.addEventListener("pagehide", () => void flushAllNotes());

  if (isDesktop()) return;
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedNotes()) return;
    event.preventDefault();
    event.returnValue = "";
  });
}
