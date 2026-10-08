import { useEffect, useRef } from "react";

const REFRESH_MS = 3000;

/**
 * Runs `refresh` now, every few seconds while the page is visible, and whenever the window
 * regains focus. External writes, such as an AI assistant's edits on disk, show up this way.
 */
export function useRefreshWhileVisible(refresh: () => Promise<void> | void): void {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") void latest.current();
    };
    run();
    const timer = window.setInterval(run, REFRESH_MS);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, []);
}
