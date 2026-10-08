import { describe, expect, it } from "vitest";
import { distanceToPolyline } from "./ink";

describe("distanceToPolyline", () => {
  const stroke = [
    [0, 0, 0.5],
    [10, 0, 0.5],
  ] as const;

  it("measures to the nearest point on a segment", () => {
    expect(distanceToPolyline(stroke, 5, 3)).toBe(3);
  });

  it("measures to an end of the stroke when the point lies beyond it", () => {
    expect(distanceToPolyline(stroke, -4, 3)).toBe(5);
  });

  it("measures to a single-point stroke", () => {
    expect(distanceToPolyline([[3, 4, 0.5]], 0, 0)).toBe(5);
  });

  it("is infinitely far from an empty stroke", () => {
    expect(distanceToPolyline([], 0, 0)).toBe(Infinity);
  });
});
