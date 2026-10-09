import { describe, expect, it } from "vitest";
import {
  gridRange,
  keyStep,
  layoutOverlaps,
  minutesToPx,
  newBlock,
  placeEnd,
  placeStart,
  snap,
  toMinutes,
  toTime,
} from "./time";

const DAY = { start: 7 * 60, end: 22 * 60 };

describe("time formatting", () => {
  it("reads and writes 24-hour clock times", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(toTime(570)).toBe("09:30");
    expect(toTime(toMinutes("21:05"))).toBe("21:05");
  });
});

describe("snap", () => {
  it("rounds to the nearest 15 minutes", () => {
    expect(snap(572)).toBe(570);
    expect(snap(578)).toBe(585);
  });
});

describe("gridRange", () => {
  it("shows 07:00 to 22:00 when there are no cards", () => {
    expect(gridRange([])).toEqual({ start: 420, end: 1320 });
  });

  it("widens to include a card that starts early or ends late", () => {
    expect(gridRange([{ start: 6 * 60 + 30, end: 7 * 60 + 30 }])).toEqual({ start: 360, end: 1320 });
    expect(gridRange([{ start: 9 * 60, end: 23 * 60 + 15 }])).toEqual({ start: 420, end: 1440 });
  });
});

describe("minutesToPx", () => {
  it("places 09:00 two hours below the 07:00 origin", () => {
    expect(minutesToPx(9 * 60, 7 * 60)).toBe(2 * 52);
  });
});

describe("placeStart", () => {
  it("snaps a start to a slot", () => {
    expect(placeStart(9 * 60 + 7, 90, DAY)).toBe(9 * 60);
  });

  it("keeps the whole block inside the grid", () => {
    expect(placeStart(21 * 60 + 30, 90, DAY)).toBe(20 * 60 + 30);
    expect(placeStart(5 * 60, 60, DAY)).toBe(7 * 60);
  });
});

describe("placeEnd", () => {
  it("keeps at least one slot of length", () => {
    expect(placeEnd(9 * 60, 9 * 60 + 2, DAY)).toBe(9 * 60 + 15);
  });

  it("does not run past the grid", () => {
    expect(placeEnd(21 * 60, 23 * 60, DAY)).toBe(22 * 60);
  });
});

describe("newBlock", () => {
  it("makes a one-hour block from a press without a drag", () => {
    expect(newBlock(9 * 60, 9 * 60, DAY)).toEqual({ start: 540, end: 600 });
  });

  it("spans a drag in either direction", () => {
    expect(newBlock(9 * 60, 10 * 60 + 30, DAY)).toEqual({ start: 540, end: 630 });
    expect(newBlock(10 * 60 + 30, 9 * 60, DAY)).toEqual({ start: 540, end: 630 });
  });

  it("stays inside the grid at the bottom edge", () => {
    expect(newBlock(21 * 60 + 30, 21 * 60 + 30, DAY)).toEqual({ start: 1290, end: 1320 });
  });
});

describe("layoutOverlaps", () => {
  const lanes = (spans: { start: number; end: number }[]) =>
    layoutOverlaps(spans).map(({ item, column, columns }) => [item.start, column, columns]);

  it("gives the full width to a span that overlaps nothing", () => {
    expect(lanes([{ start: 540, end: 600 }])).toEqual([[540, 0, 1]]);
  });

  it("puts overlapping spans side by side", () => {
    expect(
      lanes([
        { start: 570, end: 630 },
        { start: 540, end: 600 },
      ]),
    ).toEqual([
      [540, 0, 2],
      [570, 1, 2],
    ]);
  });

  it("does not treat back-to-back spans as overlapping", () => {
    expect(
      lanes([
        { start: 600, end: 660 },
        { start: 540, end: 600 },
      ]),
    ).toEqual([
      [540, 0, 1],
      [600, 0, 1],
    ]);
  });

  it("reuses a freed lane inside one cluster", () => {
    expect(
      lanes([
        { start: 540, end: 720 },
        { start: 540, end: 600 },
        { start: 600, end: 660 },
      ]),
    ).toEqual([
      [540, 0, 2],
      [540, 1, 2],
      [600, 0, 2],
    ]);
  });

  it("sizes each cluster by its own lane count", () => {
    expect(
      lanes([
        { start: 540, end: 600 },
        { start: 540, end: 600 },
        { start: 540, end: 600 },
        { start: 780, end: 840 },
      ]),
    ).toEqual([
      [540, 0, 3],
      [540, 1, 3],
      [540, 2, 3],
      [780, 0, 1],
    ]);
  });
});

describe("keyStep", () => {
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const WEEKDAYS = [0, 1, 2, 3, 4];
  const nine = { day: 1, start: 9 * 60, end: 10 * 60 };

  it("moves a block down by a 15 minute slot", () => {
    expect(keyStep(nine, "ArrowDown", false, ALL_DAYS, DAY)).toEqual({ day: 1, start: 555, end: 615 });
  });

  it("moves a block up by a 15 minute slot", () => {
    expect(keyStep(nine, "ArrowUp", false, ALL_DAYS, DAY)).toEqual({ day: 1, start: 525, end: 585 });
  });

  it("moves a block to the next visible day and keeps its time", () => {
    expect(keyStep(nine, "ArrowRight", false, ALL_DAYS, DAY)).toEqual({ day: 2, start: 540, end: 600 });
    expect(keyStep(nine, "ArrowLeft", false, ALL_DAYS, DAY)).toEqual({ day: 0, start: 540, end: 600 });
  });

  it("stays on the last visible day when the weekend is hidden", () => {
    const friday = { day: 4, start: 540, end: 600 };
    expect(keyStep(friday, "ArrowRight", false, WEEKDAYS, DAY)).toEqual(friday);
  });

  it("does not move past the top of the grid", () => {
    const first = { day: 0, start: 7 * 60, end: 8 * 60 };
    expect(keyStep(first, "ArrowUp", false, ALL_DAYS, DAY)).toEqual(first);
  });

  it("resizes the end by a slot with Shift, and keeps at least one slot", () => {
    expect(keyStep(nine, "ArrowDown", true, ALL_DAYS, DAY)).toEqual({ day: 1, start: 540, end: 615 });
    const shortest = { day: 1, start: 540, end: 555 };
    expect(keyStep(shortest, "ArrowUp", true, ALL_DAYS, DAY)).toEqual(shortest);
  });
});
