import { z } from "zod";

export const subjectRef = z.string().describe("Subject id from list_subjects.");
export const lectureRef = z.string().describe("Material id from find_lecture or list_lectures.");
export const annotationRef = z.string().describe("Annotation id from get_lecture.");
export const taskRef = z.string().describe("Task id from list_tasks.");
export const cardRef = z.string().describe("Planner card id from list_planner.");

export const pageRef = z.number().int().min(1).describe("1-based page number.");
export const unitCoordinate = z.number().min(0).max(1);
export const hexColor = z.string().describe("Hex color, for example #1f2937.");
export const calendarDate = z.string().describe("Date as YYYY-MM-DD.");
export const clockTime = z.string().describe("24-hour time as HH:MM.");

const DEFAULT_PRESSURE = 0.5;

export const inkPoint = z
  .tuple([unitCoordinate, unitCoordinate, unitCoordinate.optional()])
  .describe("[x, y] or [x, y, pressure], each normalized 0 to 1.");

export function toInkPoint([x, y, pressure]: readonly [number, number, number?]): [number, number, number] {
  return [x, y, pressure ?? DEFAULT_PRESSURE];
}
