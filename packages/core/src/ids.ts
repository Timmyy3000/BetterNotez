import { z } from "zod";

const ID_PATTERN = /^[0-9A-Za-z][0-9A-Za-z_-]{0,63}$/;

export const SubjectId = z.string().regex(ID_PATTERN).brand<"SubjectId">();
export type SubjectId = z.infer<typeof SubjectId>;

export const LectureId = z.string().regex(ID_PATTERN).brand<"LectureId">();
export type LectureId = z.infer<typeof LectureId>;

export const AnnotationId = z.string().regex(ID_PATTERN).brand<"AnnotationId">();
export type AnnotationId = z.infer<typeof AnnotationId>;

export const PlannerCardId = z.string().regex(ID_PATTERN).brand<"PlannerCardId">();
export type PlannerCardId = z.infer<typeof PlannerCardId>;

export const TaskId = z.string().regex(ID_PATTERN).brand<"TaskId">();
export type TaskId = z.infer<typeof TaskId>;

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;

let lastTime = -1;
let lastRandom: number[] = [];

function randomDigits(): number[] {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_CHARS));
  return Array.from(bytes, (byte) => byte % 32);
}

function incrementRandom(digits: number[]): number[] {
  const next = [...digits];
  for (let i = next.length - 1; i >= 0; i--) {
    const digit = next[i] ?? 0;
    if (digit < 31) {
      next[i] = digit + 1;
      return next;
    }
    next[i] = 0;
  }
  return next;
}

/**
 * Time-sortable, 26-character id (ULID layout). Ids created in the same
 * millisecond within one process still sort in creation order.
 */
export function newId(time: number = Date.now()): string {
  if (time === lastTime) {
    lastRandom = incrementRandom(lastRandom);
  } else {
    lastTime = time;
    lastRandom = randomDigits();
  }

  let timePart = "";
  let remaining = time;
  for (let i = 0; i < TIME_CHARS; i++) {
    timePart = CROCKFORD_ALPHABET.charAt(remaining % 32) + timePart;
    remaining = Math.floor(remaining / 32);
  }

  const randomPart = lastRandom.map((digit) => CROCKFORD_ALPHABET.charAt(digit)).join("");
  return timePart + randomPart;
}
