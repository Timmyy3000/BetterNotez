import { Library } from "@betternotez/core";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { errorMessage } from "./lib/errors";
import { isDesktop } from "./lib/platform";
import { createStorage } from "./storage";
import { watchLibraryFolder } from "./storage/watch";
import { notifyLibraryChanged, useAppStore } from "./store";

const EXTERNAL_POLL_MS = 3000;

/**
 * Reloads library reads while the calling page is open, so changes made outside the app (for
 * example by an AI through MCP) show up. Reloads on window focus. On the web, and on the desktop
 * when the folder cannot be watched, it also reloads every few seconds while the page is visible.
 */
export function useLibraryRefresh(): void {
  const watching = useAppStore((state) => state.watching);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") notifyLibraryChanged();
    };
    const timer = watching ? undefined : window.setInterval(refresh, EXTERNAL_POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [watching]);
}

let opened: Promise<Library> | undefined;

/** Opens the library once per page load. Remounts and StrictMode reuse the same instance. */
function openLibrary(): Promise<Library> {
  opened ??= createStorage().then(async (storage) => {
    const library = new Library(storage);
    await library.init();
    return library;
  });
  return opened;
}

const LibraryContext = createContext<Library | undefined>(undefined);

export function LibraryProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<{ library?: Library; error?: unknown }>({});
  const opened = state.library !== undefined;

  useEffect(() => {
    let mounted = true;
    openLibrary().then(
      (library) => {
        if (mounted) setState({ library });
      },
      (error: unknown) => {
        if (mounted) setState({ error });
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!opened || !isDesktop()) return;
    let active = true;
    let stopWatching: (() => void) | undefined;
    watchLibraryFolder(notifyLibraryChanged).then(
      (unwatch) => {
        if (!active) {
          unwatch();
          return;
        }
        stopWatching = unwatch;
        useAppStore.getState().setWatching(true);
      },
      (error: unknown) => {
        // Without a watcher the pages fall back to polling, so the library still updates.
        console.warn("The library folder could not be watched.", error);
      },
    );
    return () => {
      active = false;
      stopWatching?.();
      useAppStore.getState().setWatching(false);
    };
  }, [opened]);

  if (state.error !== undefined) {
    return (
      <div className="grid h-dvh place-items-center p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold">BetterNotez could not open your library</h1>
          <p className="mt-2 text-sm text-muted-foreground">{errorMessage(state.error)}</p>
        </div>
      </div>
    );
  }
  if (state.library === undefined) {
    return <div className="grid h-dvh place-items-center text-sm text-muted-foreground">Opening your library…</div>;
  }
  return <LibraryContext value={state.library}>{children}</LibraryContext>;
}

export function useLibrary(): Library {
  const library = useContext(LibraryContext);
  if (library === undefined) {
    throw new Error("useLibrary must be used inside LibraryProvider");
  }
  return library;
}

export interface LibraryQuery<T> {
  readonly data?: T;
  readonly error?: unknown;
}

/**
 * Runs a read against the library and runs it again after every write. The previous data stays
 * on screen while the next read is in flight.
 */
export function useLibraryQuery<T>(
  read: (library: Library) => Promise<T>,
  deps: readonly unknown[] = [],
): LibraryQuery<T> {
  const library = useLibrary();
  const revision = useAppStore((state) => state.revision);
  const [result, setResult] = useState<LibraryQuery<T>>({});

  useEffect(() => {
    let current = true;
    // `read` is a new closure on every render, so the caller's deps decide when to read again.
    read(library).then(
      (data) => {
        if (current) setResult({ data });
      },
      (error: unknown) => {
        if (current) setResult({ error });
      },
    );
    return () => {
      current = false;
    };
  }, [library, revision, ...deps]);

  return result;
}
