import "fake-indexeddb/auto";
import { Library } from "@betternotez/core";
import { describe, expect, it } from "vitest";
import { IndexedDbStorage } from "./indexeddb";

const freshName = (): string => `test-${crypto.randomUUID()}`;
const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

describe("IndexedDbStorage", () => {
  it("returns the text and bytes that were written, and undefined for a missing path", async () => {
    const storage = new IndexedDbStorage(freshName());
    await storage.writeText("subjects/a/subject.json", '{"name":"Maths"}');
    await storage.writeBytes("subjects/a/lecture.pdf", bytes(37, 80, 68, 70));

    expect(await storage.readText("subjects/a/subject.json")).toBe('{"name":"Maths"}');
    expect(await storage.readBytes("subjects/a/lecture.pdf")).toEqual(bytes(37, 80, 68, 70));
    expect(await storage.readText("subjects/b/subject.json")).toBeUndefined();
  });

  it("keeps data when a new storage instance opens the same database", async () => {
    const name = freshName();
    await new IndexedDbStorage(name).writeText("library.json", '{"version":1}');

    expect(await new IndexedDbStorage(name).readText("library.json")).toBe('{"version":1}');
  });

  it("lists direct children once, sorted, and an empty list for a missing folder", async () => {
    const storage = new IndexedDbStorage(freshName());
    await storage.writeText("subjects/b/subject.json", "{}");
    await storage.writeText("subjects/a/subject.json", "{}");
    await storage.writeText("subjects/a/lectures/x/lecture.json", "{}");
    await storage.writeText("subjects/ab/subject.json", "{}");

    expect(await storage.list("subjects")).toEqual(["a", "ab", "b"]);
    expect(await storage.list("nowhere")).toEqual([]);
  });

  it("removes a folder and its contents without touching a sibling whose name starts the same", async () => {
    const storage = new IndexedDbStorage(freshName());
    await storage.writeText("subjects/a/subject.json", "{}");
    await storage.writeText("subjects/ab/subject.json", "{}");

    await storage.remove("subjects/a");

    expect(await storage.exists("subjects/a")).toBe(false);
    expect(await storage.readText("subjects/a/subject.json")).toBeUndefined();
    expect(await storage.readText("subjects/ab/subject.json")).toBe("{}");
  });

  it("reports folders that hold files as existing", async () => {
    const storage = new IndexedDbStorage(freshName());
    await storage.writeText("subjects/a/subject.json", "{}");

    expect(await storage.exists("subjects/a")).toBe(true);
    expect(await storage.exists("subjects/a/subject.json")).toBe(true);
    expect(await storage.exists("subjects/b")).toBe(false);
  });

  it("refuses paths that would leave the library", async () => {
    const storage = new IndexedDbStorage(freshName());

    await expect(storage.writeText("../secret.json", "{}")).rejects.toThrow("Invalid storage path");
  });

  it("keeps a library's subjects, lectures, PDFs, and text after reopening", async () => {
    const name = freshName();
    const pdf = new TextEncoder().encode("%PDF-1.4 test");
    const library = new Library(new IndexedDbStorage(name));
    await library.init();
    const subject = await library.createSubject({ name: "Digital Systems", color: "#2563eb" });
    const lecture = await library.importLecture(subject.id, "Lecture 1", pdf, 2, "2026-10-12");
    await library.setPdfText(lecture.id, ["Boolean algebra", "Karnaugh maps"]);

    const reopened = new Library(new IndexedDbStorage(name));

    expect((await reopened.listSubjects()).map((item) => item.name)).toEqual(["Digital Systems"]);
    expect(await reopened.getLecture(lecture.id)).toMatchObject({ title: "Lecture 1", date: "2026-10-12", pageCount: 2 });
    expect(await reopened.getPdf(lecture.id)).toEqual(pdf);
    expect(await reopened.getPdfText(lecture.id)).toEqual(["Boolean algebra", "Karnaugh maps"]);
  });
});
