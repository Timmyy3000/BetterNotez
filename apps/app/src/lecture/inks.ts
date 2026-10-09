/**
 * The pen inks. Each reads at 4.5:1 or better on the sheet in every theme, so the text in it stays legible.
 * Each stroke stores its hex, so a stroke keeps its colour in both themes.
 */
export const INK_COLORS = [
  { name: "Black", value: "#241e19" },
  { name: "Red", value: "#a3321f" },
  { name: "Green", value: "#2f5a3a" },
  { name: "Blue", value: "#2b4b78" },
  { name: "Ochre", value: "#7d5210" },
] as const;
