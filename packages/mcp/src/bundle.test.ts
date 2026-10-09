import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BUNDLE = fileURLToPath(new URL("../dist/betternotez-mcp.mjs", import.meta.url));

let sandbox: string;
let client: Client;

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "betternotez-bundle-"));
  // The bundle goes alone into an empty folder, so it can only run if it carries every dependency.
  const release = join(sandbox, "release");
  await mkdir(release);
  await copyFile(BUNDLE, join(release, "betternotez-mcp.mjs"));

  client = new Client({ name: "bundle-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["betternotez-mcp.mjs", "--library", join(sandbox, "library")],
      cwd: release,
    }),
  );
});

afterAll(async () => {
  await client.close();
  await rm(sandbox, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

function textOf(result: CallToolResult): string {
  const [first] = result.content;
  return first?.type === "text" ? first.text : "";
}

async function makePdf(pages: string[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    document.addPage([300, 200]).drawText(text, { x: 20, y: 100, size: 18, font });
  }
  return document.save();
}

describe("betternotez-mcp bundle, run alone with no node_modules", () => {
  it("offers the library tools and no tool that deletes", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining(["create_subject", "import_lecture", "get_lecture_text"]));
    expect(names.filter((name) => /^(delete|remove)_/.test(name))).toEqual([]);
  });

  it("creates a subject, imports a PDF into the --library folder, and reads its text back", async () => {
    const subject = JSON.parse(textOf(await call("create_subject", { name: "Digital Systems" })));
    expect(subject).toMatchObject({ name: "Digital Systems" });

    const pdfPath = join(sandbox, "lecture-1.pdf");
    await writeFile(pdfPath, await makePdf(["Cover page", "Gates and truth tables"]));
    const imported = await call("import_lecture", { subjectId: subject.id, pdfPath, title: "Lecture 1" });
    expect(imported.isError).not.toBe(true);
    const lecture = JSON.parse(textOf(imported));
    expect(lecture).toMatchObject({ title: "Lecture 1", subjectId: subject.id, pageCount: 2 });

    const text = JSON.parse(textOf(await call("get_lecture_text", { lectureId: lecture.id })));
    expect(text.pages).toEqual([
      { page: 1, text: "Cover page" },
      { page: 2, text: "Gates and truth tables" },
    ]);
    expect(await readdir(join(sandbox, "library"))).toContain("library.json");
  });

  it("writes a note to one page and reads it back per page", async () => {
    const [subject] = JSON.parse(textOf(await call("list_subjects"))) as Array<{ id: string }>;
    const [lecture] = JSON.parse(textOf(await call("list_lectures", { subjectId: subject?.id }))) as Array<{
      id: string;
    }>;
    if (lecture === undefined) throw new Error("the lecture from the previous test is missing");

    await call("update_notes", { lectureId: lecture.id, page: 2, text: "Gates and truth tables" });
    const details = JSON.parse(textOf(await call("get_lecture", { lectureId: lecture.id, page: 2 })));
    expect(details.notes).toEqual([{ page: 2, text: "Gates and truth tables" }]);
  });
});
