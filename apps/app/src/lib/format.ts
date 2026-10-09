import type { Lecture } from "@betternotez/core";

export function formatLectureDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function countLabel(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

export function lectureMeta(lecture: Pick<Lecture, "date" | "pageCount">): string {
  const date = lecture.date === undefined ? "No date" : formatLectureDate(lecture.date);
  return `${date} · ${countLabel(lecture.pageCount, "page")}`;
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The ISO 8601 week number. Weeks start on Monday, and week 1 is the one holding the year's first Thursday. */
export function isoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const mondayBased = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - mondayBased + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstMondayBased = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstMondayBased + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

const ROMAN_NUMERALS: readonly (readonly [number, string])[] = [
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Numbers subjects in the old-book style of the home page, such as II. and IV. */
export function romanNumeral(value: number): string {
  let rest = value;
  let numeral = "";
  for (const [amount, symbol] of ROMAN_NUMERALS) {
    while (rest >= amount) {
      numeral += symbol;
      rest -= amount;
    }
  }
  return numeral;
}
