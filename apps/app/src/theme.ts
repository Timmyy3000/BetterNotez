import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";

/** What the person chose. System follows the operating system between light and dark. */
export type ThemePreference = "system" | "light" | "dark" | "warm";
/** What is on screen. Warm is only ever chosen explicitly, never by the operating system. */
export type ResolvedTheme = "light" | "dark" | "warm";

/** The inline script in index.html reads this key before first paint. Keep the two in step. */
export const THEME_STORAGE_KEY = "betternotez.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** A missing or unknown value means warm, the look the app is designed around. */
export function parsePreference(stored: string | null): ThemePreference {
  return stored === "system" || stored === "light" || stored === "dark" || stored === "warm" ? stored : "warm";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** Sonner only knows light and dark, so both dark appearances use its dark styling. */
export function toasterTheme(theme: ResolvedTheme): "light" | "dark" {
  return theme === "light" ? "light" : "dark";
}

interface ThemeState {
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  preference: parsePreference(readStored()),
  setPreference(preference) {
    writeStored(preference);
    set({ preference });
  },
}));

/** Sets `data-theme` on <html> to the theme on screen, and returns it. "system" follows the operating system. */
export function useAppTheme(): ResolvedTheme {
  const preference = useThemeStore((state) => state.preference);
  const systemPrefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDarkNow);
  const resolved = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  return resolved;
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function systemPrefersDarkNow(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be blocked. The choice then lasts only until the page reloads.
  }
}
