import { describe, expect, it } from "vitest";
import { countLabel } from "./format";

describe("countLabel", () => {
  it("adds an s for other counts", () => {
    expect(countLabel(2, "lecture")).toBe("2 lectures");
    expect(countLabel(0, "lecture")).toBe("0 lectures");
  });

  it("uses the singular for one", () => {
    expect(countLabel(1, "lecture")).toBe("1 lecture");
  });

  it("takes an irregular plural", () => {
    expect(countLabel(1, "timetable class", "timetable classes")).toBe("1 timetable class");
    expect(countLabel(3, "timetable class", "timetable classes")).toBe("3 timetable classes");
  });
});
