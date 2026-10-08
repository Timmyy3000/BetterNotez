import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { InvalidError, NotFoundError } from "./errors.js";
import { Library } from "./library.js";
import { CLOCK, decodeText, pdfBytes, storageBackends, type StorageEnv } from "./test/backends.js";

describe.each(storageBackends)("Library on $name", ({ create }) => {
  let env: StorageEnv;
  let library: Library;

  beforeEach(async () => {
    env = await create();
    library = new Library(env.open(), { now: () => CLOCK });
    await library.init();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  describe("subjects", () => {
    it("creates a subject with a generated id and the given name and color", async () => {
      const subject = await library.createSubject({ name: "Digital Systems", color: "#2563eb" });

      expect(subject.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      const { id: _id, ...rest } = subject;
      expect(rest).toEqual({
        name: "Digital Systems",
        color: "#2563eb",
        createdAt: "2026-10-08T09:00:00.000Z",
      });
      expect(await library.listSubjects()).toEqual([subject]);
    });

    it("gives a subject a valid color when none is given", async () => {
      const subject = await library.createSubject({ name: "Linear Algebra" });
      expect(subject.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("lists subjects in creation order", async () => {
      await library.createSubject({ name: "Digital Systems" });
      await library.createSubject({ name: "Algebra" });
      expect((await library.listSubjects()).map((subject) => subject.name)).toEqual([
        "Digital Systems",
        "Algebra",
      ]);
    });

    it("renames a subject and keeps its color", async () => {
      const subject = await library.createSubject({ name: "Digital Systems", color: "#2563eb" });
      const renamed = await library.updateSubject(subject.id, { name: "Digital Logic" });

      expect(renamed.name).toBe("Digital Logic");
      expect(renamed.color).toBe("#2563eb");
      expect(await library.getSubject(subject.id)).toEqual(renamed);
    });

    it("rejects a blank name", async () => {
      await expect(library.createSubject({ name: "   " })).rejects.toBeInstanceOf(ZodError);
    });

    it("reports unknown subject ids as not found, including path-like ids", async () => {
      await expect(library.getSubject("MISSING")).rejects.toBeInstanceOf(NotFoundError);
      await expect(library.getSubject("../subjects")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("deletes a subject with its lectures and planner cards", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("one"), 1);
      await library.createPlannerCard({
        subjectId: subject.id,
        day: 0,
        start: "09:00",
        end: "10:00",
      });

      await library.deleteSubject(subject.id);

      expect(await library.listSubjects()).toEqual([]);
      expect(await library.listLectures()).toEqual([]);
      expect(await library.listPlannerCards()).toEqual([]);
      await expect(library.getLecture(lecture.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("lectures", () => {
    it("imports a PDF with its title, page count, and date", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(
        subject.id,
        "Lecture 1: Logic gates",
        pdfBytes("slides"),
        3,
        "2026-10-07",
      );

      const { id: _id, createdAt: _created, updatedAt: _updated, ...rest } = lecture;
      expect(rest).toEqual({
        subjectId: subject.id,
        title: "Lecture 1: Logic gates",
        date: "2026-10-07",
        pageCount: 3,
      });
      expect(await library.getLecture(lecture.id)).toEqual(lecture);
    });

    it("returns the imported PDF bytes unchanged", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("slides"), 1);

      expect(decodeText(await library.getPdf(lecture.id))).toBe("%PDF-1.7\nslides\n%%EOF\n");
    });

    it("imports a lecture without a date", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("x"), 1);
      expect(lecture.date).toBeUndefined();
    });

    it("rejects a file that is not a PDF", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const notPdf = new TextEncoder().encode("PK\u0003\u0004 a zip file");

      await expect(library.importLecture(subject.id, "Lecture 1", notPdf, 1)).rejects.toThrow(
        "The file is not a PDF.",
      );
      expect(await library.listLectures()).toEqual([]);
    });

    it("rejects a date that is not a real calendar day", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      await expect(
        library.importLecture(subject.id, "Lecture 1", pdfBytes("x"), 1, "2026-02-30"),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it("refuses to import into an unknown subject", async () => {
      await expect(
        library.importLecture("MISSING", "Lecture 1", pdfBytes("x"), 1),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("lists a subject's lectures in import order", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      await library.importLecture(subject.id, "Lecture 1: Logic gates", pdfBytes("a"), 1);
      await library.importLecture(subject.id, "Lecture 2: Karnaugh maps", pdfBytes("b"), 1);

      const titles = (await library.listLectures(subject.id)).map((lecture) => lecture.title);
      expect(titles).toEqual(["Lecture 1: Logic gates", "Lecture 2: Karnaugh maps"]);
    });

    it("updates the title and sets or clears the date", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 1);

      const dated = await library.updateLecture(lecture.id, {
        title: "Lecture 1: Logic gates",
        date: "2026-10-14",
      });
      expect(dated.title).toBe("Lecture 1: Logic gates");
      expect(dated.date).toBe("2026-10-14");

      const cleared = await library.updateLecture(lecture.id, { date: null });
      expect(cleared.date).toBeUndefined();
      expect(cleared.title).toBe("Lecture 1: Logic gates");
      expect((await library.getLecture(lecture.id)).date).toBeUndefined();
    });

    it("deletes a lecture and everything stored with it", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 1);
      await library.setNotes(lecture.id, "notes");

      await library.deleteLecture(lecture.id);

      expect(await library.listLectures()).toEqual([]);
      await expect(library.getPdf(lecture.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(library.getNotes(lecture.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("annotations", () => {
    async function importSampleLecture() {
      const subject = await library.createSubject({ name: "Digital Systems" });
      return library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 3);
    }

    it("adds a text box and returns it with a generated id", async () => {
      const lecture = await importSampleLecture();
      const annotation = await library.addAnnotation(lecture.id, {
        kind: "text",
        page: 2,
        author: "user",
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.1,
        text: "Truth table for XOR",
        fontSize: 14,
        color: "#111111",
      });

      expect(annotation).toEqual({
        id: expect.any(String),
        kind: "text",
        page: 2,
        author: "user",
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.1,
        text: "Truth table for XOR",
        fontSize: 14,
        color: "#111111",
      });
      expect(await library.listAnnotations(lecture.id)).toEqual([annotation]);
    });

    it("adds an ink stroke with points of x, y, and pressure", async () => {
      const lecture = await importSampleLecture();
      const stroke = await library.addAnnotation(lecture.id, {
        kind: "ink",
        page: 1,
        author: "ai",
        points: [
          [0.1, 0.1, 0.5],
          [0.2, 0.25, 0.75],
        ],
        color: "#dc2626",
        size: 2,
      });

      expect(await library.listAnnotations(lecture.id)).toEqual([stroke]);
      expect(stroke).toMatchObject({ kind: "ink", author: "ai", points: [[0.1, 0.1, 0.5], [0.2, 0.25, 0.75]] });
    });

    it("moves and edits a text box without changing its other fields", async () => {
      const lecture = await importSampleLecture();
      const box = await library.addAnnotation(lecture.id, {
        kind: "text",
        page: 1,
        author: "user",
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.1,
        text: "draft",
        fontSize: 12,
        color: "#000000",
      });

      const updated = await library.updateAnnotation(lecture.id, box.id, {
        x: 0.5,
        text: "XOR truth table",
      });

      expect(updated).toEqual({ ...box, x: 0.5, text: "XOR truth table" });
      expect(await library.listAnnotations(lecture.id)).toEqual([updated]);
    });

    it("rejects a page that the lecture does not have", async () => {
      const lecture = await importSampleLecture();
      await expect(
        library.addAnnotation(lecture.id, {
          kind: "text",
          page: 4,
          author: "user",
          x: 0,
          y: 0,
          width: 0.1,
          height: 0.1,
          text: "too far",
          fontSize: 12,
          color: "#000000",
        }),
      ).rejects.toBeInstanceOf(InvalidError);
    });

    it("rejects coordinates outside the page", async () => {
      const lecture = await importSampleLecture();
      await expect(
        library.addAnnotation(lecture.id, {
          kind: "text",
          page: 1,
          author: "user",
          x: 1.5,
          y: 0,
          width: 0.1,
          height: 0.1,
          text: "off the page",
          fontSize: 12,
          color: "#000000",
        }),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it("removes an annotation and reports a second removal as not found", async () => {
      const lecture = await importSampleLecture();
      const box = await library.addAnnotation(lecture.id, {
        kind: "text",
        page: 1,
        author: "user",
        x: 0,
        y: 0,
        width: 0.1,
        height: 0.1,
        text: "gone soon",
        fontSize: 12,
        color: "#000000",
      });

      await library.removeAnnotation(lecture.id, box.id);

      expect(await library.listAnnotations(lecture.id)).toEqual([]);
      await expect(library.removeAnnotation(lecture.id, box.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("keeps annotations when the library is opened again", async () => {
      const lecture = await importSampleLecture();
      const stroke = await library.addAnnotation(lecture.id, {
        kind: "ink",
        page: 3,
        author: "user",
        points: [[0.4, 0.4, 1]],
        color: "#2563eb",
        size: 3,
      });

      const reopened = new Library(env.open(), { now: () => CLOCK });
      expect(await reopened.listAnnotations(lecture.id)).toEqual([stroke]);
    });
  });

  describe("notes", () => {
    it("reads empty notes for a new lecture", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 1);
      expect(await library.getNotes(lecture.id)).toBe("");
    });

    it("sets notes and appends to them on a new line", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 1);

      await library.setNotes(lecture.id, "# Week 1\n- stacks");
      await library.appendNotes(lecture.id, "- queues");
      expect(await library.getNotes(lecture.id)).toBe("# Week 1\n- stacks\n- queues");
    });

    it("does not add an extra blank line when notes already end in a newline", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 1);

      await library.setNotes(lecture.id, "a\n");
      await library.appendNotes(lecture.id, "b");
      expect(await library.getNotes(lecture.id)).toBe("a\nb");
    });
  });

  describe("PDF text cache", () => {
    it("is empty until text is cached", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 2);
      expect(await library.getPdfText(lecture.id)).toBeUndefined();
    });

    it("stores one entry per page, in page order", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 2);

      await library.setPdfText(lecture.id, ["Cover", "Full adder circuit"]);
      expect(await library.getPdfText(lecture.id)).toEqual(["Cover", "Full adder circuit"]);
    });

    it("rejects text whose page count does not match the lecture", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 2);

      await expect(library.setPdfText(lecture.id, ["only one page"])).rejects.toBeInstanceOf(
        InvalidError,
      );
    });
  });

  describe("planner", () => {
    async function subjectWithCard() {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const card = await library.createPlannerCard({
        subjectId: subject.id,
        day: 0,
        start: "09:00",
        end: "10:30",
        location: "Room 2",
      });
      return { subject, card };
    }

    it("creates a card in a day and time slot", async () => {
      const { subject, card } = await subjectWithCard();

      const { id: _id, ...rest } = card;
      expect(rest).toEqual({
        subjectId: subject.id,
        day: 0,
        start: "09:00",
        end: "10:30",
        location: "Room 2",
      });
      expect(await library.listPlannerCards()).toEqual([card]);
    });

    it("rejects a card that ends before it starts", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      await expect(
        library.createPlannerCard({ subjectId: subject.id, day: 2, start: "11:00", end: "10:00" }),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it("rejects a card for an unknown subject", async () => {
      await expect(
        library.createPlannerCard({ subjectId: "MISSING", day: 0, start: "09:00", end: "10:00" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("moves a card to another day and clears its location", async () => {
      const { card } = await subjectWithCard();

      const moved = await library.updatePlannerCard(card.id, { day: 2, location: null });

      expect(moved.day).toBe(2);
      expect(moved.location).toBeUndefined();
      expect(moved.start).toBe("09:00");
      expect(await library.listPlannerCards()).toEqual([moved]);
    });

    it("removes a card and reports a second removal as not found", async () => {
      const { card } = await subjectWithCard();

      await library.removePlannerCard(card.id);

      expect(await library.listPlannerCards()).toEqual([]);
      await expect(library.removePlannerCard(card.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("tasks", () => {
    it("adds new tasks to the end of the To do column", async () => {
      const first = await library.createTask({ title: "Read chapter 3" });
      const second = await library.createTask({ title: "Solve set 2" });

      expect(first).toMatchObject({ status: "todo", order: 0 });
      expect(second).toMatchObject({ status: "todo", order: 1 });
      expect((await library.listTasks()).map((task) => task.title)).toEqual([
        "Read chapter 3",
        "Solve set 2",
      ]);
    });

    it("moves a task to the end of another column and lists columns in board order", async () => {
      const read = await library.createTask({ title: "Read chapter 3" });
      await library.createTask({ title: "Solve set 2" });
      await library.createTask({ title: "Revise notes", status: "doing" });

      const moved = await library.updateTask(read.id, { status: "doing" });

      expect(moved).toMatchObject({ status: "doing", order: 1 });
      expect((await library.listTasks()).map((task) => task.title)).toEqual([
        "Solve set 2",
        "Revise notes",
        "Read chapter 3",
      ]);
    });

    it("links a task to a subject, a lecture, and a due date", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 1);

      const task = await library.createTask({
        title: "Review Lecture 1",
        subjectId: subject.id,
        lectureId: lecture.id,
        due: "2026-10-20",
      });

      expect(task.subjectId).toBe(subject.id);
      expect(task.lectureId).toBe(lecture.id);
      expect(task.due).toBe("2026-10-20");
    });

    it("rejects a lecture that belongs to a different subject", async () => {
      const digital = await library.createSubject({ name: "Digital Systems" });
      const algebra = await library.createSubject({ name: "Linear Algebra" });
      const lecture = await library.importLecture(digital.id, "Lecture 1", pdfBytes("a"), 1);

      await expect(
        library.createTask({ title: "Mismatch", subjectId: algebra.id, lectureId: lecture.id }),
      ).rejects.toBeInstanceOf(InvalidError);
    });

    it("clears a due date when the update sets it to null", async () => {
      const task = await library.createTask({ title: "Hand in lab", due: "2026-10-20" });

      const updated = await library.updateTask(task.id, { due: null, title: "Hand in lab report" });

      expect(updated.due).toBeUndefined();
      expect(updated.title).toBe("Hand in lab report");
    });

    it("removes a task and reports a second removal as not found", async () => {
      const task = await library.createTask({ title: "Temporary" });

      await library.removeTask(task.id);

      expect(await library.listTasks()).toEqual([]);
      await expect(library.removeTask(task.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("unlinks tasks from a deleted subject and lecture", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 1);
      await library.createTask({
        title: "Review Lecture 1",
        subjectId: subject.id,
        lectureId: lecture.id,
      });

      await library.deleteSubject(subject.id);

      const [task] = await library.listTasks();
      expect(task?.title).toBe("Review Lecture 1");
      expect(task?.subjectId).toBeUndefined();
      expect(task?.lectureId).toBeUndefined();
    });
  });
});
