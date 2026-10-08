import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Library } from "./library.js";
import { NodeFsStorage } from "./node.js";
import { CLOCK, pdfBytes } from "./test/backends.js";

describe("Library on a folder on disk", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "betternotez-disk-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores subjects as readable JSON without the app", async () => {
    const library = new Library(new NodeFsStorage(root), { now: () => CLOCK });
    await library.init();
    const subject = await library.createSubject({ name: "Digital Systems", color: "#2563eb" });

    const onDisk = JSON.parse(
      await readFile(join(root, "subjects", subject.id, "subject.json"), "utf8"),
    );
    expect(onDisk).toEqual({
      id: subject.id,
      name: "Digital Systems",
      color: "#2563eb",
      createdAt: "2026-10-08T09:00:00.000Z",
    });
  });

  it("stores the lecture PDF byte for byte in its lecture folder", async () => {
    const library = new Library(new NodeFsStorage(root), { now: () => CLOCK });
    const subject = await library.createSubject({ name: "Digital Systems" });
    const lecture = await library.importLecture(subject.id, "Lecture 1", pdfBytes("slides"), 1);

    const onDisk = await readFile(
      join(root, "subjects", subject.id, "lectures", lecture.id, "lecture.pdf"),
    );
    expect(new TextDecoder().decode(onDisk)).toBe("%PDF-1.7\nslides\n%%EOF\n");
  });

  it("leaves only the final file after repeated saves", async () => {
    const library = new Library(new NodeFsStorage(root), { now: () => CLOCK });
    const subject = await library.createSubject({ name: "Digital Systems" });
    await library.updateSubject(subject.id, { name: "Digital Logic" });
    await library.updateSubject(subject.id, { name: "Logic Design" });

    expect(await readdir(join(root, "subjects", subject.id))).toEqual(["subject.json"]);
  });

  it("reads data written by an earlier session", async () => {
    const first = new Library(new NodeFsStorage(root), { now: () => CLOCK });
    await first.init();
    const subject = await first.createSubject({ name: "Digital Systems" });
    await first.createTask({ title: "Review Lecture 1", subjectId: subject.id });

    const second = new Library(new NodeFsStorage(root), { now: () => CLOCK });
    expect((await second.listSubjects()).map((item) => item.name)).toEqual(["Digital Systems"]);
    expect((await second.listTasks()).map((task) => task.title)).toEqual(["Review Lecture 1"]);
  });

  it("reports a hand-edited file that breaks the schema instead of loading it", async () => {
    const library = new Library(new NodeFsStorage(root), { now: () => CLOCK });
    const subject = await library.createSubject({ name: "Digital Systems" });
    await writeFile(
      join(root, "subjects", subject.id, "subject.json"),
      JSON.stringify({ id: subject.id, name: "", color: "blue", createdAt: "yesterday" }),
    );

    await expect(library.listSubjects()).rejects.toThrow();
  });
});
