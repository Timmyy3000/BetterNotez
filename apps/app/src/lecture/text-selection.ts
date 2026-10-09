import { mergeLineRects, type PageRect } from "@betternotez/core";
import { useEffect, useState } from "react";
import { pageRectOf, type TextPiece } from "./highlight";

/** What a selection covers on the pages. `complete` is false when it reaches a page whose text is not laid out. */
export interface TextSelection {
  readonly pieces: readonly TextPiece[];
  readonly complete: boolean;
}

/**
 * The text the student has selected on the pages, while the select tool is on. A drag is read when
 * the pointer lifts, so the popover does not follow the pointer. A selection made from the keyboard
 * is read once it settles.
 */
export function usePendingText(enabled: boolean): TextSelection | undefined {
  const [selection, setSelection] = useState<TextSelection>();

  useEffect(() => {
    if (!enabled) return;
    let dragging = false;
    let frame = 0;

    function read() {
      frame = 0;
      const found = readTextSelection(document.getSelection());
      // An incomplete reading has no pieces, but it stays, so the editor can say why nothing is offered.
      const next = found.complete && found.pieces.length === 0 ? undefined : found;
      // A selection that only moves within the same text reads the same, so the editor is not re-rendered for it.
      setSelection((previous) => (sameSelection(previous, next) ? previous : next));
    }
    function settle() {
      if (!dragging && frame === 0) frame = requestAnimationFrame(read);
    }
    function press() {
      dragging = true;
    }
    function release() {
      dragging = false;
      settle();
    }

    document.addEventListener("selectionchange", settle);
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    return () => {
      document.removeEventListener("selectionchange", settle);
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      cancelAnimationFrame(frame);
      setSelection(undefined);
    };
  }, [enabled]);

  return enabled ? selection : undefined;
}

/**
 * Reads what a selection covers on each page. Each run of text in a page's text layer is clipped to
 * the selection, so a selection that starts or ends mid-run takes only the letters it covers. A page the
 * selection reaches whose text is not laid out would be missing from the highlight, so the reading is
 * marked incomplete and offers no pieces. Nothing partial is stored.
 */
export function readTextSelection(selection: Selection | null): TextSelection {
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return { pieces: [], complete: true };
  const range = selection.getRangeAt(0);
  const pieces: TextPiece[] = [];

  for (const section of document.querySelectorAll<HTMLElement>("section[data-page-number]")) {
    if (!range.intersectsNode(section)) continue;
    if (section.querySelector<HTMLElement>(".textLayer")?.dataset.laidOut !== "true") return { pieces: [], complete: false };
    const pageBox = section.getBoundingClientRect();
    const boxes = [];
    let text = "";
    let lineTop: number | undefined;

    for (const span of section.querySelectorAll<HTMLElement>(".textLayer span")) {
      const node = span.firstChild;
      if (!(node instanceof Text) || !range.intersectsNode(node)) continue;
      const part = clipToRange(range, node);
      if (part === undefined) continue;

      const spanBox = span.getBoundingClientRect();
      // A run on a new line of the page reads as a space, not as the end of the previous word.
      if (lineTop !== undefined && Math.abs(spanBox.top - lineTop) > spanBox.height / 2) text += " ";
      lineTop = spanBox.top;
      text += part.toString();
      for (const box of part.getClientRects()) {
        const rect = pageRectOf(box, pageBox);
        if (rect !== undefined) boxes.push(rect);
      }
    }

    const rects = mergeLineRects(boxes);
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (rects.length > 0 && cleaned !== "") {
      pieces.push({ page: Number(section.dataset.pageNumber), rects, text: cleaned });
    }
  }
  return { pieces, complete: true };
}

/** Whether two readings of a selection hold the same text in the same places, and are both complete or both not. */
export function sameSelection(a: TextSelection | undefined, b: TextSelection | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.complete === b.complete && sameTextPieces(a.pieces, b.pieces);
}

/** Whether two readings of a selection hold the same text in the same places. */
export function sameTextPieces(a: readonly TextPiece[] | undefined, b: readonly TextPiece[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((piece, index) => samePiece(piece, b[index]));
}

function samePiece(a: TextPiece, b: TextPiece | undefined): boolean {
  return (
    b !== undefined &&
    a.page === b.page &&
    a.text === b.text &&
    a.rects.length === b.rects.length &&
    a.rects.every((rect, index) => sameRect(rect, b.rects[index]))
  );
}

function sameRect(a: PageRect, b: PageRect | undefined): boolean {
  return b !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** The part of a text node that the range covers, or undefined when the range covers none of it. */
function clipToRange(range: Range, node: Text): Range | undefined {
  const part = document.createRange();
  part.selectNodeContents(node);
  if (range.comparePoint(node, 0) === -1) part.setStart(range.startContainer, range.startOffset);
  if (range.comparePoint(node, node.length) === 1) part.setEnd(range.endContainer, range.endOffset);
  return part.collapsed ? undefined : part;
}
