import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampNotesWidth,
  NOTES_MIN_WIDTH,
  notesWidthBounds,
  parseNotesWidth,
  PDF_MIN_WIDTH,
  readNotesWidth,
  writeNotesWidth,
} from "./notes-width";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** An in-memory stand-in for the browser's localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("notesWidthBounds", () => {
  it("lets the notes take 60% of a wide lecture area, while the PDF keeps its minimum", () => {
    expect(notesWidthBounds(1600)).toEqual({ min: NOTES_MIN_WIDTH, max: 960 });
  });

  it("stops the notes where the PDF reaches its minimum width", () => {
    // At the 1280px desktop the lecture area is 1216px. 60% of it would leave the PDF too narrow for its toolbar.
    expect(notesWidthBounds(1216)).toEqual({ min: NOTES_MIN_WIDTH, max: 1216 - PDF_MIN_WIDTH });
  });

  it("leaves the PDF at least as wide as its toolbar, at every width it offers a resize", () => {
    for (const area of [900, 1000, 1216, 1376, 1600, 2000]) {
      const bounds = notesWidthBounds(area);
      expect(bounds).toBeDefined();
      expect(area - (bounds?.max ?? 0)).toBeGreaterThanOrEqual(PDF_MIN_WIDTH);
    }
  });

  it("offers no resize when the area cannot fit the narrowest notes beside the PDF", () => {
    expect(notesWidthBounds(NOTES_MIN_WIDTH + PDF_MIN_WIDTH - 1)).toBeUndefined();
    expect(notesWidthBounds(500)).toBeUndefined();
  });

  it("pins both limits to the minimum when the area fits the two panels exactly", () => {
    expect(notesWidthBounds(NOTES_MIN_WIDTH + PDF_MIN_WIDTH)).toEqual({ min: NOTES_MIN_WIDTH, max: NOTES_MIN_WIDTH });
  });
});

describe("clampNotesWidth", () => {
  const bounds = { min: NOTES_MIN_WIDTH, max: 596 };

  it("keeps a width inside the bounds", () => {
    expect(clampNotesWidth(412, bounds)).toBe(412);
  });

  it("pins a width below the minimum to the minimum", () => {
    expect(clampNotesWidth(120, bounds)).toBe(NOTES_MIN_WIDTH);
  });

  it("pins a width above the maximum to the maximum", () => {
    expect(clampNotesWidth(5000, bounds)).toBe(596);
  });

  it("rounds to whole pixels", () => {
    expect(clampNotesWidth(412.6, bounds)).toBe(413);
  });
});

describe("parseNotesWidth", () => {
  it("reads a stored width", () => {
    expect(parseNotesWidth("412")).toBe(412);
  });

  it("ignores a missing, malformed, or non-positive value", () => {
    expect(parseNotesWidth(null)).toBeUndefined();
    expect(parseNotesWidth("")).toBeUndefined();
    expect(parseNotesWidth("wide")).toBeUndefined();
    expect(parseNotesWidth("0")).toBeUndefined();
    expect(parseNotesWidth("-40")).toBeUndefined();
    expect(parseNotesWidth("Infinity")).toBeUndefined();
  });
});

describe("stored notes width", () => {
  it("writes under the betternotez key and reads the same value back", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    writeNotesWidth(500);
    expect(storage.items.get("betternotez.notesWidth")).toBe("500");
    expect(readNotesWidth()).toBe(500);
  });

  it("reads nothing when no width was stored", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(readNotesWidth()).toBeUndefined();
  });

  it("survives storage that is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readNotesWidth()).toBeUndefined();
    expect(() => writeNotesWidth(500)).not.toThrow();
  });
});
