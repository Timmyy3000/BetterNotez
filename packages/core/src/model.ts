import { z } from "zod";
import { AnnotationId, LectureId, PlannerCardId, SubjectId, TaskId } from "./ids.js";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Not a real calendar date");

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const timestamp = z.iso.datetime();
const label = z.string().trim().min(1);
const unitInterval = z.number().min(0).max(1);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const pageNumber = z.number().int().min(1);

export const LibraryFile = z.object({ version: z.literal(1) });

export const Subject = z.object({
  id: SubjectId,
  name: label,
  color: hexColor,
  createdAt: timestamp,
});
export type Subject = z.infer<typeof Subject>;

export const Lecture = z.object({
  id: LectureId,
  subjectId: SubjectId,
  title: label,
  date: calendarDate.optional(),
  pageCount: z.number().int().min(1),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Lecture = z.infer<typeof Lecture>;

const author = z.enum(["user", "ai"]);

export const TextBox = z.object({
  id: AnnotationId,
  kind: z.literal("text"),
  page: pageNumber,
  author,
  x: unitInterval,
  y: unitInterval,
  width: unitInterval,
  height: unitInterval,
  text: z.string(),
  fontSize: z.number().positive(),
  color: hexColor,
});
export type TextBox = z.infer<typeof TextBox>;

export const Ink = z.object({
  id: AnnotationId,
  kind: z.literal("ink"),
  page: pageNumber,
  author,
  points: z.array(z.tuple([unitInterval, unitInterval, unitInterval])).min(1),
  color: hexColor,
  size: z.number().positive(),
  /** Omitted for an opaque stroke. The app's highlighter sets it. */
  opacity: unitInterval.optional(),
});
export type Ink = z.infer<typeof Ink>;

/** A box on a page, normalized to the page size so it keeps its place at any zoom. */
export const PageRect = z.object({
  x: unitInterval,
  y: unitInterval,
  width: unitInterval,
  height: unitInterval,
});
export type PageRect = z.infer<typeof PageRect>;

export const Highlight = z.object({
  id: AnnotationId,
  kind: z.literal("highlight"),
  page: pageNumber,
  author,
  /** One box per line of the highlighted text. A box with no area would be stored and never seen, so it is refused. */
  rects: z.array(PageRect.refine((rect) => rect.width > 0 && rect.height > 0, "A highlight box needs an area")).min(1),
  /** The highlighted text, so an assistant can read what a highlight covers without the PDF. */
  text: label,
  color: hexColor,
});
export type Highlight = z.infer<typeof Highlight>;

/** Files written before highlights existed hold only text boxes and strokes, and still parse. */
export const Annotation = z.discriminatedUnion("kind", [TextBox, Ink, Highlight]);
export type Annotation = z.infer<typeof Annotation>;
export type AnnotationDraft = DistributiveOmit<z.input<typeof Annotation>, "id">;

export const PlannerCard = z
  .object({
    id: PlannerCardId,
    subjectId: SubjectId,
    day: z.number().int().min(0).max(6),
    start: timeOfDay,
    end: timeOfDay,
    location: label.optional(),
  })
  .refine((card) => card.start < card.end, {
    message: "End time must be after start time",
    path: ["end"],
  });
export type PlannerCard = z.infer<typeof PlannerCard>;

export const TaskStatus = z.enum(["todo", "doing", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Task = z.object({
  id: TaskId,
  title: label,
  status: TaskStatus,
  order: z.number(),
  subjectId: SubjectId.optional(),
  lectureId: LectureId.optional(),
  due: calendarDate.optional(),
});
export type Task = z.infer<typeof Task>;
