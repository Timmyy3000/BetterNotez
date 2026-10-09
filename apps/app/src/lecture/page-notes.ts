import type { Library, PageNote } from "@betternotez/core";

/** How long typing rests before it is saved. Turning to another page saves at once instead. */
export const SAVE_DELAY_MS = 500;

export type NoteStatus = "saved" | "saving" | "failed";

/** The part of the library the notes need. */
export type NoteStore = Pick<Library, "listPageNotes" | "setPageNote">;

export interface NotesSnapshot {
  /** False until the notes have been read once. The field stays disabled until then. */
  readonly ready: boolean;
  readonly status: NoteStatus;
  /** The text of each page, including typing that is not saved yet. A page with no note is absent or empty. */
  readonly texts: ReadonlyMap<number, string>;
}

/**
 * The notes of one material while it is open. Every page keeps its own text here, so turning the page never loses
 * what was typed: unsaved text stays in memory until it is written.
 *
 * - An edit is saved SAVE_DELAY_MS later. flush() saves now. The view flushes when the page in view changes.
 * - A refresh reads the notes back, so an assistant's edits show up. It never replaces a page with unsaved text.
 * - Saves run one after another, so an older save cannot land after a newer one.
 * - A failed save keeps the text in memory. The next edit or page change tries again.
 */
export class PageNoteBook {
  private readonly store: NoteStore;
  private readonly lectureId: string;
  private readonly texts = new Map<number, string>();
  /** The text last confirmed on disk, page by page. A page is unsaved while its text differs from this. */
  private readonly saved = new Map<number, string>();
  private readonly listeners = new Set<() => void>();
  private snapshot: NotesSnapshot = { ready: false, status: "saved", texts: new Map() };
  private ready = false;
  private failed = false;
  /** Counts edits and completed saves. A refresh that started before a change does not apply what it read. */
  private changes = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
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
    const run = this.queue.then(() => this.write());
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Reads the notes from the library. A page with unsaved text keeps what the reader typed. */
  refresh(): Promise<void> {
    const startedAt = this.changes;
    return this.store.listPageNotes(this.lectureId).then(
      (notes) => this.adopt(notes, startedAt),
      () => {
        if (!this.ready) {
          this.failed = true;
          this.publish();
        }
      },
    );
  }

  private adopt(notes: readonly PageNote[], startedAt: number): void {
    // An edit or a save landed while the read was in flight, so what it read may be older than memory.
    if (this.changes !== startedAt) return;
    const onDisk = new Map(notes.map(({ page, text }) => [page, text] as const));
    for (const page of new Set([...this.texts.keys(), ...onDisk.keys()])) {
      if (this.unsaved(page)) continue;
      const text = onDisk.get(page) ?? "";
      this.texts.set(page, text);
      this.saved.set(page, text);
    }
    // A failed first read is not a failed save. Only a save can be left unsaved, and that needs the notes read first.
    if (!this.ready) this.failed = false;
    this.ready = true;
    this.publish();
  }

  private async write(): Promise<void> {
    const pending = this.unsavedPages();
    if (pending.length === 0) return;
    // A retry shows as saving again, and a failure is reported only if this attempt fails too.
    this.failed = false;
    this.publish();
    for (const [page, text] of pending) {
      try {
        await this.store.setPageNote(this.lectureId, page, text);
      } catch {
        this.failed = true;
        this.publish();
        return;
      }
      this.saved.set(page, text);
      this.changes += 1;
    }
    this.publish();
  }

  private unsaved(page: number): boolean {
    return (this.texts.get(page) ?? "") !== (this.saved.get(page) ?? "");
  }

  private unsavedPages(): [number, string][] {
    return [...this.texts].filter(([page]) => this.unsaved(page));
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  private status(): NoteStatus {
    if (this.failed) return "failed";
    return this.unsavedPages().length > 0 ? "saving" : "saved";
  }

  private publish(): void {
    this.snapshot = { ready: this.ready, status: this.status(), texts: new Map(this.texts) };
    for (const listener of this.listeners) listener();
  }
}
