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
