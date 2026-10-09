import { mergeLineRects } from "@betternotez/core";
import { useEffect, useState } from "react";
import { pageRectOf, type TextPiece } from "./highlight";

/**
 * The text the student has selected on the pages, while the select tool is on. A drag is read when
 * the pointer lifts, so the popover does not follow the pointer. A selection made from the keyboard
 * is read once it settles.
 */
export function usePendingText(enabled: boolean): readonly TextPiece[] | undefined {
  const [pieces, setPieces] = useState<readonly TextPiece[]>();

  useEffect(() => {
    if (!enabled) return;
    let dragging = false;
    let frame = 0;

    function read() {
      frame = 0;
      const found = readTextPieces(document.getSelection());
      setPieces(found.length > 0 ? found : undefined);
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
      setPieces(undefined);
    };
  }, [enabled]);

  return enabled ? pieces : undefined;
}

/**
 * Reads what a selection covers on each page. Each run of text in a page's text layer is clipped to
 * the selection, so a selection that starts or ends mid-run takes only the letters it covers.
 */
export function readTextPieces(selection: Selection | null): TextPiece[] {
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  const pieces: TextPiece[] = [];

  for (const section of document.querySelectorAll<HTMLElement>("section[data-page-number]")) {
    if (!range.intersectsNode(section)) continue;
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
  return pieces;
}

/** The part of a text node that the range covers, or undefined when the range covers none of it. */
function clipToRange(range: Range, node: Text): Range | undefined {
  const part = document.createRange();
  part.selectNodeContents(node);
  if (range.comparePoint(node, 0) === -1) part.setStart(range.startContainer, range.startOffset);
  if (range.comparePoint(node, node.length) === 1) part.setEnd(range.endContainer, range.endOffset);
  return part.collapsed ? undefined : part;
}
