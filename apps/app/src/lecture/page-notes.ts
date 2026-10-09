import { type Library, type PageNote, UnreadableNotesError } from "@betternotez/core";

/** How long typing rests before it is saved. Turning to another page saves at once instead. */
export const SAVE_DELAY_MS = 500;

/** A failed save is tried again after this long. Each further failure waits twice as long, up to RETRY_MAX_MS. */
export const RETRY_FIRST_MS = 1_000;
export const RETRY_MAX_MS = 30_000;

export type NoteStatus = "loading" | "saved" | "saving" | "failed" | "unreadable";

/** The part of the library the notes need. */
export type NoteStore = Pick<Library, "listPageNotes" | "setPageNote">;

export interface NotesSnapshot {
  /** True once the notes have been read and can be edited. It is false while loading and when they cannot be read. */
  readonly ready: boolean;
  readonly status: NoteStatus;
  /** The text of each page, including typing that is not saved yet. A page with no note is absent or empty. */
  readonly texts: ReadonlyMap<number, string>;
}

/**
 * The page the notes panel shows. While the notes field has focus, it stays on the page where focus began, so
 * scrolling the PDF does not move the text being typed to another page.
 */
export function notesPageFor(viewPage: number, focusedPage: number | undefined): number {
  return focusedPage ?? viewPage;
}

/** The text that counts as a note. Spaces and line breaks alone are no note. */
function noteText(text: string | undefined): string {
  const value = text ?? "";
  return value.trim() === "" ? "" : value;
}

/**
 * The notes of one material while it is open. Every page keeps its own text here, so turning the page never loses
 * what was typed: unsaved text stays in memory until it is written.
 *
 * - An edit is saved SAVE_DELAY_MS later. flush() saves now. The view flushes when the page in view changes.
 * - A refresh reads the notes back, so an assistant's edits show up. It never replaces a page with unsaved text.
 * - Saves run one after another, so an older save cannot land after a newer one.
 * - A failed save keeps the text in memory and is tried again with a growing wait. retry() tries at once.
 * - Notes that cannot be read are never shown as empty and are never written over. The text typed stays in memory.
 */
export class PageNoteBook {
  private readonly store: NoteStore;
  private readonly lectureId: string;
  private readonly texts = new Map<number, string>();
  /** The text last confirmed on disk, page by page. A page is unsaved while its text differs from this. */
  private readonly saved = new Map<number, string>();
  private readonly listeners = new Set<() => void>();
  private snapshot: NotesSnapshot = { ready: false, status: "loading", texts: new Map() };
  /** True once a read has succeeded. */
  private read = false;
  private unreadable = false;
  private failed = false;
  /** Counts edits and completed saves. A refresh that started before a change does not apply what it read. */
  private changes = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryWait = RETRY_FIRST_MS;
  private queue: Promise<void> = Promise.resolve();

  constructor(store: NoteStore, lectureId: string) {
    this.store = store;
    this.lectureId = lectureId;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): NotesSnapshot => this.snapshot;

  /** Whether this book holds the notes of this material in this library. */
  isFor(store: NoteStore, lectureId: string): boolean {
    return this.store === store && this.lectureId === lectureId;
  }

  /** Whether some typed text has not been saved yet. */
  hasUnsaved(): boolean {
    return this.unsavedPages().length > 0;
  }

  edit(page: number, text: string): void {
    this.texts.set(page, text);
    this.failed = false;
    this.changes += 1;
    this.schedule();
    this.publish();
  }

  /** Saves every page with unsaved text now. It waits for any save already running. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const run = this.queue.then(() => this.write());
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Tries again now: reads the notes if they have not been read yet, and otherwise saves the unsaved text. */
  retry(): Promise<void> {
    if (!this.read) return this.refresh();
    this.retryWait = RETRY_FIRST_MS;
    return this.flush();
  }

  /** Reads the notes from the library. A page with unsaved text keeps what the reader typed. */
  refresh(): Promise<void> {
    const startedAt = this.changes;
    return this.store.listPageNotes(this.lectureId).then(
      (notes) => this.adopt(notes, startedAt),
      (error: unknown) => {
        // A notes file that cannot be read is reported as such. Any other read that fails before the first success is
        // reported as a failed load, and is tried again by retry() or the next refresh.
        if (error instanceof UnreadableNotesError) {
          this.unreadable = true;
        } else if (!this.read) {
          this.failed = true;
        }
        this.publish();
      },
    );
  }

  private adopt(notes: readonly PageNote[], startedAt: number): void {
    // An edit or a save landed while the read was in flight, so what it read may be older than memory.
    if (this.changes !== startedAt) return;
    this.unreadable = false;
    if (!this.read) this.failed = false;
    const onDisk = new Map(notes.map(({ page, text }) => [page, text] as const));
    for (const page of new Set([...this.texts.keys(), ...onDisk.keys()])) {
      if (this.unsaved(page)) continue;
      const text = onDisk.get(page) ?? "";
      this.texts.set(page, text);
      this.saved.set(page, text);
    }
    this.read = true;
    this.publish();
  }

  private async write(): Promise<void> {
    const pending = this.unsavedPages();
    if (pending.length === 0) {
      this.retryWait = RETRY_FIRST_MS;
      return;
    }
    // A retry shows as saving again, and a failure is reported only if this attempt fails too.
    this.failed = false;
    this.publish();
    for (const [page, text] of pending) {
      try {
        await this.store.setPageNote(this.lectureId, page, text);
      } catch (error) {
        if (error instanceof UnreadableNotesError) {
          // Trying again cannot help until the file is repaired, so no retry is scheduled. The text stays in memory.
          this.unreadable = true;
        } else {
          this.failed = true;
          this.retryLater();
        }
        this.publish();
        return;
      }
      this.saved.set(page, noteText(text));
      this.changes += 1;
    }
    this.retryWait = RETRY_FIRST_MS;
    this.publish();
  }

  private retryLater(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.flush(), this.retryWait);
    this.retryWait = Math.min(this.retryWait * 2, RETRY_MAX_MS);
  }

  private unsaved(page: number): boolean {
    return noteText(this.texts.get(page)) !== (this.saved.get(page) ?? "");
  }

  private unsavedPages(): [number, string][] {
    return [...this.texts].filter(([page]) => this.unsaved(page));
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  private status(): NoteStatus {
    if (this.unreadable) return "unreadable";
    if (!this.read) return this.failed ? "failed" : "loading";
    if (this.failed) return "failed";
    return this.hasUnsaved() ? "saving" : "saved";
  }

  private publish(): void {
    this.snapshot = {
      ready: this.read && !this.unreadable,
      status: this.status(),
      texts: new Map(this.texts),
    };
    for (const listener of this.listeners) listener();
  }
}

/**
 * The books of every material opened this session. A book is kept when its material closes, not dropped, so typed
 * text that has not been saved yet is still there, and is written, when the material is opened again.
 */
const books = new Set<PageNoteBook>();

/** The book of one material. It is the same book each time, so unsaved text is found again. */
export function notesFor(store: NoteStore, lectureId: string): PageNoteBook {
  for (const book of books) {
    if (book.isFor(store, lectureId)) return book;
  }
  const book = new PageNoteBook(store, lectureId);
  books.add(book);
  return book;
}

/** Writes the unsaved text of every material now. Used when the app is hidden or closed. */
export function flushAllNotes(): Promise<void> {
  return Promise.all([...books].map((book) => book.flush())).then(() => undefined);
}

/** Whether any material has typed text that is not saved yet. */
export function hasUnsavedNotes(): boolean {
  return [...books].some((book) => book.hasUnsaved());
}
