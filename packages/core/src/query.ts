import type { Lecture, Subject } from "./model.js";

export interface LectureMatch {
  readonly lecture: Lecture;
  readonly subject: Subject;
  /** 0 to 1. Share of the query's words that the subject or lecture title matched. */
  readonly score: number;
}

const MIN_SCORE = 0.5;
const SNIPPET_CONTEXT = 40;
const LECTURE_NUMBER = /\b(?:lectures?|lec|l)\s*#?\s*(\d+)\b/i;
const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "at",
  "for",
  "from",
  "in",
  "lets",
  "of",
  "on",
  "talk",
  "the",
  "to",
  "us",
  "with",
]);

export function words(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

export function rankLectures(
  query: string,
  subjects: readonly Subject[],
  lectures: readonly Lecture[],
): LectureMatch[] {
  const { number, terms } = parseQuery(query);
  if (number === undefined && terms.length === 0) {
    return [];
  }

  const subjectById = new Map(subjects.map((subject): [string, Subject] => [subject.id, subject]));
  const matches: LectureMatch[] = [];
  for (const lecture of lectures) {
    const subject = subjectById.get(lecture.subjectId);
    if (subject === undefined) {
      continue;
    }
    if (number !== undefined && !titleNumbers(lecture.title).has(number)) {
      continue;
    }
    const score = scoreTerms(terms, [...words(lecture.title), ...words(subject.name)]);
    if (score > MIN_SCORE) {
      matches.push({ lecture, subject, score });
    }
  }

  return matches.sort(
    (a, b) =>
      b.score - a.score ||
      a.subject.name.localeCompare(b.subject.name) ||
      a.lecture.title.localeCompare(b.lecture.title),
  );
}

/** Returns the snippet around the first case-insensitive match of `needle`, or undefined. */
export function matchSnippet(text: string, needle: string): string | undefined {
  const index = text.toLowerCase().indexOf(needle);
  if (index === -1) {
    return undefined;
  }
  const start = Math.max(0, index - SNIPPET_CONTEXT);
  const end = Math.min(text.length, index + needle.length + SNIPPET_CONTEXT);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "..." : ""}${body}${end < text.length ? "..." : ""}`;
}

function parseQuery(query: string): { number: number | undefined; terms: string[] } {
  const match = LECTURE_NUMBER.exec(query);
  const numberText = match?.[1];
  const rest = match ? query.replace(LECTURE_NUMBER, " ") : query;
  return {
    number: numberText === undefined ? undefined : Number(numberText),
    terms: words(rest).filter((word) => !STOP_WORDS.has(word)),
  };
}

function titleNumbers(title: string): Set<number> {
  return new Set((title.match(/\d+/g) ?? []).map(Number));
}

function scoreTerms(terms: readonly string[], fields: readonly string[]): number {
  if (terms.length === 0) {
    return 1;
  }
  const matched = terms.filter((term) => fields.some((field) => termMatches(term, field))).length;
  return matched / terms.length;
}

function termMatches(term: string, field: string): boolean {
  if (field === term) {
    return true;
  }
  if (term.length >= 3 && field.startsWith(term)) {
    return true;
  }
  const allowedEdits = term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0;
  return allowedEdits > 0 && editDistance(term, field) <= allowedEdits;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
