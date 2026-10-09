import type { Highlight, PageRect } from "@betternotez/core";

/**
 * How much of the page shows through a highlight. The freehand highlighter uses the same value, so a
 * drawn highlight and a text highlight read as one marker.
 */
export const HIGHLIGHT_OPACITY = 0.35;

/** Room a popover needs above its anchor. Closer to the top of a page, it opens below instead. */
const POPOVER_ROOM_PX = 56;

/** The text one page holds of a selection, boxed in page fractions, ready to become a highlight. */
export interface TextPiece {
  readonly page: number;
  readonly rects: readonly PageRect[];
  readonly text: string;
}

/** Where a popover points: the middle of a box's top edge, and the box's bottom edge, as page fractions. */
export interface Anchor {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

/** A box on screen, as getBoundingClientRect reports one. */
export type ScreenBox = Pick<DOMRect, "left" | "top" | "right" | "bottom">;

/** The part of a screen box that lies on a page, as fractions of the page. Undefined when none of it does. */
export function pageRectOf(box: ScreenBox, page: ScreenBox): PageRect | undefined {
  const pageWidth = page.right - page.left;
  const pageHeight = page.bottom - page.top;
  const left = clamp01((box.left - page.left) / pageWidth);
  const right = clamp01((box.right - page.left) / pageWidth);
  const top = clamp01((box.top - page.top) / pageHeight);
  const bottom = clamp01((box.bottom - page.top) / pageHeight);
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : undefined;
}

/** The anchor for a popover over a set of boxes: the centre of their top edge, and their bottom edge. */
export function anchorOf(rects: readonly PageRect[]): Anchor {
  const left = Math.min(...rects.map((rect) => rect.x));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const top = Math.min(...rects.map((rect) => rect.y));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: (left + right) / 2, top, bottom };
}

/** Whether a popover for this anchor should open below the text, because the page leaves no room above it. */
export function popoverBelow(anchor: Anchor, pageHeight: number): boolean {
  return anchor.top * pageHeight < POPOVER_ROOM_PX;
}

/** The highlight under a point of the page. The one drawn last is on top, so it is the one a click means. */
export function highlightAt(highlights: readonly Highlight[], u: number, v: number): Highlight | undefined {
  return [...highlights].reverse().find((highlight) => highlight.rects.some((rect) => holds(rect, u, v)));
}

function holds(rect: PageRect, u: number, v: number): boolean {
  return u >= rect.x && u <= rect.x + rect.width && v >= rect.y && v <= rect.y + rect.height;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
