import { describe, expect, it } from "vitest";
import { countLabel, displayTitle, isoWeek, romanNumeral } from "./format";

describe("displayTitle", () => {
  it("sets a spaced hyphen as an en dash", () => {
    expect(displayTitle("Lecture 1 - Vectors and spans")).toBe("Lecture 1 – Vectors and spans");
  });

  it("leaves a hyphen inside a word alone", () => {
    expect(displayTitle("Well-known results")).toBe("Well-known results");
  });
});

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

describe("isoWeek", () => {
  it("counts from the week that holds the year's first Thursday", () => {
    expect(isoWeek(new Date(2026, 9, 9))).toBe(41);
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeek(new Date(2025, 11, 29))).toBe(1);
  });

  it("gives 53 for a year that has one", () => {
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
  });
});

describe("romanNumeral", () => {
  it("writes subject numbers as the home page does", () => {
    expect(romanNumeral(1)).toBe("I");
    expect(romanNumeral(4)).toBe("IV");
    expect(romanNumeral(9)).toBe("IX");
    expect(romanNumeral(14)).toBe("XIV");
    expect(romanNumeral(40)).toBe("XL");
  });
});
