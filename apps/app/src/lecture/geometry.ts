export type Rotation = 0 | 90 | 180 | 270;

/**
 * A page as the PDF describes it. `x` and `y` are the lower-left corner of the view box in
 * PDF user space. `width` and `height` are the unrotated view box, in points.
 */
export interface PageGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
}

/** Any angle, as PDF's /Rotate may write it, reduced to one of the four quarter turns. */
export function normalizeRotation(degrees: number): Rotation {
  const quarterTurns = (Math.round(degrees / 90) % 4 + 4) % 4;
  return (quarterTurns * 90) as Rotation;
}

/** Size of the page as the reader sees it, after /Rotate. */
export function displaySize(page: PageGeometry): { readonly width: number; readonly height: number } {
  return page.rotation % 180 === 0
    ? { width: page.width, height: page.height }
    : { width: page.height, height: page.width };
}

/**
 * Maps a point in normalized display space (0 to 1, top-left origin, as on screen) to PDF user
 * space in points, where y points up.
 */
export function displayToUser(page: PageGeometry, u: number, v: number): { readonly x: number; readonly y: number } {
  const [u0, v0] = unrotate(page.rotation, u, v);
  return { x: page.x + u0 * page.width, y: page.y + page.height - v0 * page.height };
}

/** Reverses the clockwise /Rotate applied for display, so the result is in unrotated view box space. */
function unrotate(rotation: Rotation, u: number, v: number): readonly [number, number] {
  switch (rotation) {
    case 0:
      return [u, v];
    case 90:
      return [v, 1 - u];
    case 180:
      return [1 - u, 1 - v];
    case 270:
      return [1 - v, u];
  }
}

/** Top of each page in a column of pages with a fixed gap. */
export function pageTops(heights: readonly number[], top: number, gap: number): number[] {
  const tops: number[] = [];
  let next = top;
  for (const height of heights) {
    tops.push(next);
    next += height + gap;
  }
  return tops;
}

/**
 * The scroll position that shows a page with a little of the gap above it. The first page scrolls to
 * the top, so its gutter stays in view under the floating palette.
 */
export function scrollTopForPage(page: number, top: number, gap: number): number {
  return page === 1 ? 0 : top - gap;
}

/** The index of the page that contains `offset`: the last page whose top is at or above it. */
export function pageAtOffset(tops: readonly number[], offset: number): number {
  let low = 0;
  let high = tops.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((tops[mid] ?? Infinity) <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}
