import { Library, MemoryStorage } from "@betternotez/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageNoteBook, SAVE_DELAY_MS, type NoteStore } from "./page-notes";

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
