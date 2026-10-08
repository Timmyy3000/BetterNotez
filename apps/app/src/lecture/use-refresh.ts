import { useEffect, useRef } from "react";
import { useAppStore } from "../store";

const REFRESH_MS = 3000;

/**
 * Runs `refresh` now, whenever the library changes, and whenever the window regains focus. On the
 * web, and on the desktop when the folder cannot be watched, it also runs every few seconds while
 * the page is visible. External writes, such as an AI assistant's edits on disk, show up this way.
 */
export function useRefreshWhileVisible(refresh: () => Promise<void> | void): void {
  const latest = useRef(refresh);
  const revision = useAppStore((state) => state.revision);
  const watching = useAppStore((state) => state.watching);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    void latest.current();
  }, [revision]);

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") void latest.current();
    };
    const timer = watching ? undefined : window.setInterval(run, REFRESH_MS);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, [watching]);
}
