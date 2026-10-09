import { describe, expect, it } from "vitest";
import { parsePreference, resolveTheme, toasterTheme } from "./theme";

describe("parsePreference", () => {
  it("keeps a stored choice", () => {
    expect(parsePreference("light")).toBe("light");
    expect(parsePreference("dark")).toBe("dark");
    expect(parsePreference("warm")).toBe("warm");
    expect(parsePreference("system")).toBe("system");
  });

  it("falls back to warm when nothing valid is stored", () => {
    expect(parsePreference(null)).toBe("warm");
    expect(parsePreference("purple")).toBe("warm");
  });
});

describe("resolveTheme", () => {
  it("follows the operating system only for system, and never picks warm", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the operating system for an explicit choice", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("warm", false)).toBe("warm");
    expect(resolveTheme("warm", true)).toBe("warm");
  });
});

describe("toasterTheme", () => {
  it("gives light its light styling and both dark appearances the dark styling", () => {
    expect(toasterTheme("light")).toBe("light");
    expect(toasterTheme("dark")).toBe("dark");
    expect(toasterTheme("warm")).toBe("dark");
  });
});
