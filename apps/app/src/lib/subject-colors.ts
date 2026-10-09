export interface SubjectColor {
  readonly name: string;
  /** The stored subject colour. Changing it would orphan every subject that already uses it. */
  readonly hex: string;
  /** The ink that paints this colour in each theme. See `--subject-*` in index.css. */
  readonly tone: string;
}

/** Graphite and Umber keep the stored ids of the old Indigo and Violet presets, which were removed from the design. */
export const SUBJECT_COLORS: readonly SubjectColor[] = [
  { name: "Rose", hex: "#e11d48", tone: "rose" },
  { name: "Orange", hex: "#ea580c", tone: "orange" },
  { name: "Amber", hex: "#ca8a04", tone: "amber" },
  { name: "Green", hex: "#16a34a", tone: "green" },
  { name: "Teal", hex: "#0d9488", tone: "teal" },
  { name: "Blue", hex: "#2563eb", tone: "blue" },
  { name: "Graphite", hex: "#4f46e5", tone: "graphite" },
  { name: "Umber", hex: "#9333ea", tone: "umber" },
];

export const DEFAULT_SUBJECT_COLOR = "#2563eb";

/** A CSS colour for a stored subject colour, so it follows the theme. Unknown colours pass through unchanged. */
export function subjectTone(color: string): string {
  const tone = SUBJECT_COLORS.find((item) => item.hex === color.toLowerCase())?.tone;
  return tone === undefined ? color : `var(--subject-${tone})`;
}
