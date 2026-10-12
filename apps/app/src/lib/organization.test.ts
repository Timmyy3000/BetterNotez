import { Folder, FolderId, Lecture, type MaterialPlacement } from "@betternotez/core";
import { describe, expect, it } from "vitest";
import { countByStatus, groupLectures, type Placements } from "./organization";

const SUBJECT_ID = "01SUBJECTORG00000000000000";
const STAMP = "2026-10-08T09:00:00.000Z";

const folder = (id: string, name: string) => Folder.parse({ id, name, createdAt: STAMP });
const lecture = (id: string, title: string) =>
  Lecture.parse({ id, subjectId: SUBJECT_ID, title, pageCount: 1, createdAt: STAMP, updatedAt: STAMP });

const week1 = folder("01WEEKONE00000000000000000", "Week 1");
const week2 = folder("01WEEKTWO00000000000000000", "Week 2");
const lectureOne = lecture("01LECTUREONE000000000000000", "Lecture 1");
const lectureTwo = lecture("01LECTURETWO000000000000000", "Lecture 2");
const lectureThree = lecture("01LECTURETHREE0000000000000", "Lecture 3");

function placed(folderId: string | undefined, status: MaterialPlacement["status"]): MaterialPlacement {
  return folderId === undefined ? { status } : { status, folderId: FolderId.parse(folderId) };
}

function sectionNames(sections: ReturnType<typeof groupLectures>): string[] {
  return sections.map((section) => section.folder?.name ?? "Unfiled");
}

function sectionTitles(sections: ReturnType<typeof groupLectures>): string[][] {
  return sections.map((section) => section.lectures.map((item) => item.title));
}

describe("groupLectures", () => {
  it("puts each material under its folder, folders in the order given, and Unfiled last", () => {
    const placements: Placements = {
      [lectureOne.id]: placed(week2.id, "reading"),
      [lectureThree.id]: placed(week1.id, "reading"),
    };

    const sections = groupLectures([week2, week1], [lectureOne, lectureTwo, lectureThree], placements, "all");

    expect(sectionNames(sections)).toEqual(["Week 2", "Week 1", "Unfiled"]);
    expect(sectionTitles(sections)).toEqual([["Lecture 1"], ["Lecture 3"], ["Lecture 2"]]);
  });

  it("keeps a folder that the filter empties, so it can still take material", () => {
    const placements: Placements = { [lectureOne.id]: placed(week1.id, "reading") };

    const sections = groupLectures([week1, week2], [lectureOne], placements, "done");

    expect(sectionNames(sections)).toEqual(["Week 1", "Week 2", "Unfiled"]);
    expect(sections.map((section) => section.lectures.length)).toEqual([0, 0, 0]);
  });

  it("shows only the materials with the chosen status, and keeps each folder's section", () => {
    const placements: Placements = {
      [lectureOne.id]: placed(week1.id, "done"),
      [lectureTwo.id]: placed(week1.id, "reading"),
      [lectureThree.id]: placed(undefined, "done"),
    };
    const lectures = [lectureOne, lectureTwo, lectureThree];

    expect(sectionTitles(groupLectures([week1], lectures, placements, "done"))).toEqual([["Lecture 1"], ["Lecture 3"]]);
    expect(sectionTitles(groupLectures([week1], lectures, placements, "reading"))).toEqual([["Lecture 2"], []]);
    expect(sectionTitles(groupLectures([week1], lectures, placements, "all"))).toEqual([
      ["Lecture 1", "Lecture 2"],
      ["Lecture 3"],
    ]);
  });

  it("reads a material with no placement as reading, in Unfiled", () => {
    const sections = groupLectures([week1], [lectureOne], {}, "reading");

    expect(sectionTitles(sections)).toEqual([[], ["Lecture 1"]]);
  });

  it("puts a material whose folder is gone in Unfiled", () => {
    const gone = FolderId.parse("01FOLDERGONE000000000000000");
    const placements: Placements = { [lectureOne.id]: { status: "reading", folderId: gone } };

    const sections = groupLectures([week1], [lectureOne], placements, "all");

    expect(sectionTitles(sections)).toEqual([[], ["Lecture 1"]]);
  });

  it("is one unfiled section with no folder heading when there are no folders", () => {
    const sections = groupLectures([], [lectureOne, lectureTwo], {}, "all");

    expect(sections).toEqual([{ folder: undefined, lectures: [lectureOne, lectureTwo] }]);
  });
});

describe("countByStatus", () => {
  it("counts every material, the reading ones, and the done ones", () => {
    const placements: Placements = {
      [lectureOne.id]: placed(week1.id, "done"),
      [lectureTwo.id]: placed(undefined, "reading"),
    };

    expect(countByStatus([lectureOne, lectureTwo, lectureThree], placements)).toEqual({
      all: 3,
      reading: 2,
      done: 1,
    });
  });
});
