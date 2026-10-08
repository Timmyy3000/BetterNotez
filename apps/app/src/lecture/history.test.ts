import { AnnotationId, type Annotation } from "@betternotez/core";
import { describe, expect, it } from "vitest";
import { applyStep, EMPTY_HISTORY, invertStep, pushStep, takeRedo, takeUndo, type Step } from "./history";

function note(id: string, text: string): Annotation {
  return {
    id: AnnotationId.parse(id),
    kind: "text",
    page: 1,
    author: "user",
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.1,
    text,
    fontSize: 12,
    color: "#000000",
  };
}

const first = note("01NOTEAAAAAAAAAAAAAAAAAAA", "first");
const second = note("01NOTEBBBBBBBBBBBBBBBBBBB", "second");

describe("applyStep", () => {
  it("adds a new annotation at the end", () => {
    expect(applyStep([first], [{ type: "put", next: second }])).toEqual([first, second]);
  });

  it("replaces an annotation with the same id in place", () => {
    const edited = { ...first, text: "edited" };
    expect(applyStep([first, second], [{ type: "put", next: edited, prev: first }])).toEqual([edited, second]);
  });

  it("removes a deleted annotation and keeps the rest", () => {
    expect(applyStep([first, second], [{ type: "delete", prev: first }])).toEqual([second]);
  });
});

describe("undo and redo", () => {
  it("undoes a new annotation by removing it, and redo puts it back", () => {
    const history = pushStep(EMPTY_HISTORY, [{ type: "put", next: first }]);

    const undone = takeUndo(history);
    expect(undone && applyStep([first], undone.run)).toEqual([]);

    const redone = undone && takeRedo(undone.history);
    expect(redone && applyStep([], redone.run)).toEqual([first]);
  });

  it("undoes an edit by restoring the version before it", () => {
    const edited = { ...first, text: "edited" };
    const history = pushStep(EMPTY_HISTORY, [{ type: "put", next: edited, prev: first }]);

    const undone = takeUndo(history);
    expect(undone && applyStep([edited], undone.run)).toEqual([first]);
  });

  it("undoes a deletion by restoring the annotation under its own id", () => {
    const history = pushStep(EMPTY_HISTORY, [{ type: "delete", prev: first }]);

    const undone = takeUndo(history);
    expect(undone && applyStep([second], undone.run)).toEqual([second, first]);
  });

  it("undoes a whole step at once, last command first", () => {
    const step: Step = [
      { type: "put", next: first },
      { type: "put", next: second },
    ];
    const undone = takeUndo(pushStep(EMPTY_HISTORY, step));
    expect(undone && applyStep([first, second], undone.run)).toEqual([]);
  });

  it("has nothing to undo or redo on an empty history", () => {
    expect(takeUndo(EMPTY_HISTORY)).toBeUndefined();
    expect(takeRedo(EMPTY_HISTORY)).toBeUndefined();
  });

  it("drops the redo steps when a new change is recorded after an undo", () => {
    const afterUndo = takeUndo(pushStep(EMPTY_HISTORY, [{ type: "put", next: first }]));
    const recorded = afterUndo && pushStep(afterUndo.history, [{ type: "put", next: second }]);

    expect(recorded?.future).toEqual([]);
    expect(recorded?.past).toHaveLength(1);
  });

  it("inverts a deletion into a put of the same annotation", () => {
    expect(invertStep([{ type: "delete", prev: first }])).toEqual([{ type: "put", next: first }]);
  });
});
