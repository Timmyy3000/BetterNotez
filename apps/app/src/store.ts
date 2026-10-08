import { create } from "zustand";

interface AppState {
  /** Bumped after every library write. Library queries depend on it and reload. */
  readonly revision: number;
  readonly libraryChanged: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  revision: 0,
  libraryChanged: () => set((state) => ({ revision: state.revision + 1 })),
}));

export function notifyLibraryChanged(): void {
  useAppStore.getState().libraryChanged();
}
