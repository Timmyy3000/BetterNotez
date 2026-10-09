import { describe, expect, it } from "vitest";
import { Annotation, TEXT_BOX_DEFAULTS, textBoxStyle, TextBox } from "./model.js";

const id = "01TEXTBOXMODEL0000000000000";

/** A text box as the app wrote it before the style fields existed. */
const legacyBox = {
  id,
  kind: "text",
  page: 2,
  author: "user",
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.1,
  text: "Truth table",
  fontSize: 14,
  color: "#2b4b78",
};

describe("text box annotations", () => {
  it("reads a file written before the style fields existed, and adds none of them", () => {
    const parsed = Annotation.parse(legacyBox);

    expect(parsed).toEqual(legacyBox);
    expect(parsed).not.toHaveProperty("bold");
    expect(parsed).not.toHaveProperty("italic");
    expect(parsed).not.toHaveProperty("underline");
  });

  it("reads a text box that leaves out its size, so the size comes from the defaults", () => {
    const { fontSize: _fontSize, ...withoutSize } = legacyBox;

    const parsed = TextBox.parse(withoutSize);

    expect(parsed.fontSize).toBeUndefined();
    expect(textBoxStyle(parsed).fontSize).toBe(TEXT_BOX_DEFAULTS.fontSize);
  });

  it("keeps bold, italic, and underline when they are set", () => {
    const box = Annotation.parse({ ...legacyBox, bold: true, italic: false, underline: true });

    expect(box).toMatchObject({ bold: true, italic: false, underline: true });
  });

  it.each([
    ["a size of zero", { fontSize: 0 }],
    ["a negative size", { fontSize: -4 }],
    ["a bold flag that is not a boolean", { bold: "yes" }],
    ["an italic flag that is a number", { italic: 1 }],
    ["an underline flag that is null", { underline: null }],
    ["a colour that is not a hex value", { color: "red" }],
  ])("refuses %s", (_, change) => {
    expect(Annotation.safeParse({ ...legacyBox, ...change }).success).toBe(false);
  });
});

describe("textBoxStyle", () => {
  it("draws a box that sets nothing in the italic serif look it has always had", () => {
    expect(textBoxStyle({ color: "#000000" })).toEqual({
      fontSize: 14,
      bold: false,
      italic: true,
      underline: false,
      color: "#000000",
    });
  });

  it("uses each field the box sets and the default for each one it leaves out", () => {
    expect(textBoxStyle({ fontSize: 24, bold: true, italic: false, color: "#a3321f" })).toEqual({
      fontSize: 24,
      bold: true,
      italic: false,
      underline: false,
      color: "#a3321f",
    });
  });
});
