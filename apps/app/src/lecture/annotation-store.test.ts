import { AnnotationId, Library, MemoryStorage, type TextBox } from "@betternotez/core";
import { describe, expect, it, vi } from "vitest";
import { commitTextEdit, createAnnotationStore, restyleTextBox, type AnnotationStore } from "./annotation-store";
import type { EditSession } from "./editor";

const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");

async function openStore(): Promise<{ store: AnnotationStore; library: Library; lectureId: string }> {
  const library = new Library(new MemoryStorage());
  await library.init();
  const subject = await library.createSubject({ name: "Sample subject" });
  const lecture = await library.importLecture(subject.id, "Sample material", PDF, 2);
  return { store: createAnnotationStore(library, lecture.id, []), library, lectureId: lecture.id };
}

function box(id: string, overrides: Partial<TextBox> = {}): TextBox {
  return {
    id: AnnotationId.parse(id),
    kind: "text",
    page: 1,
    author: "user",
    x: 0.1,
    y: 0.1,
    width: 0.3,
    height: 0.1,
    text: "Draft",
    color: "#2b4b78",
    ...overrides,
  };
}

/** Waits until every write has reached the library, then reads what is stored. */
async function settled(store: AnnotationStore, library: Library, lectureId: string) {
  await vi.waitFor(() => expect(store.getState().pending).toBe(0));
  return library.listAnnotations(lectureId);
}

function textOf(store: AnnotationStore, id: string): TextBox {
  const found = store.getState().annotations.find((annotation) => annotation.id === id);
  if (found?.kind !== "text") throw new Error(`no text box ${id}`);
  return found;
}

describe("restyleTextBox outside an edit", () => {
  it("makes a style change one undo step, and undo and redo bring it back and forth", async () => {
    const { store, library, lectureId } = await openStore();
    const original = box("01STYLEONE000000000000000A");
    store.getState().apply([{ type: "put", next: original }]);

    restyleTextBox(store, original.id, { bold: true });
    expect(textOf(store, original.id)).toMatchObject({ bold: true });
    expect(store.getState().history.past).toHaveLength(1);

    store.getState().undo();
    expect(textOf(store, original.id)).toEqual(original);
    await expect(settled(store, library, lectureId)).resolves.toEqual([original]);

    store.getState().redo();
    expect(textOf(store, original.id)).toMatchObject({ bold: true });
  });

  it("keeps each change as its own step, so undo steps back through them one at a time", async () => {
    const { store } = await openStore();
    const original = box("01STYLETWO000000000000000A");
    store.getState().apply([{ type: "put", next: original }]);

    restyleTextBox(store, original.id, { fontSize: 24 });
    restyleTextBox(store, original.id, { underline: true });
    restyleTextBox(store, original.id, { color: "#a3321f" });

    store.getState().undo();
    expect(textOf(store, original.id)).toMatchObject({ fontSize: 24, underline: true, color: "#2b4b78" });
    store.getState().undo();
    expect(textOf(store, original.id)).toMatchObject({ fontSize: 24 });
    expect(textOf(store, original.id)).not.toHaveProperty("underline");
    store.getState().undo();
    expect(textOf(store, original.id)).toEqual(original);
  });

  it("records nothing when the change leaves the box as it was", async () => {
    const { store } = await openStore();
    const original = box("01STYLETHREE00000000000000");
    store.getState().apply([{ type: "put", next: original }]);

    restyleTextBox(store, original.id, { color: "#2b4b78" });

    expect(store.getState().history.past).toHaveLength(0);
  });
});

describe("restyleTextBox during a typing session", () => {
  it("splits the session at a style change, so undo reverts the style and then the text typed before it", async () => {
    const { store, library, lectureId } = await openStore();
    const before = box("01MIDEDITONE00000000000000", { text: "Draft" });
    store.getState().apply([{ type: "put", next: before }]);
    let session: EditSession | undefined = { id: before.id, before };

    // Type "Draft two", then turn bold on, then type " more".
    store.getState().preview([{ type: "put", next: { ...before, text: "Draft two" } }]);
    session = restyleTextBox(store, before.id, { bold: true }, session);
    store.getState().preview([{ type: "put", next: { ...textOf(store, before.id), text: "Draft two more" } }]);
    commitTextEdit(store, session as EditSession);

    expect(textOf(store, before.id)).toMatchObject({ text: "Draft two more", bold: true });
    // Three steps: the text before the style, the style, and the text after it.
    expect(store.getState().history.past).toHaveLength(3);

    store.getState().undo();
    expect(textOf(store, before.id)).toMatchObject({ text: "Draft two", bold: true });
    store.getState().undo();
    expect(textOf(store, before.id)).toMatchObject({ text: "Draft two" });
    expect(textOf(store, before.id)).not.toHaveProperty("bold");
    store.getState().undo();
    expect(textOf(store, before.id)).toEqual(before);
    await expect(settled(store, library, lectureId)).resolves.toEqual([before]);
  });

  it("carries the session on from the changed box, so the next commit records only the new text", async () => {
    const { store } = await openStore();
    const before = box("01MIDEDITTWO00000000000000", { text: "Draft" });
    store.getState().apply([{ type: "put", next: before }]);
    const session = restyleTextBox(store, before.id, { italic: false }, { id: before.id, before });

    expect(session?.before).toMatchObject({ italic: false });
    expect(store.getState().history.past).toHaveLength(1);
  });

  it("makes a new box's first text one undo step, then its style, then the text typed after it", async () => {
    const { store } = await openStore();
    const fresh = box("01MIDEDITTHREE0000000000000", { text: "" });
    store.getState().preview([{ type: "put", next: fresh }]);
    let session: EditSession | undefined = { id: fresh.id };

    store.getState().preview([{ type: "put", next: { ...fresh, text: "New" } }]);
    session = restyleTextBox(store, fresh.id, { bold: true }, session);
    store.getState().preview([{ type: "put", next: { ...textOf(store, fresh.id), text: "New box" } }]);
    commitTextEdit(store, session as EditSession);

    expect(store.getState().history.past).toHaveLength(3);
    store.getState().undo();
    expect(textOf(store, fresh.id)).toMatchObject({ text: "New", bold: true });
    store.getState().undo();
    expect(textOf(store, fresh.id)).toMatchObject({ text: "New" });
    expect(textOf(store, fresh.id)).not.toHaveProperty("bold");
    store.getState().undo();
    expect(store.getState().annotations.some((annotation) => annotation.id === fresh.id)).toBe(false);
  });

  it("holds a style change on a box with no text until the box is kept, so the box is not written empty", async () => {
    const { store, library, lectureId } = await openStore();
    const fresh = box("01MIDEDITFOUR0000000000000", { text: "" });
    store.getState().preview([{ type: "put", next: fresh }]);
    const session: EditSession = { id: fresh.id };

    const carried = restyleTextBox(store, fresh.id, { bold: true, fontSize: 24 }, session);
    expect(carried).toBe(session);
    expect(store.getState().history.past).toHaveLength(0);
    await expect(library.listAnnotations(lectureId)).resolves.toEqual([]);

    store.getState().preview([{ type: "put", next: { ...textOf(store, fresh.id), text: "Typed" } }]);
    commitTextEdit(store, session);

    expect(store.getState().history.past).toHaveLength(1);
    await expect(settled(store, library, lectureId)).resolves.toEqual([
      expect.objectContaining({ id: fresh.id, text: "Typed", bold: true, fontSize: 24 }),
    ]);
  });

  it("ignores a change to a box that is not in the store", async () => {
    const { store } = await openStore();
    const session = restyleTextBox(store, "01MISSINGBOX0000000000000", { bold: true }, undefined);

    expect(session).toBeUndefined();
    expect(store.getState().history.past).toHaveLength(0);
  });
});
