import { describe, expect, it } from "vitest";
import { parsePreference, resolveTheme } from "./theme";

describe("parsePreference", () => {
  it("keeps a stored choice", () => {
    expect(parsePreference("light")).toBe("light");
    expect(parsePreference("system")).toBe("system");
  });

  it("falls back to dark when nothing valid is stored", () => {
    expect(parsePreference(null)).toBe("dark");
    expect(parsePreference("purple")).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("follows the operating system only for system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the operating system for an explicit choice", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
