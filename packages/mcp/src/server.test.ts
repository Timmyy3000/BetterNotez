import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type Lecture, Library, type Subject } from "@betternotez/core";
import { NodeFsStorage } from "@betternotez/core/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "./server.js";

const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");

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

describe("tool surface", () => {
  it("offers the read, create, and edit tools and no delete or remove tool", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "add_ink",
      "add_text_box",
      "create_planner_card",
      "create_subject",
      "create_task",
      "find_lecture",
      "get_lecture",
      "get_lecture_text",
      "list_lectures",
      "list_planner",
      "list_subjects",
      "list_tasks",
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

describe("refusals and errors", () => {
  it.each(["delete_lecture", "delete_subject", "remove_annotation", "delete_task", "delete_planner_card"])(
    "refuses the AI attempt %s",
    async (name) => {
      const result = await call(name, { lectureId: "any" });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("not found");
    },
  );

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

  it("asks the student to open the lecture when its text is not cached", async () => {
    const subject = await library.createSubject({ name: "Digital Systems" });
    const lecture = await library.importLecture(subject.id, "Lecture 2", PDF, 1);

    const result = await call("get_lecture_text", { lectureId: lecture.id });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("open the lecture once in BetterNotez");
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
