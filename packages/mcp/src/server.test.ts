import { copyFile, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type Lecture, Library, type Subject } from "@betternotez/core";
import { NodeFsStorage } from "@betternotez/core/node";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "./server.js";

const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
const LOCKED_PDF = fileURLToPath(new URL("./fixtures/locked-lecture.pdf", import.meta.url));

let root: string;
let library: Library;
let server: ReturnType<typeof createServer>;
let client: Client;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "betternotez-mcp-"));
  library = new Library(new NodeFsStorage(root));
  await library.init();
  server = createServer(library);
  client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

async function callJson<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await call(name, args);
  expect(result.isError).not.toBe(true);
  return JSON.parse(textOf(result)) as T;
}

function textOf(result: CallToolResult): string {
  const [first] = result.content;
  return first?.type === "text" ? first.text : "";
}

async function readJsonFile(...parts: string[]): Promise<unknown> {
  return JSON.parse(await readFile(join(root, ...parts), "utf8"));
}

async function seedLecture(): Promise<{ subject: Subject; lecture: Lecture }> {
  const subject = await library.createSubject({ name: "Digital Systems" });
  const lecture = await library.importLecture(subject.id, "Lecture 1", PDF, 3);
  await library.setPdfText(lecture.id, ["Cover page", "Gates and truth tables", "Flip-flops"]);
  return { subject, lecture };
}

async function makePdf(pages: string[], family: StandardFonts = StandardFonts.Helvetica): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(family);
  for (const text of pages) {
    document.addPage([300, 200]).drawText(text, { x: 20, y: 100, size: 18, font });
  }
  return document.save();
}

async function snapshotFiles(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const name of await readdir(dir, { recursive: true })) {
    const path = join(dir, name);
    if ((await stat(path)).isFile()) {
      files[name] = (await readFile(path)).toString("base64");
    }
  }
  return files;
}

describe("tool surface", () => {
  it("offers the read, create, and edit tools and no tool that deletes or removes", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names.filter((name) => /^(delete|remove)_/.test(name))).toEqual([]);
    expect(names.sort()).toEqual([
      "add_highlight",
      "add_ink",
      "add_text_box",
      "create_planner_card",
      "create_subject",
      "create_task",
      "find_lecture",
      "get_lecture",
      "get_lecture_text",
      "import_lecture",
      "list_lectures",
      "list_planner",
      "list_subjects",
      "list_tasks",
      "request_deletion",
      "search",
      "update_annotation",
      "update_lecture",
      "update_notes",
      "update_planner_card",
      "update_subject",
      "update_task",
    ]);
  });
});

describe("Lecture 1 in Digital Systems", () => {
  it("is found, read, annotated, and tracked, and every change lands on disk", async () => {
    const { subject, lecture } = await seedLecture();
    const lectureId = lecture.id;

    const matches = await callJson<Array<{ lecture: Lecture }>>("find_lecture", {
      query: "Lecture 1 in Digital Systems",
    });
    expect(matches[0]?.lecture.id).toBe(lectureId);

    const details = await callJson<{ lecture: Lecture; notes: string; annotations: unknown[]; pdfTextCached: boolean }>(
      "get_lecture",
      { lectureId },
    );
    expect(details).toMatchObject({ notes: "", annotations: [], pdfTextCached: true });

    await callJson("update_notes", { lectureId, text: "Key idea: gates", mode: "append" });
    await callJson("update_notes", { lectureId, text: "Exam: truth tables" });
    expect(await readFile(join(root, "subjects", subject.id, "lectures", lectureId, "notes.md"), "utf8")).toBe(
      "Key idea: gates\nExam: truth tables",
    );

    await callJson("add_text_box", { lectureId, page: 2, x: 0.1, y: 0.2, text: "Check the truth table" });
    await callJson("add_ink", { lectureId, page: 2, points: [[0.1, 0.5], [0.2, 0.6, 0.9]] });
    expect(await readJsonFile("subjects", subject.id, "lectures", lectureId, "annotations.json")).toEqual([
      {
        id: expect.any(String),
        kind: "text",
        page: 2,
        author: "ai",
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.08,
        text: "Check the truth table",
        fontSize: 14,
        color: "#000000",
      },
      {
        id: expect.any(String),
        kind: "ink",
        page: 2,
        author: "ai",
        points: [
          [0.1, 0.5, 0.5],
          [0.2, 0.6, 0.9],
        ],
        color: "#000000",
        size: 2,
      },
    ]);

    await callJson("create_task", {
      title: "Review Lecture 1",
      subjectId: subject.id,
      lectureId,
      due: "2026-10-15",
    });
    expect(await readJsonFile("tasks.json")).toMatchObject([
      { title: "Review Lecture 1", status: "todo", subjectId: subject.id, lectureId, due: "2026-10-15" },
    ]);

    const hits = await callJson<Array<{ kind: string }>>("search", { query: "truth table" });
    expect(hits.map((hit) => hit.kind)).toEqual(["notes", "annotation", "pdf"]);
  });

  it("reads PDF text for a page range", async () => {
    const { lecture } = await seedLecture();

    const result = await callJson<{ pages: Array<{ page: number; text: string }> }>("get_lecture_text", {
      lectureId: lecture.id,
      fromPage: 2,
    });
    expect(result.pages).toEqual([
      { page: 2, text: "Gates and truth tables" },
      { page: 3, text: "Flip-flops" },
    ]);
  });

  it("moves a task between columns and keeps its title", async () => {
    const task = await callJson<{ id: string }>("create_task", { title: "Read chapter 3" });

    const moved = await callJson<{ title: string; status: string }>("update_task", {
      taskId: task.id,
      status: "doing",
    });
    expect(moved).toMatchObject({ title: "Read chapter 3", status: "doing" });

    const board = await callJson<Array<{ status: string }>>("list_tasks", { status: "doing" });
    expect(board.map((item) => item.status)).toEqual(["doing"]);
  });

  it("keeps a student's annotation as the student's when the AI edits it", async () => {
    const { lecture } = await seedLecture();
    const own = await library.addAnnotation(lecture.id, {
      kind: "text",
      author: "user",
      page: 1,
      x: 0.5,
      y: 0.5,
      width: 0.2,
      height: 0.1,
      text: "My note",
      fontSize: 12,
      color: "#111111",
    });

    const updated = await callJson<{ text: string; author: string }>("update_annotation", {
      lectureId: lecture.id,
      annotationId: own.id,
      patch: { text: "Revised note" },
    });
    expect(updated).toMatchObject({ text: "Revised note", author: "user" });
  });
});

describe("highlighting text", () => {
  /** A lecture whose PDF is real, so its text has positions for the highlight to use. */
  async function seedPdfLecture(pages: string[], family?: StandardFonts) {
    const subject = await library.createSubject({ name: "Digital Systems" });
    const lecture = await library.importLecture(subject.id, "Gates", await makePdf(pages, family), pages.length);
    return { subject, lecture };
  }

  it("boxes the phrase where the page draws it, as fractions of the page", async () => {
    const { subject, lecture } = await seedPdfLecture(["Gates and truth tables"]);

    const highlight = await callJson<{ kind: string; author: string; text: string; color: string; rects: unknown[] }>(
      "add_highlight",
      { lectureId: lecture.id, page: 1, text: "Gates" },
    );

    expect(highlight).toMatchObject({
      kind: "highlight",
      author: "ai",
      text: "Gates",
      color: "#ffd21f",
    });
    // The text starts 20 points from the left of a 300 point page and "Gates" is 48 points wide at 18 points.
    expect(highlight.rects).toHaveLength(1);
    const [box] = highlight.rects as Array<{ x: number; y: number; width: number; height: number }>;
    expect(box?.x).toBeCloseTo(20 / 300, 3);
    // Helvetica's "Gates" is 48 points wide. The five characters share the run's 177 points by count, so the box is
    // an estimate of 40 points. Within a run, a box is only as exact as its share of the run's length.
    expect(box?.width).toBeCloseTo(40.25 / 300, 2);
    // The line sits on a baseline at 100 points of a 200 point page, so its box runs from 114.4 to 96.4 points.
    expect(box?.y).toBeCloseTo((200 - 114.4) / 200, 3);
    expect(box?.height).toBeCloseTo(18 / 200, 3);

    expect(await readJsonFile("subjects", subject.id, "lectures", lecture.id, "annotations.json")).toEqual([
      expect.objectContaining({ kind: "highlight", page: 1, author: "ai", text: "Gates", rects: [box] }),
    ]);
  });

  it("starts the box where the phrase starts, even after other words on the line", async () => {
    const { lecture } = await seedPdfLecture(["Gates and truth tables"]);

    const highlight = await callJson<{ rects: Array<{ x: number; width: number }> }>("add_highlight", {
      lectureId: lecture.id,
      page: 1,
      text: "truth",
    });

    // "truth" starts after 10 of the run's 22 characters. Counting characters puts it 80 points in, where the
    // font's widths put it 88 points in, so the start is an estimate within a run.
    expect(highlight.rects[0]?.x).toBeCloseTo((20 + 80.5) / 300, 2);
    expect(highlight.rects[0]?.width).toBeCloseTo(40.25 / 300, 2);
  });

  it("boxes a fixed-width phrase exactly, because each character takes the same share of its run", async () => {
    const { lecture } = await seedPdfLecture(["Gates and truth tables"], StandardFonts.Courier);

    const highlight = await callJson<{ rects: Array<{ x: number; width: number }> }>("add_highlight", {
      lectureId: lecture.id,
      page: 1,
      text: "truth",
    });

    // Courier's characters are 10.8 points wide at 18 points, so "truth" starts 108 points in and is 54 points wide.
    expect(highlight.rects[0]?.x).toBeCloseTo((20 + 108) / 300, 6);
    expect(highlight.rects[0]?.width).toBeCloseTo(54 / 300, 6);
  });

  it("refuses a letter that sits on the page's edge and stores nothing, since none of it is visible", async () => {
    // At the edge, pdf.js keeps only the "G", and its box has no width on the page.
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    document.addPage([300, 200]).drawText("Gates", { x: 300, y: 100, size: 18, font });
    const subject = await library.createSubject({ name: "Digital Systems" });
    const lecture = await library.importLecture(subject.id, "Gates", await document.save(), 1);

    const result = await call("add_highlight", { lectureId: lecture.id, page: 1, text: "G" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('"G" is on page 1, but outside the visible page, so it cannot be highlighted.');
    expect(await library.listAnnotations(lecture.id)).toEqual([]);
  });

  it("explains a phrase drawn beyond the page's edge as not on the page", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    document.addPage([300, 200]).drawText("Gates", { x: 320, y: 100, size: 18, font });
    const subject = await library.createSubject({ name: "Digital Systems" });
    const lecture = await library.importLecture(subject.id, "Gates", await document.save(), 1);

    const result = await call("add_highlight", { lectureId: lecture.id, page: 1, text: "Gates" });

    expect(textOf(result)).toBe('"Gates" is not on page 1. Check the spelling and capitals against the page text.');
  });

  it("asks which occurrence to take when the phrase appears more than once", async () => {
    const { lecture } = await seedPdfLecture(["Gates", "Gates and Gates"]);

    const ambiguous = await call("add_highlight", { lectureId: lecture.id, page: 2, text: "Gates" });
    expect(ambiguous.isError).toBe(true);
    expect(textOf(ambiguous)).toBe(
      '"Gates" appears 2 times on page 2. Pass occurrence from 1 to 2 to choose one.',
    );

    const second = await callJson<{ rects: Array<{ x: number }> }>("add_highlight", {
      lectureId: lecture.id,
      page: 2,
      text: "Gates",
      occurrence: 2,
    });
    // The second "Gates" starts after 10 of the line's 15 characters, which is 91 points in by counting characters.
    expect(second.rects[0]?.x).toBeCloseTo((20 + 90.72) / 300, 2);
  });

  it("explains a phrase that is not on the page and a page the PDF does not have", async () => {
    const { lecture } = await seedPdfLecture(["Gates and truth tables", "Flip-flops"]);

    const missing = await call("add_highlight", { lectureId: lecture.id, page: 1, text: "Flip-flops" });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toBe(
      '"Flip-flops" is not on page 1. Check the spelling and capitals against the page text.',
    );

    const late = await call("add_highlight", { lectureId: lecture.id, page: 9, text: "Gates" });
    expect(late.isError).toBe(true);
    expect(textOf(late)).toBe("Page 9 is outside the 2 pages of this PDF.");
  });

  it("refuses to change a highlight, so the student's colour and removal stay in the app", async () => {
    const { lecture } = await seedPdfLecture(["Gates and truth tables"]);
    const highlight = await callJson<{ id: string }>("add_highlight", { lectureId: lecture.id, page: 1, text: "Gates" });

    const result = await call("update_annotation", {
      lectureId: lecture.id,
      annotationId: highlight.id,
      patch: { color: "#2b4b78" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "An assistant cannot change a highlight. The student can change or remove it in the app.",
    );
  });
});

describe("importing a lecture PDF", () => {
  let inbox: string;

  beforeEach(async () => {
    inbox = await mkdtemp(join(tmpdir(), "betternotez-pdf-"));
  });

  afterEach(async () => {
    await rm(inbox, { recursive: true, force: true });
  });

  it("copies the PDF into the library and caches each page's text", async () => {
    const subject = await library.createSubject({ name: "Digital Systems" });
    const source = await makePdf(["Cover page", "Gates and truth tables"]);
    const pdfPath = join(inbox, "Lecture 1.pdf");
    await writeFile(pdfPath, source);

    const lecture = await callJson<Lecture>("import_lecture", { subjectId: subject.id, pdfPath });

    expect(lecture).toMatchObject({ title: "Lecture 1", subjectId: subject.id, pageCount: 2 });
    expect(await callJson<Lecture[]>("list_lectures", { subjectId: subject.id })).toEqual([lecture]);
    expect(await library.getPdf(lecture.id)).toEqual(source);
    expect(await callJson("get_lecture_text", { lectureId: lecture.id })).toEqual({
      lectureId: lecture.id,
      pages: [
        { page: 1, text: "Cover page" },
        { page: 2, text: "Gates and truth tables" },
      ],
    });
  });

  it("takes the title and date from the arguments", async () => {
    const subject = await library.createSubject({ name: "Digital Systems" });
    const pdfPath = join(inbox, "scan.pdf");
    await writeFile(pdfPath, await makePdf(["Flip-flops"]));

    const lecture = await callJson<Lecture>("import_lecture", {
      subjectId: subject.id,
      pdfPath,
      title: "Week 3 review",
      date: "2026-10-05",
    });

    expect(lecture).toMatchObject({ title: "Week 3 review", date: "2026-10-05", pageCount: 1 });
  });

  it("reports a file that does not exist", async () => {
    const subject = await library.createSubject({ name: "Digital Systems" });
    const pdfPath = join(inbox, "missing.pdf");

    const result = await call("import_lecture", { subjectId: subject.id, pdfPath });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`No file exists at ${pdfPath}.`);
    expect(await callJson("list_lectures", {})).toEqual([]);
  });

  it.each([
    ["a file that is not a PDF", "Just some notes."],
    ["a corrupt PDF", "%PDF-1.4\n%garbage\n"],
    ["an empty file", ""],
  ])("refuses %s and imports nothing", async (_, contents) => {
    const subject = await library.createSubject({ name: "Digital Systems" });
    const pdfPath = join(inbox, "broken.pdf");
    await writeFile(pdfPath, contents);

    const result = await call("import_lecture", { subjectId: subject.id, pdfPath });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("This file is not a valid PDF. It may be corrupt, or it may not be a PDF at all.");
    expect(await callJson("list_lectures", {})).toEqual([]);
  });

  it("refuses a PDF with no pages", async () => {
    const subject = await library.createSubject({ name: "Digital Systems" });
    const pdfPath = join(inbox, "blank.pdf");
    const pageTreeWithoutPages = [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj",
      "trailer << /Root 1 0 R >>",
      "%%EOF",
      "",
    ];
    await writeFile(pdfPath, pageTreeWithoutPages.join("\n"));

    const result = await call("import_lecture", { subjectId: subject.id, pdfPath });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("This PDF has no pages.");
    expect(await callJson("list_lectures", {})).toEqual([]);
  });

  it("explains that a password-protected PDF cannot be read", async () => {
    const subject = await library.createSubject({ name: "Digital Systems" });
    const pdfPath = join(inbox, "locked.pdf");
    await copyFile(LOCKED_PDF, pdfPath);

    const result = await call("import_lecture", { subjectId: subject.id, pdfPath });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "This PDF is password-protected, so BetterNotez cannot read it. Remove the password in another app, then import it again.",
    );
    expect(await callJson("list_lectures", {})).toEqual([]);
  });

  it("requires an absolute path", async () => {
    const subject = await library.createSubject({ name: "Digital Systems" });

    const result = await call("import_lecture", { subjectId: subject.id, pdfPath: "Lecture 1.pdf" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("must be an absolute path.");
  });

  it("reports a subject that does not exist and imports nothing", async () => {
    const pdfPath = join(inbox, "Lecture 1.pdf");
    await writeFile(pdfPath, await makePdf(["Gates"]));

    const result = await call("import_lecture", { subjectId: "nope", pdfPath });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Subject not found: nope");
    expect(await callJson("list_lectures", {})).toEqual([]);
  });
});

describe("refusals and errors", () => {
  it.each(["delete_lecture", "delete_subject", "remove_annotation", "delete_task", "delete_planner_card"])(
    "refuses the AI attempt %s",
    async (name) => {
      const result = await call(name, { lectureId: "any" });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("not found");
    },
  );

  it("explains that the student deletes in the app and changes nothing on disk", async () => {
    await seedLecture();
    const before = await snapshotFiles(root);

    const result = await call("request_deletion", { what: "Lecture 1 in Digital Systems" });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(textOf(result))).toEqual({
      message:
        'Nothing was deleted. BetterNotez does not let AI assistants delete anything. The student can delete "Lecture 1 in Digital Systems" in the BetterNotez app.',
    });
    expect(await snapshotFiles(root)).toEqual(before);
  });

  it("reports a missing lecture by id", async () => {
    const result = await call("get_lecture", { lectureId: "nope" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Lecture not found: nope");
  });

  it("names the field when a value is rejected by the library", async () => {
    const result = await call("create_subject", { name: "" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^name: /);
  });

  it("names the field when a value is outside its range at the MCP boundary", async () => {
    const { lecture } = await seedLecture();
    const result = await call("add_text_box", { lectureId: lecture.id, page: 1, x: 1.5, y: 0.2, text: "Too far" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("at x");
  });

  it("explains a page outside the lecture", async () => {
    const { lecture } = await seedLecture();
    const result = await call("add_text_box", { lectureId: lecture.id, page: 9, x: 0.1, y: 0.1, text: "Late" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Page 9 is outside this lecture's 3 pages.");
  });

  it("asks the student to open the material when its text is not cached", async () => {
    const subject = await library.createSubject({ name: "Digital Systems" });
    const lecture = await library.importLecture(subject.id, "Lecture 2", PDF, 1);

    const result = await call("get_lecture_text", { lectureId: lecture.id });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("open the material once in BetterNotez");
  });

  it("rejects a page range outside the lecture", async () => {
    const { lecture } = await seedLecture();
    const result = await call("get_lecture_text", { lectureId: lecture.id, fromPage: 4 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Pages must be between 1 and 3, and fromPage must not be greater than toPage.");
  });

  it("rejects an ink-only field on a text box", async () => {
    const { lecture } = await seedLecture();
    const box = await callJson<{ id: string }>("add_text_box", {
      lectureId: lecture.id,
      page: 1,
      x: 0.1,
      y: 0.1,
      text: "Label",
    });

    const result = await call("update_annotation", {
      lectureId: lecture.id,
      annotationId: box.id,
      patch: { points: [[0.1, 0.1]] },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("points does not apply to a text box.");
  });
});

describe("formatting a text box", () => {
  async function storedAnnotations(lectureId: string): Promise<Array<Record<string, unknown>>> {
    const subject = (await library.listSubjects())[0];
    if (subject === undefined) throw new Error("no subject");
    return readJsonFile("subjects", subject.id, "lectures", lectureId, "annotations.json") as Promise<
      Array<Record<string, unknown>>
    >;
  }

  it("adds a text box with the style it is given and no style it is not given", async () => {
    const { lecture } = await seedLecture();

    const styled = await callJson<Record<string, unknown>>("add_text_box", {
      lectureId: lecture.id,
      page: 1,
      x: 0.1,
      y: 0.1,
      text: "Key result",
      fontSize: 24,
      bold: true,
      italic: false,
      underline: true,
      color: "#a3321f",
    });
    const plain = await callJson<Record<string, unknown>>("add_text_box", {
      lectureId: lecture.id,
      page: 1,
      x: 0.1,
      y: 0.4,
      text: "Plain",
    });

    expect(styled).toMatchObject({ fontSize: 24, bold: true, italic: false, underline: true, color: "#a3321f" });
    expect(plain).not.toHaveProperty("bold");
    expect(plain).not.toHaveProperty("italic");
    expect(plain).not.toHaveProperty("underline");
    expect(await storedAnnotations(lecture.id)).toEqual([styled, plain]);
  });

  it("changes a text box's style and keeps its text, position, and author", async () => {
    const { lecture } = await seedLecture();
    const box = await callJson<{ id: string }>("add_text_box", { lectureId: lecture.id, page: 2, x: 0.2, y: 0.3, text: "Define XOR" });

    const updated = await callJson<Record<string, unknown>>("update_annotation", {
      lectureId: lecture.id,
      annotationId: box.id,
      patch: { fontSize: 18, bold: true, italic: false, underline: true, color: "#2f5a3a" },
    });

    expect(updated).toMatchObject({
      text: "Define XOR",
      x: 0.2,
      y: 0.3,
      author: "ai",
      fontSize: 18,
      bold: true,
      italic: false,
      underline: true,
      color: "#2f5a3a",
    });
  });

  it("switches bold back off by storing false, which is different from leaving the field out", async () => {
    const { lecture } = await seedLecture();
    const box = await callJson<{ id: string }>("add_text_box", {
      lectureId: lecture.id,
      page: 1,
      x: 0.1,
      y: 0.1,
      text: "Loud",
      bold: true,
    });

    const updated = await callJson<Record<string, unknown>>("update_annotation", {
      lectureId: lecture.id,
      annotationId: box.id,
      patch: { bold: false },
    });

    expect(updated).toMatchObject({ bold: false });
  });

  it("refuses a style field on an ink stroke, and names the field", async () => {
    const { lecture } = await seedLecture();
    const stroke = await callJson<{ id: string }>("add_ink", { lectureId: lecture.id, page: 1, points: [[0.1, 0.1]] });

    const result = await call("update_annotation", {
      lectureId: lecture.id,
      annotationId: stroke.id,
      patch: { bold: true },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("bold does not apply to an ink stroke.");
  });

  it("refuses a font size that is not a positive number", async () => {
    const { lecture } = await seedLecture();
    const result = await call("add_text_box", { lectureId: lecture.id, page: 1, x: 0.1, y: 0.1, text: "Tiny", fontSize: 0 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("fontSize");
  });

  it("tells the assistant that text is italic unless it says otherwise", async () => {
    const { tools } = await client.listTools();
    const addTextBox = tools.find((tool) => tool.name === "add_text_box");

    expect(addTextBox?.description).toContain("Text is italic unless italic is false.");
    expect(Object.keys(addTextBox?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["fontSize", "bold", "italic", "underline", "color"]),
    );
  });
});

describe("overlapping calls", () => {
  it("keeps every annotation when the client sends many calls at once", async () => {
    const { subject, lecture } = await seedLecture();

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        call("add_ink", { lectureId: lecture.id, page: 1, points: [[index / 100, 0.5]] }),
      ),
    );

    const annotations = await readJsonFile("subjects", subject.id, "lectures", lecture.id, "annotations.json");
    expect(annotations).toHaveLength(20);
  });
});
