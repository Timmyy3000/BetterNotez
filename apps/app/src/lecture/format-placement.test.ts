import { describe, expect, it } from "vitest";
import { placeBar, TOOLBAR_BAND_PX } from "./format-placement";

const bar = { width: 300, height: 46 };
const page = { width: 400 };
/** A page with nothing scrolled away, so its top is on screen. */
const view = { left: 0, top: 0, width: 400 };

describe("placeBar", () => {
  it("sits above its box when there is room between the box and the page top", () => {
    const placed = placeBar({ box: { left: 100, top: 200, width: 120, height: 60 }, bar, page, view });

    expect(placed).toEqual({ left: 10, top: 146, above: true });
  });

  it("flips below when above would go over the top of the page", () => {
    const placed = placeBar({ box: { left: 100, top: 20, width: 120, height: 120 }, bar, page, view });

    expect(placed).toEqual({ left: 10, top: 148, above: false });
  });

  it("flips below when the page is scrolled so the toolbar band is where above would be", () => {
    // The top of the visible page is 150 px down the page, so the band runs from 150 to 220 in page coordinates.
    const placed = placeBar({
      box: { left: 100, top: 240, width: 120, height: 50 },
      bar,
      page,
      view: { ...view, top: 150 },
    });

    expect(placed).toEqual({ left: 10, top: 298, above: false });
  });

  it("stays above when its top clears the toolbar band exactly", () => {
    const top = 150 + TOOLBAR_BAND_PX + 8 + bar.height;
    const placed = placeBar({ box: { left: 100, top, width: 120, height: 60 }, bar, page, view: { ...view, top: 150 } });

    expect(placed).toEqual({ left: 10, top: 150 + TOOLBAR_BAND_PX, above: true });
  });

  it("keeps the bar under the toolbar band when a short box sits in the band itself", () => {
    const placed = placeBar({ box: { left: 100, top: 10, width: 120, height: 20 }, bar, page, view });

    expect(placed.above).toBe(false);
    expect(placed.top).toBe(TOOLBAR_BAND_PX);
  });

  it("keeps the bar inside the page on the left and on the right", () => {
    const leftEdge = placeBar({ box: { left: 5, top: 200, width: 40, height: 60 }, bar, page, view });
    const rightEdge = placeBar({ box: { left: 380, top: 200, width: 10, height: 60 }, bar, page, view });

    expect(leftEdge.left).toBe(0);
    expect(rightEdge.left).toBe(page.width - bar.width);
  });

  it("keeps the bar inside the visible width when the page is narrower than the bar", () => {
    const narrow = { width: 200 };
    const visible = { left: 50, top: 0, width: 400 };
    const leftOfView = placeBar({
      box: { left: 130, top: 200, width: 40, height: 60 },
      bar,
      page: narrow,
      view: visible,
    });
    const rightOfView = placeBar({
      box: { left: 380, top: 200, width: 20, height: 60 },
      bar,
      page: narrow,
      view: visible,
    });

    // The visible width runs from 50 to 450, so a 300 point bar lies between 50 and 150 as its left edge.
    expect(leftOfView.left).toBe(50);
    expect(rightOfView.left).toBe(150);
  });

  it("keeps the left edge in view when even the visible width is narrower than the bar", () => {
    const placed = placeBar({
      box: { left: 60, top: 200, width: 40, height: 60 },
      bar,
      page: { width: 200 },
      view: { left: 0, top: 0, width: 200 },
    });

    expect(placed.left).toBe(0);
  });
});
