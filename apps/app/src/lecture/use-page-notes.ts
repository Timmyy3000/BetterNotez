import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useLibrary } from "../library";
import { PageNoteBook, type NoteStatus } from "./page-notes";
import { useRefreshWhileVisible } from "./use-refresh";

export interface PageNotesView {
  /** False until the notes have been read once. */
  readonly ready: boolean;
  readonly status: NoteStatus;
  /** The note on a page, including typing that is not saved yet. */
  readonly textOf: (page: number) => string;
  /** The pages that have a note, for the marks in the PDF. */
  readonly noted: ReadonlySet<number>;
  readonly edit: (page: number, text: string) => void;
}

/**
 * The notes of a material, one per page. They stay loaded while the material is open, so the panel and the page
 * marks can show any page at once. Turning to another page saves the text on the page being left.
 */
export function usePageNotes(lectureId: string, page: number): PageNotesView {
  const library = useLibrary();
  const book = useMemo(() => new PageNoteBook(library, lectureId), [library, lectureId]);
  const snapshot = useSyncExternalStore(book.subscribe, book.getSnapshot);

  useRefreshWhileVisible(() => book.refresh());
  // The cleanup runs when the page in view changes, and when the material closes, so unsaved text is written then.
  useEffect(() => () => void book.flush(), [book, page]);

  const noted = useMemo(() => {
    const pages = [...snapshot.texts].filter(([, text]) => text.trim() !== "").map(([number]) => number);
    return new Set(pages);
  }, [snapshot.texts]);

  return {
    ready: snapshot.ready,
    status: snapshot.status,
    textOf: (number) => snapshot.texts.get(number) ?? "",
    noted,
    edit: (number, text) => book.edit(number, text),
  };
}
