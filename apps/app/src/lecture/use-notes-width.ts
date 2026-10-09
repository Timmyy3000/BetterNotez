import { useLayoutEffect, useState, type RefObject } from "react";
import {
  clampNotesWidth,
  NOTES_DEFAULT_WIDTH,
  notesCanResize,
  notesWidthBounds,
  readNotesWidth,
  writeNotesWidth,
  type NotesWidthBounds,
} from "./notes-width";

/**
 * The notes panel's width, held within the room the lecture area has. The reader's choice is kept even when the
 * area is too narrow to show it, so a window that grows back returns the notes to the width the reader chose.
 */
export function useNotesWidth(areaRef: RefObject<HTMLElement | null>): {
  /** The width to draw the notes at. The default when the area is too narrow to resize. */
  readonly width: number;
  /** The limits of a resize, or undefined when the area is too narrow to offer one. */
  readonly bounds: NotesWidthBounds | undefined;
  /** Sets the width while the reader is still changing it. */
  readonly resize: (width: number) => void;
  /** Stores the width once the reader has finished changing it. */
  readonly commit: (width: number) => void;
} {
  // Read during the first render, so the panel opens at the stored width without a flash.
  const [chosen, setChosen] = useState(() => readNotesWidth() ?? NOTES_DEFAULT_WIDTH);
  const [area, setArea] = useState(0);

  // Measured before paint, so the panel never shows a width that is about to change.
  useLayoutEffect(() => {
    const element = areaRef.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => setArea(element.clientWidth));
    observer.observe(element);
    setArea(element.clientWidth);
    return () => observer.disconnect();
  }, [areaRef]);

  const bounds = notesCanResize(area) ? notesWidthBounds(area) : undefined;
  const width = bounds === undefined ? NOTES_DEFAULT_WIDTH : clampNotesWidth(chosen, bounds);
  return { width, bounds, resize: setChosen, commit: writeNotesWidth };
}
