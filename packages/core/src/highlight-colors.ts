/**
 * The marker colours for text highlights and the freehand highlighter. Each one is multiplied onto the page,
 * so black text stays readable under every colour on each of the app's papers: the warm cream, the dark
 * grey, and the white. The pen inks are a separate palette.
 */
export const HIGHLIGHT_COLORS = [
  { name: "yellow", label: "Yellow", value: "#ffd21f" },
  { name: "green", label: "Green", value: "#5ccf6e" },
  { name: "pink", label: "Pink", value: "#ff5fa0" },
  { name: "blue", label: "Blue", value: "#3fd0ea" },
  { name: "orange", label: "Orange", value: "#ff7433" },
] as const;

export type HighlightColorName = (typeof HIGHLIGHT_COLORS)[number]["name"];

/** The names an assistant may pass, in palette order. */
export const HIGHLIGHT_COLOR_NAMES = HIGHLIGHT_COLORS.map((swatch) => swatch.name) as [
  HighlightColorName,
  ...HighlightColorName[],
];

/** The colour a new highlight takes, and the one an assistant uses when it names none. */
export const DEFAULT_HIGHLIGHT_COLOR = HIGHLIGHT_COLORS[0].value;

/** The hex of a named highlight colour. Names outside the palette fall back to the default. */
export function highlightColorOf(name: string): string {
  return HIGHLIGHT_COLORS.find((swatch) => swatch.name === name)?.value ?? DEFAULT_HIGHLIGHT_COLOR;
}
