import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { InvalidError, NotFoundError, UnreadableNotesError } from "./errors.js";
import { AnnotationId } from "./ids.js";
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
      await library.setPageNote(lecture.id, 1, "notes");

      await library.deleteLecture(lecture.id);

      expect(await library.listLectures()).toEqual([]);
      await expect(library.getPdf(lecture.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(library.getPageNote(lecture.id, 1)).rejects.toBeInstanceOf(NotFoundError);
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

    it("keeps the size, style, and colour of a text box when the library is opened again", async () => {
      const lecture = await importSampleLecture();
      const box = await library.addAnnotation(lecture.id, {
        kind: "text",
        page: 1,
        author: "user",
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.1,
        text: "Formatted",
        fontSize: 24,
        color: "#a3321f",
        bold: true,
        italic: false,
        underline: true,
      });

      const reopened = new Library(env.open(), { now: () => CLOCK });
      expect(await reopened.listAnnotations(lecture.id)).toEqual([box]);
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

    it("writes a whole annotation under its id, replacing the stored one or adding it", async () => {
      const lecture = await importSampleLecture();
      const box = {
        id: AnnotationId.parse("01TEXTBOX00000000000000000"),
        kind: "text" as const,
        page: 1,
        author: "user" as const,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.05,
        text: "first",
        fontSize: 12,
        color: "#000000",
      };

      await library.setAnnotation(lecture.id, box);
      expect(await library.listAnnotations(lecture.id)).toEqual([box]);

      await library.setAnnotation(lecture.id, { ...box, text: "second", page: 3 });
      expect(await library.listAnnotations(lecture.id)).toEqual([{ ...box, text: "second", page: 3 }]);
      await expect(library.setAnnotation(lecture.id, { ...box, page: 4 })).rejects.toBeInstanceOf(InvalidError);
    });

    it("keeps the opacity of a translucent stroke", async () => {
      const lecture = await importSampleLecture();
      const stroke = await library.addAnnotation(lecture.id, {
        kind: "ink",
        page: 1,
        author: "user",
        points: [[0.1, 0.1, 0.5]],
        color: "#eab308",
        size: 10,
        opacity: 0.35,
      });

      expect(await library.listAnnotations(lecture.id)).toEqual([stroke]);
      expect(stroke).toMatchObject({ opacity: 0.35 });
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

    it("keeps a highlight's boxes, text, and colour", async () => {
      const lecture = await importSampleLecture();
      const highlight = await library.addAnnotation(lecture.id, {
        kind: "highlight",
        page: 2,
        author: "user",
        rects: [
          { x: 0.1, y: 0.2, width: 0.4, height: 0.03 },
          { x: 0.1, y: 0.24, width: 0.25, height: 0.03 },
        ],
        text: "Full adder circuit",
        color: "#a8701b",
      });

      const reopened = new Library(env.open(), { now: () => CLOCK });
      expect(await reopened.listAnnotations(lecture.id)).toEqual([highlight]);
      expect(highlight).toMatchObject({ kind: "highlight", text: "Full adder circuit", rects: expect.any(Array) });
    });

    it("rejects a highlight with no boxes or no text", async () => {
      const lecture = await importSampleLecture();
      const highlight = {
        kind: "highlight" as const,
        page: 1,
        author: "user" as const,
        rects: [{ x: 0, y: 0, width: 0.1, height: 0.1 }],
        text: "Gates",
        color: "#a8701b",
      };

      await expect(library.addAnnotation(lecture.id, { ...highlight, rects: [] })).rejects.toBeInstanceOf(ZodError);
      await expect(library.addAnnotation(lecture.id, { ...highlight, text: "  " })).rejects.toBeInstanceOf(ZodError);
    });

    it("rejects a highlight box with no area, which could never be seen", async () => {
      const lecture = await importSampleLecture();
      const flat = { x: 0.5, y: 0.5, width: 0, height: 0.1 };

      await expect(
        library.addAnnotation(lecture.id, {
          kind: "highlight",
          page: 1,
          author: "user",
          rects: [flat],
          text: "Gates",
          color: "#ffd21f",
        }),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it("rejects a highlight on a page the lecture does not have", async () => {
      const lecture = await importSampleLecture();
      await expect(
        library.addAnnotation(lecture.id, {
          kind: "highlight",
          page: 4,
          author: "user",
          rects: [{ x: 0, y: 0, width: 0.1, height: 0.1 }],
          text: "too far",
          color: "#a8701b",
        }),
      ).rejects.toBeInstanceOf(InvalidError);
    });

    it("reads annotations written before highlights existed", async () => {
      const lecture = await importSampleLecture();
      const [subject] = await library.listSubjects();
      if (subject === undefined) throw new Error("the sample lecture has no subject");
      const text = {
        id: "01OLDTEXTBOX0000000000000",
        kind: "text",
        page: 1,
        author: "user",
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.1,
        text: "Written by an older version",
        fontSize: 12,
        color: "#111111",
      };
      const stroke = {
        id: "01OLDINK00000000000000000",
        kind: "ink",
        page: 2,
        author: "user",
        points: [[0.2, 0.2, 0.5]],
        color: "#2b4b78",
        size: 2,
      };
      await env
        .open()
        .writeText(`subjects/${subject.id}/lectures/${lecture.id}/annotations.json`, JSON.stringify([text, stroke]));

      expect(await library.listAnnotations(lecture.id)).toEqual([text, stroke]);
    });

    it("skips an annotation of a kind it does not know, and keeps it in the file when another is added", async () => {
      const lecture = await importSampleLecture();
      const [subject] = await library.listSubjects();
      if (subject === undefined) throw new Error("the sample lecture has no subject");
      const path = `subjects/${subject.id}/lectures/${lecture.id}/annotations.json`;
      const future = { id: "01FUTUREKIND0000000000000", kind: "shape", page: 1, author: "user", sides: 4 };
      const stroke = {
        id: "01KNOWNINK000000000000000",
        kind: "ink",
        page: 1,
        author: "user",
        points: [[0.2, 0.2, 0.5]],
        color: "#2b4b78",
        size: 2,
      };
      await env.open().writeText(path, JSON.stringify([future, stroke]));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(await library.listAnnotations(lecture.id)).toEqual([stroke]);
      expect(warn).toHaveBeenCalled();

      const highlight = await library.addAnnotation(lecture.id, {
        kind: "highlight",
        page: 1,
        author: "ai",
        rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.03 }],
        text: "Gates",
        color: "#ffd21f",
      });
      const onDisk: unknown = JSON.parse((await env.open().readText(path)) ?? "[]");
      expect(onDisk).toEqual([future, stroke, highlight]);
      warn.mockRestore();
    });

    it("still fails the list when an annotation of a known kind is damaged", async () => {
      const lecture = await importSampleLecture();
      const [subject] = await library.listSubjects();
      if (subject === undefined) throw new Error("the sample lecture has no subject");
      const damaged = { id: "01DAMAGEDTEXT000000000000", kind: "text", page: 1, author: "user", x: 3 };
      await env
        .open()
        .writeText(`subjects/${subject.id}/lectures/${lecture.id}/annotations.json`, JSON.stringify([damaged]));

      await expect(library.listAnnotations(lecture.id)).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe("search", () => {
    it("finds a phrase in notes, text boxes, and PDF text across the library", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 2);
      await library.setPdfText(lecture.id, ["Full adder circuit", "Flip-flops"]);
      await library.setPageNote(lecture.id, 2, "Revise the full adder.");
      await library.addAnnotation(lecture.id, {
        kind: "text",
        page: 1,
        author: "user",
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.1,
        text: "full adder by hand",
        fontSize: 12,
        color: "#111111",
      });

      const hits = await library.search("full adder");

      expect(hits.map((hit) => hit.kind).sort()).toEqual(["annotation", "notes", "pdf"]);
      expect(hits.find((hit) => hit.kind === "notes")).toMatchObject({ page: 2 });
    });

    it("leaves out a lecture whose files cannot be read, and searches the rest", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const broken = await library.importLecture(subject.id, "Broken", pdfBytes("a"), 1);
      const sound = await library.importLecture(subject.id, "Sound", pdfBytes("b"), 1);
      await library.setPdfText(sound.id, ["Full adder circuit"]);
      await env.open().writeText(`subjects/${subject.id}/lectures/${broken.id}/text.json`, "not json");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const hits = await library.search("full adder");

      expect(hits).toEqual([expect.objectContaining({ kind: "pdf", lectureId: sound.id, page: 1 })]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe("page notes", () => {
    async function importThreePageLecture() {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 3);
      return { subject, lecture, dir: `subjects/${subject.id}/lectures/${lecture.id}` };
    }

    it("has no notes for a new material", async () => {
      const { lecture } = await importThreePageLecture();
      expect(await library.listPageNotes(lecture.id)).toEqual([]);
      expect(await library.getPageNote(lecture.id, 1)).toBe("");
    });

    it("keeps each page's note apart and lists the notes in page order", async () => {
      const { lecture } = await importThreePageLecture();

      await library.setPageNote(lecture.id, 3, "Flip-flops");
      await library.setPageNote(lecture.id, 1, "Gates");

      expect(await library.listPageNotes(lecture.id)).toEqual([
        { page: 1, text: "Gates" },
        { page: 3, text: "Flip-flops" },
      ]);
      expect(await library.getPageNote(lecture.id, 2)).toBe("");
    });

    it("replaces a page's note, and an empty note removes it", async () => {
      const { lecture } = await importThreePageLecture();
      await library.setPageNote(lecture.id, 2, "first draft");
      await library.setPageNote(lecture.id, 2, "final");
      expect(await library.getPageNote(lecture.id, 2)).toBe("final");

      await library.setPageNote(lecture.id, 2, "");
      expect(await library.listPageNotes(lecture.id)).toEqual([]);
    });

    it("appends to one page's note on a new line", async () => {
      const { lecture } = await importThreePageLecture();

      await library.setPageNote(lecture.id, 2, "# Week 1\n- stacks");
      await library.appendPageNote(lecture.id, 2, "- queues");
      await library.appendPageNote(lecture.id, 3, "- trees");
      expect(await library.getPageNote(lecture.id, 2)).toBe("# Week 1\n- stacks\n- queues");
      expect(await library.getPageNote(lecture.id, 3)).toBe("- trees");
    });

    it("does not add an extra blank line when a note already ends in a newline", async () => {
      const { lecture } = await importThreePageLecture();

      await library.setPageNote(lecture.id, 1, "a\n");
      await library.appendPageNote(lecture.id, 1, "b");
      expect(await library.getPageNote(lecture.id, 1)).toBe("a\nb");
    });

    it("keeps notes when the library is opened again", async () => {
      const { lecture } = await importThreePageLecture();
      await library.setPageNote(lecture.id, 2, "kept");

      const reopened = new Library(env.open(), { now: () => CLOCK });
      expect(await reopened.getPageNote(lecture.id, 2)).toBe("kept");
    });

    it("rejects a page the material does not have", async () => {
      const { lecture } = await importThreePageLecture();

      await expect(library.setPageNote(lecture.id, 4, "too far")).rejects.toBeInstanceOf(InvalidError);
      await expect(library.getPageNote(lecture.id, 4)).rejects.toThrow("Page 4 is outside this lecture's 3 pages.");
      await expect(library.setPageNote(lecture.id, 0, "no page")).rejects.toBeInstanceOf(ZodError);
      expect(await library.listPageNotes(lecture.id)).toEqual([]);
    });

    it("keeps a note from before per-page notes as page 1, byte for byte", async () => {
      const { lecture, dir } = await importThreePageLecture();
      const legacy = "# Week 1\r\n- stacks\n\nÜnïcode and a trailing newline\n";
      await env.open().writeText(`${dir}/notes.md`, legacy);

      expect(await library.listPageNotes(lecture.id)).toEqual([{ page: 1, text: legacy }]);
      expect(await library.getPageNote(lecture.id, 1)).toBe(legacy);
    });

    it("treats an empty notes.md from before per-page notes as no note", async () => {
      const { lecture, dir } = await importThreePageLecture();
      await env.open().writeText(`${dir}/notes.md`, "");

      expect(await library.listPageNotes(lecture.id)).toEqual([]);
    });

    it("writes new notes to notes.json and leaves notes.md untouched", async () => {
      const { lecture, dir } = await importThreePageLecture();
      const legacy = "Old single note";
      await env.open().writeText(`${dir}/notes.md`, legacy);

      await library.setPageNote(lecture.id, 2, "New page note");

      expect(await env.open().readText(`${dir}/notes.md`)).toBe(legacy);
      expect(JSON.parse((await env.open().readText(`${dir}/notes.json`)) ?? "null")).toEqual({
        version: 1,
        pages: { "1": legacy, "2": "New page note" },
      });
      expect(await library.listPageNotes(lecture.id)).toEqual([
        { page: 1, text: legacy },
        { page: 2, text: "New page note" },
      ]);
    });

    it("does not bring a cleared legacy note back once notes.json exists", async () => {
      const { lecture, dir } = await importThreePageLecture();
      await env.open().writeText(`${dir}/notes.md`, "Old single note");

      await library.setPageNote(lecture.id, 1, "");

      const reopened = new Library(env.open(), { now: () => CLOCK });
      expect(await reopened.listPageNotes(lecture.id)).toEqual([]);
      expect(await env.open().readText(`${dir}/notes.md`)).toBe("Old single note");
    });

    it("treats a note of only spaces and line breaks as no note, and keeps none", async () => {
      const { lecture, dir } = await importThreePageLecture();
      await library.setPageNote(lecture.id, 2, "  \n\t ");
      expect(await library.listPageNotes(lecture.id)).toEqual([]);
      expect(await env.open().readText(`${dir}/notes.json`)).toBeUndefined();

      await library.setPageNote(lecture.id, 1, "Gates");
      await library.setPageNote(lecture.id, 1, " \n ");
      expect(await library.listPageNotes(lecture.id)).toEqual([]);

      await env.open().writeText(`${dir}/notes.md`, "\n  ");
      expect(await library.listPageNotes(lecture.id)).toEqual([]);
    });

    it("does not rewrite notes.json when an edit changes nothing", async () => {
      const { lecture, dir } = await importThreePageLecture();
      await library.setPageNote(lecture.id, 1, "Gates");
      const before = await env.open().readText(`${dir}/notes.json`);

      await library.appendPageNote(lecture.id, 1, "");
      await library.setPageNote(lecture.id, 1, "Gates");

      expect(await env.open().readText(`${dir}/notes.json`)).toBe(before);
      expect(await library.getPageNote(lecture.id, 1)).toBe("Gates");
    });

    it("keeps an append of nothing to a legacy note from creating notes.json", async () => {
      const { lecture, dir } = await importThreePageLecture();
      await env.open().writeText(`${dir}/notes.md`, "Old single note");

      await library.appendPageNote(lecture.id, 2, "");

      expect(await env.open().readText(`${dir}/notes.json`)).toBeUndefined();
      expect(await library.getPageNote(lecture.id, 1)).toBe("Old single note");
    });

    it("refuses to read a notes.json that is damaged, and never writes over it", async () => {
      const { lecture, dir } = await importThreePageLecture();
      const damaged = "{ not json";
      await env.open().writeText(`${dir}/notes.json`, damaged);

      await expect(library.listPageNotes(lecture.id)).rejects.toBeInstanceOf(UnreadableNotesError);
      await expect(library.setPageNote(lecture.id, 2, "New")).rejects.toBeInstanceOf(UnreadableNotesError);
      await expect(library.appendPageNote(lecture.id, 2, "New")).rejects.toBeInstanceOf(UnreadableNotesError);
      expect(await env.open().readText(`${dir}/notes.json`)).toBe(damaged);
    });

    it("refuses a notes.json written by a newer version, and leaves it as it is", async () => {
      const { lecture, dir } = await importThreePageLecture();
      const newer = JSON.stringify({ version: 2, pages: { "1": "From the future" }, layout: "grid" });
      await env.open().writeText(`${dir}/notes.json`, newer);

      await expect(library.getPageNote(lecture.id, 1)).rejects.toBeInstanceOf(UnreadableNotesError);
      await expect(library.setPageNote(lecture.id, 1, "Overwritten?")).rejects.toBeInstanceOf(UnreadableNotesError);
      expect(await env.open().readText(`${dir}/notes.json`)).toBe(newer);
    });

    it("searches the rest of a material when its notes.json cannot be read", async () => {
      const subject = await library.createSubject({ name: "Digital Systems" });
      const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("a"), 2);
      await library.setPdfText(lecture.id, ["Full adder circuit", "Flip-flops"]);
      await env.open().writeText(`subjects/${subject.id}/lectures/${lecture.id}/notes.json`, "{ not json");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const hits = await library.search("full adder");

      expect(hits).toEqual([expect.objectContaining({ kind: "pdf", lectureId: lecture.id, page: 1 })]);
      warn.mockRestore();
    });

    it("keeps every note when edits to different pages arrive together", async () => {
      const { lecture } = await importThreePageLecture();

      await Promise.all([
        library.setPageNote(lecture.id, 1, "one"),
        library.setPageNote(lecture.id, 2, "two"),
        library.appendPageNote(lecture.id, 3, "three"),
      ]);

      expect(await library.listPageNotes(lecture.id)).toEqual([
        { page: 1, text: "one" },
        { page: 2, text: "two" },
        { page: 3, text: "three" },
      ]);
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
