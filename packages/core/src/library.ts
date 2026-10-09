import { z } from "zod";
import { InvalidError, NotFoundError, UnreadableNotesError } from "./errors.js";
import { LectureId, SubjectId, newId, type AnnotationId } from "./ids.js";
import {
  Annotation,
  type AnnotationDraft,
  type Highlight,
  type Ink,
  Lecture,
  LibraryFile,
  PageNotes,
  PageNumber,
  PlannerCard,
  Subject,
  Task,
  TaskStatus,
  type TextBox,
} from "./model.js";
import { type LectureMatch, matchSnippet, rankLectures } from "./query.js";
import { type Storage } from "./storage.js";

const DEFAULT_SUBJECT_COLOR = "#64748b";
const PDF_HEADER = "%PDF-";
const PDF_TEXT = z.array(z.string());

export interface LibraryOptions {
  readonly now?: () => Date;
}

export interface SubjectInput {
  readonly name: string;
  readonly color?: string;
}

export interface SubjectPatch {
  readonly name?: string;
  readonly color?: string;
}

export interface LecturePatch {
  readonly title?: string;
  readonly date?: string | null;
}

export type AnnotationPatch =
  | Partial<Omit<TextBox, "id" | "kind">>
  | Partial<Omit<Ink, "id" | "kind">>
  | Partial<Omit<Highlight, "id" | "kind">>;

export interface PlannerCardInput {
  readonly subjectId: string;
  readonly day: number;
  readonly start: string;
  readonly end: string;
  readonly location?: string;
}

export interface PlannerCardPatch {
  readonly subjectId?: string;
  readonly day?: number;
  readonly start?: string;
  readonly end?: string;
  readonly location?: string | null;
}

export interface TaskInput {
  readonly title: string;
  readonly status?: TaskStatus;
  readonly subjectId?: string;
  readonly lectureId?: string;
  readonly due?: string;
}

export interface TaskPatch {
  readonly title?: string;
  readonly status?: TaskStatus;
  /** Sort key within the status column. A status change without `order` moves the task to the end. */
  readonly order?: number;
  readonly subjectId?: string | null;
  readonly lectureId?: string | null;
  readonly due?: string | null;
}

export interface SearchOptions {
  /** Supplies page text for a lecture. Defaults to the cached text.json for that lecture. */
  readonly pdfText?: (lectureId: string) => Promise<readonly string[]>;
}

export interface SearchHit {
  readonly kind: "subject" | "lecture" | "notes" | "annotation" | "pdf";
  readonly subjectId: SubjectId;
  readonly lectureId?: LectureId;
  readonly annotationId?: AnnotationId;
  /** 1-based page number, for notes, annotation, and pdf hits. */
  readonly page?: number;
  readonly snippet: string;
}

/** The note on one page. Lists hold only pages with text. */
export interface PageNote {
  readonly page: number;
  readonly text: string;
}

interface LocatedLecture {
  readonly lecture: Lecture;
  readonly dir: string;
}

interface NotePage {
  readonly dir: string;
  readonly page: number;
}

/**
 * One entry of annotations.json: an annotation this version reads, or an entry of a kind it does not know.
 * An unknown entry is kept as stored, so writing the file back does not drop what a newer version wrote.
 */
type StoredAnnotation = { readonly annotation: Annotation } | { readonly unknown: unknown };

function annotationOf(entry: StoredAnnotation): Annotation | undefined {
  return "annotation" in entry ? entry.annotation : undefined;
}

/** Whether a stored value names a kind of annotation this version knows, whether or not the rest of it parses. */
function hasKnownKind(value: unknown): boolean {
  const kind = typeof value === "object" && value !== null && "kind" in value ? value.kind : undefined;
  return Annotation.options.some((option) => option.shape.kind.safeParse(kind).success);
}

/**
 * Library layout on storage:
 *   library.json
 *   planner.json, tasks.json
 *   subjects/<subjectId>/subject.json
 *   subjects/<subjectId>/lectures/<lectureId>/{lecture.json, lecture.pdf, annotations.json, notes.json, text.json}
 *
 * Every write parses the full record before storing it, and every read parses the stored JSON.
 */
export class Library {
  private readonly storage: Storage;
  private readonly clock: () => Date;
  private noteWrites: Promise<unknown> = Promise.resolve();

  constructor(storage: Storage, options: LibraryOptions = {}) {
    this.storage = storage;
    this.clock = options.now ?? (() => new Date());
  }

  async init(): Promise<void> {
    const existing = await this.readJson("library.json", LibraryFile);
    if (existing === undefined) {
      await this.writeJson("library.json", { version: 1 });
    }
  }

  async listSubjects(): Promise<Subject[]> {
    const subjects: Subject[] = [];
    for (const name of await this.storage.list("subjects")) {
      const subject = await this.readJson(`${subjectDir(name)}/subject.json`, Subject);
      if (subject !== undefined) {
        subjects.push(subject);
      }
    }
    return subjects.sort(byId);
  }

  async getSubject(id: string): Promise<Subject> {
    const subjectId = lookupId(SubjectId, id, "Subject");
    const subject = await this.readJson(`${subjectDir(subjectId)}/subject.json`, Subject);
    if (subject === undefined) {
      throw new NotFoundError("Subject", id);
    }
    return subject;
  }

  async createSubject(input: SubjectInput): Promise<Subject> {
    const subject = Subject.parse({
      id: newId(),
      name: input.name,
      color: input.color ?? DEFAULT_SUBJECT_COLOR,
      createdAt: this.timestamp(),
    });
    await this.writeJson(`${subjectDir(subject.id)}/subject.json`, subject);
    return subject;
  }

  async updateSubject(id: string, patch: SubjectPatch): Promise<Subject> {
    const current = await this.getSubject(id);
    const subject = Subject.parse({
      ...current,
      name: patch.name ?? current.name,
      color: patch.color ?? current.color,
    });
    await this.writeJson(`${subjectDir(current.id)}/subject.json`, subject);
    return subject;
  }

  /** Deletes the subject with its lectures and planner cards. Tasks that linked to them lose those links. */
  async deleteSubject(id: string): Promise<void> {
    const subject = await this.getSubject(id);
    const lectureIds = new Set((await this.listLectures(subject.id)).map((lecture) => lecture.id));
    await this.unlinkTasks(subject.id, lectureIds);
    const cards = await this.listPlannerCards();
    await this.writeJson(
      "planner.json",
      cards.filter((card) => card.subjectId !== subject.id),
    );
    await this.storage.remove(subjectDir(subject.id));
  }

  async listLectures(subjectId?: string): Promise<Lecture[]> {
    const subjectIds =
      subjectId === undefined
        ? await this.storage.list("subjects")
        : [(await this.getSubject(subjectId)).id];
    const lectures: Lecture[] = [];
    for (const sid of subjectIds) {
      for (const lid of await this.storage.list(`${subjectDir(sid)}/lectures`)) {
        const lecture = await this.readJson(`${subjectDir(sid)}/lectures/${lid}/lecture.json`, Lecture);
        if (lecture !== undefined) {
          lectures.push(lecture);
        }
      }
    }
    return lectures.sort(byId);
  }

  async getLecture(id: string): Promise<Lecture> {
    return (await this.locateLecture(id)).lecture;
  }

  async importLecture(
    subjectId: string,
    title: string,
    pdf: Uint8Array,
    pageCount: number,
    date?: string,
  ): Promise<Lecture> {
    const subject = await this.getSubject(subjectId);
    const timestamp = this.timestamp();
    const lecture = Lecture.parse({
      id: newId(),
      subjectId: subject.id,
      title,
      date,
      pageCount,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (!isPdf(pdf)) {
      throw new InvalidError("The file is not a PDF.");
    }
    const dir = lectureDir(subject.id, lecture.id);
    await this.storage.writeBytes(`${dir}/lecture.pdf`, pdf);
    await this.writeJson(`${dir}/lecture.json`, lecture);
    return lecture;
  }

  async updateLecture(id: string, patch: LecturePatch): Promise<Lecture> {
    const { lecture, dir } = await this.locateLecture(id);
    const next = Lecture.parse({
      ...lecture,
      title: patch.title ?? lecture.title,
      date: resolveOptional(lecture.date, patch.date),
      updatedAt: this.timestamp(),
    });
    await this.writeJson(`${dir}/lecture.json`, next);
    return next;
  }

  /** Deletes the lecture with its PDF, annotations, notes, and text. Tasks that linked to it lose the link. */
  async deleteLecture(id: string): Promise<void> {
    const { lecture, dir } = await this.locateLecture(id);
    await this.unlinkTasks(undefined, new Set([lecture.id]));
    await this.storage.remove(dir);
  }

  async getPdf(id: string): Promise<Uint8Array> {
    const { dir } = await this.locateLecture(id);
    const bytes = await this.storage.readBytes(`${dir}/lecture.pdf`);
    if (bytes === undefined) {
      throw new NotFoundError("PDF", id);
    }
    return bytes;
  }

  async listAnnotations(lectureId: string): Promise<Annotation[]> {
    const { dir } = await this.locateLecture(lectureId);
    return this.readAnnotations(dir);
  }

  async addAnnotation(lectureId: string, draft: AnnotationDraft): Promise<Annotation> {
    const { lecture, dir } = await this.locateLecture(lectureId);
    const annotation = Annotation.parse({ ...draft, id: newId() });
    assertPageInRange(annotation.page, lecture.pageCount);
    const stored = await this.readStored(dir);
    await this.writeStored(dir, [...stored, { annotation }]);
    return annotation;
  }

  /** Writes a whole annotation under its own id, replacing the stored one or adding it. */
  async setAnnotation(lectureId: string, annotation: Annotation): Promise<Annotation> {
    const { lecture, dir } = await this.locateLecture(lectureId);
    const next = Annotation.parse(annotation);
    assertPageInRange(next.page, lecture.pageCount);
    const stored = await this.readStored(dir);
    const replaces = stored.some((entry) => annotationOf(entry)?.id === next.id);
    await this.writeStored(
      dir,
      replaces
        ? stored.map((entry) => (annotationOf(entry)?.id === next.id ? { annotation: next } : entry))
        : [...stored, { annotation: next }],
    );
    return next;
  }

  async updateAnnotation(
    lectureId: string,
    annotationId: string,
    patch: AnnotationPatch,
  ): Promise<Annotation> {
    const { lecture, dir } = await this.locateLecture(lectureId);
    const stored = await this.readStored(dir);
    const current = stored.map(annotationOf).find((annotation) => annotation?.id === annotationId);
    if (current === undefined) {
      throw new NotFoundError("Annotation", annotationId);
    }
    const next = Annotation.parse(mergeDefined(current, patch));
    assertPageInRange(next.page, lecture.pageCount);
    await this.writeStored(
      dir,
      stored.map((entry) => (annotationOf(entry)?.id === annotationId ? { annotation: next } : entry)),
    );
    return next;
  }

  async removeAnnotation(lectureId: string, annotationId: string): Promise<void> {
    const { dir } = await this.locateLecture(lectureId);
    const stored = await this.readStored(dir);
    const remaining = stored.filter((entry) => annotationOf(entry)?.id !== annotationId);
    if (remaining.length === stored.length) {
      throw new NotFoundError("Annotation", annotationId);
    }
    await this.writeStored(dir, remaining);
  }

  /** Every non-empty page note of a material, in page order. */
  async listPageNotes(lectureId: string): Promise<PageNote[]> {
    const { dir } = await this.locateLecture(lectureId);
    return this.readPageNotes(dir);
  }

  /** The note on one page, or "" when the page has none. */
  async getPageNote(lectureId: string, page: number): Promise<string> {
    const target = await this.locatePage(lectureId, page);
    return (await this.readPageNotes(target.dir)).find((note) => note.page === target.page)?.text ?? "";
  }

  /** Sets the note on one page. An empty note removes it. The notes on other pages stay as they are. */
  async setPageNote(lectureId: string, page: number, markdown: string): Promise<void> {
    const target = await this.locatePage(lectureId, page);
    await this.editPageNote(target, () => markdown);
  }

  async appendPageNote(lectureId: string, page: number, markdown: string): Promise<void> {
    const target = await this.locatePage(lectureId, page);
    // Appending nothing changes nothing, so the files are not touched.
    if (isBlankNote(markdown)) return;
    await this.editPageNote(target, (current) => {
      const separator = current === "" || current.endsWith("\n") ? "" : "\n";
      return `${current}${separator}${markdown}`;
    });
  }

  async getPdfText(lectureId: string): Promise<string[] | undefined> {
    const { dir } = await this.locateLecture(lectureId);
    return this.readPdfText(dir);
  }

  /** Caches the text of each page, index 0 is page 1. Must hold one entry per page. */
  async setPdfText(lectureId: string, pages: readonly string[]): Promise<void> {
    const { lecture, dir } = await this.locateLecture(lectureId);
    if (pages.length !== lecture.pageCount) {
      throw new InvalidError(
        `Expected text for ${lecture.pageCount} pages, got ${pages.length}.`,
      );
    }
    await this.writeJson(`${dir}/text.json`, pages);
  }

  async listPlannerCards(): Promise<PlannerCard[]> {
    return (await this.readJson("planner.json", z.array(PlannerCard))) ?? [];
  }

  async createPlannerCard(input: PlannerCardInput): Promise<PlannerCard> {
    const subject = await this.getSubject(input.subjectId);
    const card = PlannerCard.parse({ ...input, id: newId(), subjectId: subject.id });
    await this.writeJson("planner.json", [...(await this.listPlannerCards()), card]);
    return card;
  }

  async updatePlannerCard(id: string, patch: PlannerCardPatch): Promise<PlannerCard> {
    const cards = await this.listPlannerCards();
    const current = cards.find((card) => card.id === id);
    if (current === undefined) {
      throw new NotFoundError("Planner card", id);
    }
    if (patch.subjectId !== undefined) {
      await this.getSubject(patch.subjectId);
    }
    const next = PlannerCard.parse({
      ...current,
      subjectId: patch.subjectId ?? current.subjectId,
      day: patch.day ?? current.day,
      start: patch.start ?? current.start,
      end: patch.end ?? current.end,
      location: resolveOptional(current.location, patch.location),
    });
    await this.writeJson(
      "planner.json",
      cards.map((card) => (card.id === id ? next : card)),
    );
    return next;
  }

  async removePlannerCard(id: string): Promise<void> {
    const cards = await this.listPlannerCards();
    const remaining = cards.filter((card) => card.id !== id);
    if (remaining.length === cards.length) {
      throw new NotFoundError("Planner card", id);
    }
    await this.writeJson("planner.json", remaining);
  }

  /** Tasks sorted by status (To do, Doing, Done), then by `order`. */
  async listTasks(): Promise<Task[]> {
    const statuses = TaskStatus.options;
    return (await this.readTasks()).sort(
      (a, b) =>
        statuses.indexOf(a.status) - statuses.indexOf(b.status) || a.order - b.order,
    );
  }

  async createTask(input: TaskInput): Promise<Task> {
    const tasks = await this.readTasks();
    const status = input.status ?? "todo";
    const task = Task.parse({
      id: newId(),
      title: input.title,
      status,
      order: nextOrder(tasks, status),
      subjectId: input.subjectId,
      lectureId: input.lectureId,
      due: input.due,
    });
    await this.checkTaskLinks(task);
    await this.writeJson("tasks.json", [...tasks, task]);
    return task;
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task> {
    const tasks = await this.readTasks();
    const current = tasks.find((task) => task.id === id);
    if (current === undefined) {
      throw new NotFoundError("Task", id);
    }
    const status = patch.status ?? current.status;
    const otherTasks = tasks.filter((other) => other.id !== id);
    const order =
      patch.order ?? (status === current.status ? current.order : nextOrder(otherTasks, status));
    const task = Task.parse({
      ...current,
      title: patch.title ?? current.title,
      status,
      order,
      subjectId: resolveOptional(current.subjectId, patch.subjectId),
      lectureId: resolveOptional(current.lectureId, patch.lectureId),
      due: resolveOptional(current.due, patch.due),
    });
    await this.checkTaskLinks(task);
    await this.writeJson(
      "tasks.json",
      tasks.map((other) => (other.id === id ? task : other)),
    );
    return task;
  }

  async removeTask(id: string): Promise<void> {
    const tasks = await this.readTasks();
    const remaining = tasks.filter((task) => task.id !== id);
    if (remaining.length === tasks.length) {
      throw new NotFoundError("Task", id);
    }
    await this.writeJson("tasks.json", remaining);
  }

  /**
   * Ranks lectures for a phrase like "Lecture 1 in Digital Systems". A lecture number in the
   * query must appear in the lecture title. Other words match subject name and title, with
   * prefix and small typo tolerance.
   */
  async findLecture(query: string): Promise<LectureMatch[]> {
    const subjects = await this.listSubjects();
    const lectures = await this.listLectures();
    return rankLectures(query, subjects, lectures);
  }

  /** Case-insensitive substring search over subject names, material titles, page notes, text boxes, and PDF text. */
  async search(query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return [];
    }

    const hits: SearchHit[] = [];
    for (const subject of await this.listSubjects()) {
      const snippet = matchSnippet(subject.name, needle);
      if (snippet !== undefined) {
        hits.push({ kind: "subject", subjectId: subject.id, snippet });
      }
    }

    for (const lecture of await this.listLectures()) {
      try {
        hits.push(...(await this.searchLecture(lecture, needle, options)));
      } catch (error) {
        // A material whose files cannot be read is left out, and the rest of the library is still searched.
        console.warn(`Lecture ${lecture.id} was left out of the search`, error);
      }
    }
    return hits;
  }

  private async searchLecture(lecture: Lecture, needle: string, options: SearchOptions): Promise<SearchHit[]> {
    const dir = lectureDir(lecture.subjectId, lecture.id);
    const where = { subjectId: lecture.subjectId, lectureId: lecture.id };
    const hits: SearchHit[] = [];

    const titleSnippet = matchSnippet(lecture.title, needle);
    if (titleSnippet !== undefined) {
      hits.push({ kind: "lecture", ...where, snippet: titleSnippet });
    }

    for (const note of await this.readNotesForSearch(dir)) {
      const snippet = matchSnippet(note.text, needle);
      if (snippet !== undefined) {
        hits.push({ kind: "notes", ...where, page: note.page, snippet });
      }
    }

    for (const annotation of await this.readAnnotations(dir)) {
      if (annotation.kind !== "text") {
        continue;
      }
      const snippet = matchSnippet(annotation.text, needle);
      if (snippet !== undefined) {
        hits.push({
          kind: "annotation",
          ...where,
          annotationId: annotation.id,
          page: annotation.page,
          snippet,
        });
      }
    }

    const pages = options.pdfText ? await options.pdfText(lecture.id) : await this.readPdfText(dir);
    for (const [index, text] of (pages ?? []).entries()) {
      const snippet = matchSnippet(text, needle);
      if (snippet !== undefined) {
        hits.push({ kind: "pdf", ...where, page: index + 1, snippet });
      }
    }
    return hits;
  }

  private async locateLecture(id: string): Promise<LocatedLecture> {
    const lectureId = lookupId(LectureId, id, "Lecture");
    for (const subjectKey of await this.storage.list("subjects")) {
      const dir = lectureDir(subjectKey, lectureId);
      const lecture = await this.readJson(`${dir}/lecture.json`, Lecture);
      if (lecture !== undefined) {
        return { lecture, dir };
      }
    }
    throw new NotFoundError("Lecture", id);
  }

  private async checkTaskLinks(task: Task): Promise<void> {
    if (task.subjectId !== undefined) {
      await this.getSubject(task.subjectId);
    }
    if (task.lectureId === undefined) {
      return;
    }
    const { lecture } = await this.locateLecture(task.lectureId);
    if (task.subjectId !== undefined && task.subjectId !== lecture.subjectId) {
      throw new InvalidError("That lecture belongs to a different subject.");
    }
  }

  private async unlinkTasks(
    deletedSubjectId: string | undefined,
    deletedLectureIds: ReadonlySet<string>,
  ): Promise<void> {
    const tasks = await this.readTasks();
    const unlinked = tasks.map((task) => {
      const subjectGone = deletedSubjectId !== undefined && task.subjectId === deletedSubjectId;
      const lectureGone = task.lectureId !== undefined && deletedLectureIds.has(task.lectureId);
      if (!subjectGone && !lectureGone) {
        return task;
      }
      return {
        ...task,
        subjectId: subjectGone ? undefined : task.subjectId,
        lectureId: lectureGone ? undefined : task.lectureId,
      };
    });
    await this.writeJson("tasks.json", unlinked);
  }

  private async readTasks(): Promise<Task[]> {
    return (await this.readJson("tasks.json", z.array(Task))) ?? [];
  }

  private async readAnnotations(dir: string): Promise<Annotation[]> {
    const annotations: Annotation[] = [];
    for (const entry of await this.readStored(dir)) {
      const annotation = annotationOf(entry);
      if (annotation !== undefined) {
        annotations.push(annotation);
      }
    }
    return annotations;
  }

  /**
   * Every entry of annotations.json, in order. An entry of a kind this version does not know, such as one a
   * newer version added, is skipped with a warning and kept in the file, so a write does not lose it. An entry
   * of a known kind must still parse, so a damaged annotation fails the list rather than vanishing.
   */
  private async readStored(dir: string): Promise<StoredAnnotation[]> {
    const path = `${dir}/annotations.json`;
    const values = (await this.readJson(path, z.array(z.unknown()))) ?? [];
    return values.map((value): StoredAnnotation => {
      if (!hasKnownKind(value)) {
        console.warn(`An annotation of an unknown kind in ${path} is not shown. It is kept in the file.`);
        return { unknown: value };
      }
      return { annotation: Annotation.parse(value) };
    });
  }

  private async writeStored(dir: string, entries: readonly StoredAnnotation[]): Promise<void> {
    await this.writeJson(
      `${dir}/annotations.json`,
      entries.map((entry) => ("annotation" in entry ? entry.annotation : entry.unknown)),
    );
  }

  /**
   * Notes are in notes.json. A material saved before per-page notes has a single notes.md, and its text is page 1.
   * That file is read only while notes.json does not exist. It is never written or removed, so older builds still find it.
   * A notes.json that does not parse, or has a version this build does not know, throws UnreadableNotesError. Its
   * notes are not treated as empty, and every write goes through this read, so none can overwrite it.
   */
  private async readPageNotes(dir: string): Promise<PageNote[]> {
    let stored: PageNotes | undefined;
    try {
      stored = await this.readJson(`${dir}/notes.json`, PageNotes);
    } catch (error) {
      if (error instanceof InvalidError || error instanceof z.ZodError) throw new UnreadableNotesError();
      throw error;
    }
    if (stored !== undefined) {
      return Object.entries(stored.pages)
        .map(([page, text]) => ({ page: Number(page), text }))
        .filter((note) => !isBlankNote(note.text))
        .sort(byPage);
    }
    const legacy = await this.storage.readText(`${dir}/notes.md`);
    return legacy === undefined || isBlankNote(legacy) ? [] : [{ page: 1, text: legacy }];
  }

  /** The notes a search reads. Notes that cannot be read are skipped, so the rest of the material is still searched. */
  private async readNotesForSearch(dir: string): Promise<PageNote[]> {
    try {
      return await this.readPageNotes(dir);
    } catch (error) {
      if (!(error instanceof UnreadableNotesError)) throw error;
      console.warn(`The notes in ${dir} were left out of the search`, error);
      return [];
    }
  }

  private async locatePage(lectureId: string, page: number): Promise<NotePage> {
    const { lecture, dir } = await this.locateLecture(lectureId);
    const target = PageNumber.parse(page);
    assertPageInRange(target, lecture.pageCount);
    return { dir, page: target };
  }

  /**
   * Rewrites one page's note from its current text. Writes run one at a time: each reads all of notes.json
   * and writes it back, so two overlapping edits to different pages would otherwise drop one of them.
   */
  private editPageNote(target: NotePage, change: (current: string) => string): Promise<void> {
    const run = this.noteWrites.then(async () => {
      const notes = await this.readPageNotes(target.dir);
      const current = notes.find((note) => note.page === target.page)?.text ?? "";
      const others = notes.filter((note) => note.page !== target.page);
      const edited = change(current);
      const text = isBlankNote(edited) ? "" : edited;
      // An edit that leaves the page as it was does not write notes.json, so a legacy notes.md is not converted by it.
      if (text === current) return;
      const next = text === "" ? others : [...others, { page: target.page, text }];
      const pages = Object.fromEntries(next.sort(byPage).map((note) => [String(note.page), note.text]));
      await this.writeJson(`${target.dir}/notes.json`, PageNotes.parse({ version: 1, pages }));
    });
    this.noteWrites = run.catch(() => undefined);
    return run;
  }

  private async readPdfText(dir: string): Promise<string[] | undefined> {
    return this.readJson(`${dir}/text.json`, PDF_TEXT);
  }

  private async readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
    const text = await this.storage.readText(path);
    if (text === undefined) {
      return undefined;
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new InvalidError(`${path} is not valid JSON.`);
    }
    return schema.parse(value);
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await this.storage.writeText(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  private timestamp(): string {
    return this.clock().toISOString();
  }
}

const subjectDir = (subjectId: string): string => `subjects/${subjectId}`;

const lectureDir = (subjectId: string, lectureId: string): string =>
  `${subjectDir(subjectId)}/lectures/${lectureId}`;

function lookupId<S extends z.ZodType<string>>(schema: S, value: string, entity: string): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new NotFoundError(entity, value);
  }
  return parsed.data;
}

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A note of only spaces and line breaks is no note. It is not stored, marked, or searched. */
function isBlankNote(text: string): boolean {
  return text.trim() === "";
}

function byPage(a: { readonly page: number }, b: { readonly page: number }): number {
  return a.page - b.page;
}

function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, PDF_HEADER.length)) === PDF_HEADER;
}

/** `undefined` keeps the current value. `null` clears it. */
function resolveOptional<T>(current: T | undefined, patch: T | null | undefined): T | undefined {
  if (patch === undefined) {
    return current;
  }
  return patch ?? undefined;
}

function mergeDefined(current: object, patch: object): unknown {
  return {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
  };
}

function nextOrder(tasks: readonly Task[], status: TaskStatus): number {
  const orders = tasks.filter((task) => task.status === status).map((task) => task.order);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

function assertPageInRange(page: number, pageCount: number): void {
  if (page > pageCount) {
    throw new InvalidError(`Page ${page} is outside this lecture's ${pageCount} pages.`);
  }
}
