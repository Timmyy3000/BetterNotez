export interface SubjectColor {
  readonly name: string;
  readonly hex: string;
}

export const SUBJECT_COLORS: readonly SubjectColor[] = [
  { name: "Rose", hex: "#e11d48" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Amber", hex: "#ca8a04" },
  { name: "Green", hex: "#16a34a" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Violet", hex: "#9333ea" },
];

export const DEFAULT_SUBJECT_COLOR = "#2563eb";
