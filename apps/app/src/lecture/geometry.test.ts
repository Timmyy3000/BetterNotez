import { describe, expect, it } from "vitest";
import {
  displaySize,
  displayToUser,
  normalizeRotation,
  pageAfterScroll,
  pageAtOffset,
  pageTops,
  scrollTopForPage,
  type PageGeometry,
} from "./geometry";

const letter: PageGeometry = { x: 0, y: 0, width: 612, height: 792, rotation: 0 };

describe("displayToUser", () => {
  it("maps the top-left of an unrotated page to the top-left in PDF space, where y points up", () => {
    expect(displayToUser(letter, 0, 0)).toEqual({ x: 0, y: 792 });
  });

  it("maps the bottom-right corner of an unrotated page to the bottom-right", () => {
    expect(displayToUser(letter, 1, 1)).toEqual({ x: 612, y: 0 });
  });

  it("offsets by the lower-left of a view box that does not start at the origin", () => {
    const cropped: PageGeometry = { x: 10, y: 20, width: 400, height: 200, rotation: 0 };
    expect(displayToUser(cropped, 0.25, 0.5)).toEqual({ x: 110, y: 120 });
  });

  it("finds the unrotated corner for a page rotated 90 degrees clockwise", () => {
    const rotated: PageGeometry = { ...letter, rotation: 90 };
    expect(displaySize(rotated)).toEqual({ width: 792, height: 612 });
    // The reader's top-left is the unrotated bottom-left, and the reader's top-right is the unrotated top-left.
    expect(displayToUser(rotated, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(displayToUser(rotated, 1, 0)).toEqual({ x: 0, y: 792 });
  });

  it("finds the unrotated corner for a page rotated 180 and 270 degrees", () => {
    expect(displayToUser({ ...letter, rotation: 180 }, 0, 0)).toEqual({ x: 612, y: 0 });
    expect(displayToUser({ ...letter, rotation: 270 }, 0, 0)).toEqual({ x: 612, y: 792 });
  });
});

describe("normalizeRotation", () => {
  it("reduces any /Rotate value to a quarter turn between 0 and 270", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
  });
});

describe("page layout", () => {
  it("stacks pages from the top offset with the gap between them", () => {
    expect(pageTops([100, 50, 30], 80, 16)).toEqual([80, 196, 262]);
  });

  it("finds the page that a scroll offset falls in", () => {
    const tops = [80, 196, 300];
    expect(pageAtOffset(tops, 0)).toBe(0);
    expect(pageAtOffset(tops, 195)).toBe(0);
    expect(pageAtOffset(tops, 196)).toBe(1);
    expect(pageAtOffset(tops, 299)).toBe(1);
    expect(pageAtOffset(tops, 10_000)).toBe(2);
  });
});

describe("scrollTopForPage", () => {
  it("scrolls the first page to the top, so its gutter clears the palette", () => {
    expect(scrollTopForPage(1, 80, 16)).toBe(0);
  });

  it("leaves a 16px gap above later pages", () => {
    expect(scrollTopForPage(2, 500, 16)).toBe(484);
  });
});

describe("pageAfterScroll", () => {
  // Three pages whose tops are 80, 500 and 920, with the band of the viewer.
  const tops = [80, 500, 920];
  const band = 24;

  it("switches to the next page only once the reading line is a band past its top", () => {
    expect(pageAfterScroll(tops, 1, 510, band)).toBe(1);
    expect(pageAfterScroll(tops, 1, 523, band)).toBe(1);
    expect(pageAfterScroll(tops, 1, 524, band)).toBe(2);
  });

  it("switches back only once the reading line is a band above the current page's top", () => {
    expect(pageAfterScroll(tops, 2, 490, band)).toBe(2);
    expect(pageAfterScroll(tops, 2, 476, band)).toBe(2);
    expect(pageAfterScroll(tops, 2, 475, band)).toBe(1);
  });

  it("does not flicker while the line rests on an edge", () => {
    const readings = [498, 502, 499, 503, 497, 501];
    expect(readings.map((offset) => pageAfterScroll(tops, 1, offset, band))).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("follows a large jump at once, such as a jump to a page or a fast scroll", () => {
    expect(pageAfterScroll(tops, 1, 960, band)).toBe(3);
    expect(pageAfterScroll(tops, 3, 100, band)).toBe(1);
  });
});
