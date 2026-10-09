import { describe, expect, it } from "vitest";
import { mergeLineRects } from "./rects.js";

describe("mergeLineRects", () => {
  it("joins the text runs of one line into one box", () => {
    const merged = mergeLineRects([
      { x: 0.1, y: 0.2, width: 0.1, height: 0.03 },
      { x: 0.21, y: 0.201, width: 0.08, height: 0.03 },
      { x: 0.3, y: 0.2, width: 0.05, height: 0.03 },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.x).toBeCloseTo(0.1);
    expect(merged[0]?.y).toBeCloseTo(0.2);
    expect(merged[0]?.width).toBeCloseTo(0.25);
    expect(merged[0]?.height).toBeCloseTo(0.031);
  });

  it("keeps separate lines apart and returns them top to bottom", () => {
    const merged = mergeLineRects([
      { x: 0.1, y: 0.4, width: 0.5, height: 0.03 },
      { x: 0.1, y: 0.2, width: 0.5, height: 0.03 },
    ]);

    expect(merged.map((box) => box.y)).toEqual([0.2, 0.4]);
  });

  it("keeps two columns on the same height apart", () => {
    const merged = mergeLineRects([
      { x: 0.1, y: 0.2, width: 0.3, height: 0.03 },
      { x: 0.6, y: 0.2, width: 0.3, height: 0.03 },
    ]);

    expect(merged).toHaveLength(2);
  });

  it("drops boxes with no height and returns nothing for nothing", () => {
    expect(mergeLineRects([])).toEqual([]);
    expect(mergeLineRects([{ x: 0.1, y: 0.1, width: 0.2, height: 0 }])).toEqual([]);
  });
});
