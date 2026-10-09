import { Library, MemoryStorage, UnreadableNotesError } from "@betternotez/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushAllNotes,
  notesFor,
  notesPageFor,
  PageNoteBook,
  RETRY_FIRST_MS,
  SAVE_DELAY_MS,
  type NoteStore,
} from "./page-notes";

const PDF = new TextEncoder().encode("%PDF-1.7\nslides\n%%EOF\n");

async function openMaterial(pageCount = 3) {
  const storage = new MemoryStorage();
  const library = new Library(storage);
  await library.init();
  const subject = await library.createSubject({ name: "Digital Systems" });
  const lecture = await library.importLecture(subject.id, "Lecture 1", PDF, pageCount);
  return { storage, library, lectureId: lecture.id, subjectId: subject.id };
}

/** A store whose reads and writes go to the library, with a hook to fail or hold them. */
function storeOver(library: Library, hooks: Partial<NoteStore> = {}): NoteStore {
  return {
    listPageNotes: (lectureId) => library.listPageNotes(lectureId),
    setPageNote: (lectureId, page, text) => library.setPageNote(lectureId, page, text),
    ...hooks,
  };
}

describe("PageNoteBook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows each page's own note, and a page with no note reads as empty", async () => {
    const { library, lectureId } = await openMaterial();
    await library.setPageNote(lectureId, 1, "Page one");
    await library.setPageNote(lectureId, 3, "Page three");
    const book = new PageNoteBook(storeOver(library), lectureId);

    await book.refresh();

    const { ready, texts } = book.getSnapshot();
    expect(ready).toBe(true);
    expect(texts.get(1)).toBe("Page one");
    expect(texts.get(2) ?? "").toBe("");
    expect(texts.get(3)).toBe("Page three");
  });

  it("reads a note saved before per-page notes as page 1", async () => {
    const { storage, library, lectureId, subjectId } = await openMaterial();
    await storage.writeText(`subjects/${subjectId}/lectures/${lectureId}/notes.md`, "Old single note");
    const book = new PageNoteBook(storeOver(library), lectureId);

    await book.refresh();

    expect(book.getSnapshot().texts.get(1)).toBe("Old single note");
  });

  it("saves a page's text after the pause, and not before", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);
    await book.refresh();

    book.edit(2, "Later");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(await library.getPageNote(lectureId, 2)).toBe("");

    await vi.advanceTimersByTimeAsync(1);
    await book.flush();
    expect(await library.getPageNote(lectureId, 2)).toBe("Later");
  });

  it("saves the text at once when flushed, without waiting for the pause", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);
    await book.refresh();

    book.edit(1, "Turning the page now");
    await book.flush();

    expect(await library.getPageNote(lectureId, 1)).toBe("Turning the page now");
    expect(book.getSnapshot().status).toBe("saved");
  });

  it("keeps each page's typing in memory while another page is in view", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);
    await book.refresh();

    book.edit(1, "Page one, typed");
    await book.flush();
    book.edit(2, "Page two, typed");

    expect(book.getSnapshot().texts.get(1)).toBe("Page one, typed");
    expect(book.getSnapshot().texts.get(2)).toBe("Page two, typed");
    await book.flush();
    expect(await library.listPageNotes(lectureId)).toEqual([
      { page: 1, text: "Page one, typed" },
      { page: 2, text: "Page two, typed" },
    ]);
  });

  it("reports saving while typing waits to be written, and saved once it is", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);
    await book.refresh();

    book.edit(1, "x");
    expect(book.getSnapshot().status).toBe("saving");

    await book.flush();
    expect(book.getSnapshot().status).toBe("saved");
  });

  it("does not replace a page with unsaved typing when the notes are read again", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);
    await book.refresh();

    book.edit(1, "Still typing");
    await library.setPageNote(lectureId, 1, "Written by the assistant");
    await book.refresh();

    expect(book.getSnapshot().texts.get(1)).toBe("Still typing");
  });

  it("shows a change made outside the app on a page with no unsaved text", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);
    await book.refresh();

    await library.setPageNote(lectureId, 2, "Written by the assistant");
    await book.refresh();
    expect(book.getSnapshot().texts.get(2)).toBe("Written by the assistant");

    await library.setPageNote(lectureId, 2, "");
    await book.refresh();
    expect(book.getSnapshot().texts.get(2)).toBe("");
  });

  it("does not apply a read that a save overtook, so the saved text is not undone", async () => {
    const { library, lectureId } = await openMaterial();
    await library.setPageNote(lectureId, 1, "Before");
    let holdReads = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const book = new PageNoteBook(
      storeOver(library, {
        listPageNotes: async (id) => {
          const notes = await library.listPageNotes(id);
          // The read sees "Before", then waits. The edit and save below land while it waits.
          if (holdReads) await held;
          return notes;
        },
      }),
      lectureId,
    );
    await book.refresh();

    holdReads = true;
    const reading = book.refresh();
    book.edit(1, "After");
    await book.flush();
    release();
    await reading;

    expect(book.getSnapshot().texts.get(1)).toBe("After");
    expect(await library.getPageNote(lectureId, 1)).toBe("After");
  });

  it("keeps the typed text and shows Couldn't save when a save fails, then saves on the next try", async () => {
    const { library, lectureId } = await openMaterial();
    let failing = true;
    const book = new PageNoteBook(
      storeOver(library, {
        setPageNote: (id, page, text) =>
          failing ? Promise.reject(new Error("disk full")) : library.setPageNote(id, page, text),
      }),
      lectureId,
    );
    await book.refresh();

    book.edit(1, "Must not be lost");
    await book.flush();
    expect(book.getSnapshot().status).toBe("failed");
    expect(book.getSnapshot().texts.get(1)).toBe("Must not be lost");

    failing = false;
    book.edit(1, "Must not be lost, saved");
    await book.flush();
    expect(book.getSnapshot().status).toBe("saved");
    expect(await library.getPageNote(lectureId, 1)).toBe("Must not be lost, saved");
  });

  it("stays unready and reports a failure when the first read fails, then recovers", async () => {
    const { library, lectureId } = await openMaterial();
    let failing = true;
    const book = new PageNoteBook(
      storeOver(library, {
        listPageNotes: (id) => (failing ? Promise.reject(new Error("unreadable")) : library.listPageNotes(id)),
      }),
      lectureId,
    );

    await book.refresh();
    expect(book.getSnapshot()).toMatchObject({ ready: false, status: "failed" });

    failing = false;
    await book.refresh();
    expect(book.getSnapshot()).toMatchObject({ ready: true, status: "saved" });
  });

  it("is loading until the notes are read, so it does not say Saved first", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);

    expect(book.getSnapshot()).toMatchObject({ ready: false, status: "loading" });

    await book.refresh();
    expect(book.getSnapshot()).toMatchObject({ ready: true, status: "saved" });
  });

  it("never saves a page of only spaces and line breaks, and counts it as no note", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);
    await book.refresh();

    book.edit(2, "  \n\t ");
    expect(book.hasUnsaved()).toBe(false);
    expect(book.getSnapshot().status).toBe("saved");

    await book.flush();
    expect(await library.listPageNotes(lectureId)).toEqual([]);
  });

  it("retries a failed save with a growing wait, and stops once it lands", async () => {
    const { library, lectureId } = await openMaterial();
    let attempts = 0;
    let failing = true;
    const book = new PageNoteBook(
      storeOver(library, {
        setPageNote: (id, page, text) => {
          attempts += 1;
          return failing ? Promise.reject(new Error("disk full")) : library.setPageNote(id, page, text);
        },
      }),
      lectureId,
    );
    await book.refresh();

    book.edit(1, "Keep me");
    await book.flush();
    expect(attempts).toBe(1);
    expect(book.getSnapshot().status).toBe("failed");

    await vi.advanceTimersByTimeAsync(RETRY_FIRST_MS);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(RETRY_FIRST_MS * 2);
    expect(attempts).toBe(3);

    failing = false;
    await vi.advanceTimersByTimeAsync(RETRY_FIRST_MS * 4);
    expect(attempts).toBe(4);
    expect(book.getSnapshot().status).toBe("saved");
    expect(await library.getPageNote(lectureId, 1)).toBe("Keep me");

    await vi.advanceTimersByTimeAsync(RETRY_FIRST_MS * 100);
    expect(attempts).toBe(4);
  });

  it("tries a failed save at once when asked to retry", async () => {
    const { library, lectureId } = await openMaterial();
    let attempts = 0;
    let failing = true;
    const book = new PageNoteBook(
      storeOver(library, {
        setPageNote: (id, page, text) => {
          attempts += 1;
          return failing ? Promise.reject(new Error("disk full")) : library.setPageNote(id, page, text);
        },
      }),
      lectureId,
    );
    await book.refresh();
    book.edit(1, "Retry me");
    await book.flush();

    failing = false;
    await book.retry();

    expect(attempts).toBe(2);
    expect(book.getSnapshot().status).toBe("saved");
    expect(await library.getPageNote(lectureId, 1)).toBe("Retry me");
  });

  it("keeps unsaved text in the material's book, so it is there when the material is opened again", async () => {
    const { library, lectureId } = await openMaterial();
    const store = storeOver(library, {
      setPageNote: () => Promise.reject(new Error("disk full")),
    });
    const first = notesFor(store, lectureId);
    await first.refresh();
    first.edit(1, "Typed, not saved");
    await first.flush();

    const reopened = notesFor(store, lectureId);
    expect(reopened).toBe(first);
    expect(reopened.getSnapshot().texts.get(1)).toBe("Typed, not saved");
    expect(reopened.getSnapshot().status).toBe("failed");
  });

  it("writes every material's unsaved text when flushed for leaving the app", async () => {
    const { library, lectureId } = await openMaterial();
    const book = notesFor(storeOver(library), lectureId);
    await book.refresh();
    book.edit(3, "Written on the way out");

    await flushAllNotes();

    expect(await library.getPageNote(lectureId, 3)).toBe("Written on the way out");
    expect(book.hasUnsaved()).toBe(false);
  });

  it("reports a notes file that cannot be read, and never writes over it", async () => {
    const { storage, library, lectureId, subjectId } = await openMaterial();
    const notesPath = `subjects/${subjectId}/lectures/${lectureId}/notes.json`;
    await storage.writeText(notesPath, "{ not json");
    let attempts = 0;
    const book = new PageNoteBook(
      storeOver(library, {
        setPageNote: (id, page, text) => {
          attempts += 1;
          return library.setPageNote(id, page, text);
        },
      }),
      lectureId,
    );

    await book.refresh();
    expect(book.getSnapshot()).toMatchObject({ ready: false, status: "unreadable" });

    book.edit(1, "Typed into a file that cannot be read");
    await book.flush();
    await vi.advanceTimersByTimeAsync(RETRY_FIRST_MS * 100);

    expect(book.getSnapshot()).toMatchObject({ ready: false, status: "unreadable" });
    expect(attempts).toBe(1);
    expect(await storage.readText(notesPath)).toBe("{ not json");
  });

  it("reports a notes file that a newer version wrote during the session, and stops retrying", async () => {
    const { storage, library, lectureId, subjectId } = await openMaterial();
    const notesPath = `subjects/${subjectId}/lectures/${lectureId}/notes.json`;
    let attempts = 0;
    const book = new PageNoteBook(
      storeOver(library, {
        setPageNote: (id, page, text) => {
          attempts += 1;
          return library.setPageNote(id, page, text);
        },
      }),
      lectureId,
    );
    await book.refresh();
    book.edit(1, "Typed before the file changed");

    const newer = JSON.stringify({ version: 2, pages: {} });
    await storage.writeText(notesPath, newer);
    await book.flush();
    await vi.advanceTimersByTimeAsync(RETRY_FIRST_MS * 100);

    expect(book.getSnapshot().status).toBe("unreadable");
    expect(attempts).toBe(1);
    expect(await storage.readText(notesPath)).toBe(newer);
  });

  it("keeps the notes on the page where focus began while the view moves to another page", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);
    await book.refresh();

    // The field gains focus on page 2. The PDF then scrolls to page 3, and typing carries on.
    const focusedPage = 2;
    const viewPage = 3;
    book.edit(notesPageFor(viewPage, focusedPage), "Typed while scrolling");
    book.edit(notesPageFor(viewPage, focusedPage), "Typed while scrolling, more");

    expect(book.getSnapshot().texts.get(2)).toBe("Typed while scrolling, more");
    expect(book.getSnapshot().texts.get(3)).toBeUndefined();
    // Once focus leaves the field, the panel shows the page in view again.
    expect(notesPageFor(viewPage, undefined)).toBe(3);
  });

  it("tells subscribers when the notes change", async () => {
    const { library, lectureId } = await openMaterial();
    const book = new PageNoteBook(storeOver(library), lectureId);
    const listener = vi.fn();
    const unsubscribe = book.subscribe(listener);

    book.edit(1, "hello");
    expect(listener).toHaveBeenCalled();

    const calls = listener.mock.calls.length;
    unsubscribe();
    book.edit(1, "hello again");
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
