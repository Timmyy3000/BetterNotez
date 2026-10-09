/** The gap between a format bar and its box, in CSS pixels. */
const GAP_PX = 8;

/**
 * The floating toolbar hangs 18 px from the top of the visible page and is 46 px tall. A format bar keeps
 * below this band, measured from the top of the visible page.
 */
export const TOOLBAR_BAND_PX = 70;

/** A box's place on its page, in CSS pixels from the page's top-left corner. */
export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface BarPlacement {
  /** The bar's top-left corner, in CSS pixels from the page's top-left corner. */
  readonly left: number;
  readonly top: number;
  /** False when the bar is below its box, because above would be over the page top or under the toolbar. */
  readonly above: boolean;
}

/**
 * Places a format bar for a box. The bar sits above the box unless that puts it over the top of the page or
 * under the toolbar band at the top of the visible page, and then it sits below. Horizontally it is centred on the
 * box and kept inside the page. A page narrower than the bar keeps it inside the visible width instead.
 *
 * `view` is the part of the page on screen, in page coordinates. The toolbar band moves with it as the page scrolls.
 */
export function placeBar({
  box,
  bar,
  page,
  view,
}: {
  readonly box: Frame;
  readonly bar: { readonly width: number; readonly height: number };
  readonly page: { readonly width: number };
  readonly view: { readonly left: number; readonly top: number; readonly width: number };
}): BarPlacement {
  // The bar's top may not go above this line: the page top, or the bottom of the toolbar band, whichever is lower.
  const floor = Math.max(0, view.top + TOOLBAR_BAND_PX);
  const aboveTop = box.top - GAP_PX - bar.height;
  const above = aboveTop >= floor;
  const top = above ? aboveTop : Math.max(box.top + box.height + GAP_PX, floor);

  const centred = box.left + box.width / 2 - bar.width / 2;
  const fits = page.width >= bar.width;
  const low = fits ? 0 : view.left;
  const high = fits ? page.width - bar.width : view.left + view.width - bar.width;
  // The left edge wins when even the visible width is narrower than the bar, so the first control stays in view.
  const left = Math.max(low, Math.min(high, centred));

  return { left, top, above };
}
