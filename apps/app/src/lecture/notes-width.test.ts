import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampNotesWidth,
  NOTES_MIN_WIDTH,
  notesCanResize,
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
  it("lets the notes take 60% of a wide lecture area", () => {
    expect(notesWidthBounds(1216)).toEqual({ min: NOTES_MIN_WIDTH, max: 729 });
  });

  it("keeps the PDF's minimum width when the area is narrow", () => {
    // At the 768px breakpoint the lecture area is 704px, and 60% of it would leave the PDF too little room.
    expect(notesWidthBounds(704)).toEqual({ min: NOTES_MIN_WIDTH, max: 344 });
  });

  it("never gives a maximum below the minimum", () => {
    expect(notesWidthBounds(500)).toEqual({ min: NOTES_MIN_WIDTH, max: NOTES_MIN_WIDTH });
  });
});

describe("notesCanResize", () => {
  it("needs room for the narrowest notes beside the narrowest PDF", () => {
    expect(notesCanResize(NOTES_MIN_WIDTH + PDF_MIN_WIDTH)).toBe(true);
    expect(notesCanResize(NOTES_MIN_WIDTH + PDF_MIN_WIDTH - 1)).toBe(false);
  });
});

describe("clampNotesWidth", () => {
  const bounds = notesWidthBounds(1216);

  it("keeps a width inside the bounds", () => {
    expect(clampNotesWidth(412, bounds)).toBe(412);
  });

  it("pins a width below the minimum to the minimum", () => {
    expect(clampNotesWidth(120, bounds)).toBe(NOTES_MIN_WIDTH);
  });

  it("pins a width above the maximum to the maximum", () => {
    expect(clampNotesWidth(5000, bounds)).toBe(729);
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
