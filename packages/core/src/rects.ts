import type { PageRect } from "./model.js";

/**
 * Joins the boxes that sit on one line of text, so a selection made of many text runs becomes one
 * box per line. Two boxes share a line when they overlap vertically by at least half the shorter
 * height and the gap between them is no wider than that height. Columns and separate lines stay apart.
 */
export function mergeLineRects(rects: readonly PageRect[]): PageRect[] {
  // Left to right, so each run meets the line it continues. Sorting by top first can split a line
  // whose runs sit a fraction of a line apart vertically.
  const lines: PageRect[] = [];
  for (const rect of rects.filter((box) => box.height > 0).sort((a, b) => a.x - b.x)) {
    const index = lines.findIndex((line) => sameLine(line, rect));
    if (index === -1) {
      lines.push(rect);
    } else {
      lines[index] = union(lines[index] as PageRect, rect);
    }
  }
  return lines.sort((a, b) => a.y - b.y || a.x - b.x);
}

function sameLine(a: PageRect, b: PageRect): boolean {
  const height = Math.min(a.height, b.height);
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const gap = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  return overlap >= height / 2 && gap <= height;
}

function union(a: PageRect, b: PageRect): PageRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
