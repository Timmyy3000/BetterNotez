import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Library } from "./library.js";
import { CLOCK, pdfBytes, storageBackends, type StorageEnv } from "./test/backends.js";

describe.each(storageBackends)("findLecture and search on $name", ({ create }) => {
  let env: StorageEnv;
  let library: Library;
  let digital: { id: string };
  let algebra: { id: string };
  let logicGates: { id: string };
  let karnaugh: { id: string };
  let vectorSpaces: { id: string };

  beforeEach(async () => {
    env = await create();
    library = new Library(env.open(), { now: () => CLOCK });
    await library.init();
    digital = await library.createSubject({ name: "Digital Systems" });
    algebra = await library.createSubject({ name: "Linear Algebra" });
    logicGates = await library.importLecture(digital.id, "Lecture 1: Logic gates", pdfBytes("a"), 2);
    karnaugh = await library.importLecture(digital.id, "Lecture 2: Karnaugh maps", pdfBytes("b"), 2);
    vectorSpaces = await library.importLecture(algebra.id, "Lecture 1: Vector spaces", pdfBytes("c"), 2);
  });

  afterEach(async () => {
    await env.cleanup();
  });

  describe("findLecture", () => {
    const titlesFor = async (query: string) =>
      (await library.findLecture(query)).map((match) => match.lecture.title);

    it("resolves 'Lecture 1 in Digital Systems' to that lecture", async () => {
      const matches = await library.findLecture("Lecture 1 in Digital Systems");
      expect(matches.map((match) => [match.lecture.title, match.subject.name])).toEqual([
        ["Lecture 1: Logic gates", "Digital Systems"],
      ]);
      expect(matches[0]?.score).toBe(1);
    });

    it("ignores letter case", async () => {
      expect(await titlesFor("LECTURE 2 IN DIGITAL SYSTEMS")).toEqual(["Lecture 2: Karnaugh maps"]);
    });

    it("tolerates small typos in subject and title words", async () => {
      expect(await titlesFor("lecture 1 digtal systms")).toEqual(["Lecture 1: Logic gates"]);
    });

    it("accepts a full sentence from a conversation", async () => {
      expect(
        await titlesFor("Let's talk about Lecture 1 in Digital Systems in BetterNotez"),
      ).toEqual(["Lecture 1: Logic gates"]);
    });

    it("returns every lecture with that number when the query names no subject", async () => {
      expect(await titlesFor("Lecture 1")).toEqual(["Lecture 1: Logic gates", "Lecture 1: Vector spaces"]);
    });

    it("matches a lecture by its title words when the query has no number", async () => {
      expect(await titlesFor("vector spaces")).toEqual(["Lecture 1: Vector spaces"]);
    });

    it("does not match lecture numbers that are absent", async () => {
      expect(await titlesFor("Lecture 3 in Digital Systems")).toEqual([]);
    });

    it("returns nothing for an empty query", async () => {
      expect(await library.findLecture("   ")).toEqual([]);
    });
  });

  describe("search", () => {
    it("is case-insensitive", async () => {
      expect(await library.search("KARNAUGH")).toEqual(await library.search("karnaugh"));
    });

    it("returns nothing for a blank query", async () => {
      expect(await library.search("  ")).toEqual([]);
    });

    it("finds subject names", async () => {
      expect(await library.search("digital")).toEqual([
        { kind: "subject", subjectId: digital.id, snippet: "Digital Systems" },
      ]);
    });

    it("finds lecture titles", async () => {
      expect(await library.search("karnaugh")).toEqual([
        {
          kind: "lecture",
          subjectId: digital.id,
          lectureId: karnaugh.id,
          snippet: "Lecture 2: Karnaugh maps",
        },
      ]);
    });

    it("finds words in the notepad", async () => {
      await library.setNotes(logicGates.id, "Remember the De Morgan law for NAND gates.");

      expect(await library.search("morgan")).toEqual([
        {
          kind: "notes",
          subjectId: digital.id,
          lectureId: logicGates.id,
          snippet: "Remember the De Morgan law for NAND gates.",
        },
      ]);
    });

    it("finds text boxes with their page", async () => {
      const box = await library.addAnnotation(logicGates.id, {
        kind: "text",
        page: 2,
        author: "user",
        x: 0.1,
        y: 0.1,
        width: 0.3,
        height: 0.1,
        text: "Truth table for XOR",
        fontSize: 14,
        color: "#111111",
      });

      expect(await library.search("xor")).toEqual([
        {
          kind: "annotation",
          subjectId: digital.id,
          lectureId: logicGates.id,
          annotationId: box.id,
          page: 2,
          snippet: "Truth table for XOR",
        },
      ]);
    });

    it("does not search freehand ink", async () => {
      await library.addAnnotation(logicGates.id, {
        kind: "ink",
        page: 1,
        author: "user",
        points: [[0.5, 0.5, 1]],
        color: "#000000",
        size: 2,
      });

      expect(await library.search("ink")).toEqual([]);
    });

    it("finds PDF text from the cache with the 1-based page number", async () => {
      await library.setPdfText(karnaugh.id, ["Cover page", "Full adder circuit"]);

      expect(await library.search("adder")).toEqual([
        {
          kind: "pdf",
          subjectId: digital.id,
          lectureId: karnaugh.id,
          page: 2,
          snippet: "Full adder circuit",
        },
      ]);
    });

    it("uses the supplied PDF text provider instead of the cache", async () => {
      await library.setPdfText(karnaugh.id, ["cached words", "unrelated"]);
      await library.setPdfText(logicGates.id, ["cached words", "unrelated"]);

      const hits = await library.search("live", {
        pdfText: async (lectureId) => (lectureId === logicGates.id ? ["live page one", "nothing"] : []),
      });

      expect(hits).toEqual([
        {
          kind: "pdf",
          subjectId: digital.id,
          lectureId: logicGates.id,
          page: 1,
          snippet: "live page one",
        },
      ]);
    });

    it("trims long context around a match to 40 characters on each side", async () => {
      await library.setNotes(logicGates.id, `${"a".repeat(100)}needle${"b".repeat(100)}`);

      const [hit] = await library.search("needle");
      expect(hit?.snippet).toBe(`...${"a".repeat(40)}needle${"b".repeat(40)}...`);
    });
  });
});
