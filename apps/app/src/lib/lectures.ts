import type { Lecture } from "@betternotez/core";

const UNDATED = "￿";

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Chronological. Lectures without a date come last, in the order they were added. */
export function sortLectures(lectures: readonly Lecture[]): Lecture[] {
  return [...lectures].sort(
    (a, b) => compare(a.date ?? UNDATED, b.date ?? UNDATED) || compare(a.createdAt, b.createdAt),
  );
}
