import type { Folder, Lecture, LectureStatus, MaterialPlacement } from "@betternotez/core";

/** "all" shows every material. The other two show the materials with that status. */
export type StatusFilter = "all" | LectureStatus;

/** A folder's section of the subject page, or Unfiled when `folder` is undefined. */
export interface Section {
  readonly folder: Folder | undefined;
  readonly lectures: readonly Lecture[];
}

export type Placements = Readonly<Record<string, MaterialPlacement | undefined>>;

/**
 * Sections for the subject page. Each folder comes in the order it was given, and Unfiled comes last. Every folder has a
 * section, even when the filter leaves it empty. A material whose folder is not in `folders` is in Unfiled. Materials
 * keep the order they were given in.
 */
export function groupLectures(
  folders: readonly Folder[],
  lectures: readonly Lecture[],
  placements: Placements,
  filter: StatusFilter,
): Section[] {
  const folderIds = new Set<string>(folders.map((folder) => folder.id));
  const shown = lectures.filter((lecture) => filter === "all" || statusOf(placements, lecture) === filter);
  const folderOf = (lecture: Lecture): string | undefined => {
    const folderId = placements[lecture.id]?.folderId;
    return folderId !== undefined && folderIds.has(folderId) ? folderId : undefined;
  };

  return [
    ...folders.map((folder) => ({
      folder,
      lectures: shown.filter((lecture) => folderOf(lecture) === folder.id),
    })),
    { folder: undefined, lectures: shown.filter((lecture) => folderOf(lecture) === undefined) },
  ];
}

/** How many materials each filter shows. */
export function countByStatus(lectures: readonly Lecture[], placements: Placements): Record<StatusFilter, number> {
  const done = lectures.filter((lecture) => statusOf(placements, lecture) === "done").length;
  return { all: lectures.length, reading: lectures.length - done, done };
}

/** A material with no placement is reading, the same as the library reads it. */
function statusOf(placements: Placements, lecture: Lecture): LectureStatus {
  return placements[lecture.id]?.status ?? "reading";
}
