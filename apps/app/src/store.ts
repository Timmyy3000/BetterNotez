import { create } from "zustand";

interface AppState {
  /** Bumped after every library write, and when the desktop watcher sees a change. Library queries depend on it and reload. */
  readonly revision: number;
  /** True while the desktop app watches the library folder. Pages then skip their polling. */
  readonly watching: boolean;
  readonly libraryChanged: () => void;
  readonly setWatching: (watching: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  revision: 0,
  watching: false,
  libraryChanged: () => set((state) => ({ revision: state.revision + 1 })),
  setWatching: (watching) => set({ watching }),
}));

export function notifyLibraryChanged(): void {
  useAppStore.getState().libraryChanged();
}
