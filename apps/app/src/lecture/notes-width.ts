/** The notes panel's width in CSS pixels. It is remembered across lectures. */
export const NOTES_WIDTH_STORAGE_KEY = "betternotez.notesWidth";
export const NOTES_DEFAULT_WIDTH = 340;
export const NOTES_MIN_WIDTH = 280;
/** Notes take at most this share of the lecture area, which is the window less the rail. */
const NOTES_MAX_SHARE = 0.6;
/** The PDF keeps at least this much width, however wide the notes are. */
export const PDF_MIN_WIDTH = 360;
/** How far an arrow key moves the notes edge. */
export const NOTES_KEY_STEP = 16;

export interface NotesWidthBounds {
  readonly min: number;
  readonly max: number;
}

/** Resizing needs room for the narrowest notes beside the narrowest PDF. Below that the panel keeps its default width. */
export function notesCanResize(areaWidth: number): boolean {
  return areaWidth >= NOTES_MIN_WIDTH + PDF_MIN_WIDTH;
}

/** The narrowest and widest the notes can be in a lecture area of this width. The minimum wins when the area is tiny. */
export function notesWidthBounds(areaWidth: number): NotesWidthBounds {
  const max = Math.floor(Math.min(areaWidth * NOTES_MAX_SHARE, areaWidth - PDF_MIN_WIDTH));
  return { min: NOTES_MIN_WIDTH, max: Math.max(NOTES_MIN_WIDTH, max) };
}

export function clampNotesWidth(width: number, bounds: NotesWidthBounds): number {
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
}

/** A missing, malformed, or non-positive value means no stored width. */
export function parseNotesWidth(stored: string | null): number | undefined {
  if (stored === null) return undefined;
  const width = Number(stored);
  return Number.isFinite(width) && width > 0 ? width : undefined;
}

export function readNotesWidth(): number | undefined {
  try {
    return parseNotesWidth(localStorage.getItem(NOTES_WIDTH_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export function writeNotesWidth(width: number): void {
  try {
    localStorage.setItem(NOTES_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Storage can be blocked. The width then lasts only until the page reloads.
  }
}
