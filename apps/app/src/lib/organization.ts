import {
  UnreadableOrganizationError,
  type Folder,
  type Lecture,
  type LectureStatus,
  type Library,
  type MaterialPlacement,
  type SubjectOrganization,
} from "@betternotez/core";

export type StatusFilter = "all" | LectureStatus;

export interface Section {
  readonly folder: Folder | undefined;
  readonly lectures: readonly Lecture[];
}

export type Placements = Readonly<Record<string, MaterialPlacement | undefined>>;

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

/** The order the subject page lists material in, folder by folder, so previous and next follow what the reader sees. */
export function readingOrder(
  folders: readonly Folder[],
  lectures: readonly Lecture[],
  placements: Placements,
): Lecture[] {
  return groupLectures(folders, lectures, placements, "all").flatMap((section) => section.lectures);
}

export async function readOrganization(
  library: Library,
  subjectId: string,
): Promise<SubjectOrganization & { readonly readable: boolean }> {
  try {
    return { ...(await library.getOrganization(subjectId)), readable: true };
  } catch (error) {
    if (error instanceof UnreadableOrganizationError) return { folders: [], lectures: {}, readable: false };
    throw error;
  }
}

export function countByStatus(lectures: readonly Lecture[], placements: Placements): Record<StatusFilter, number> {
  const done = lectures.filter((lecture) => statusOf(placements, lecture) === "done").length;
  return { all: lectures.length, reading: lectures.length - done, done };
}

function statusOf(placements: Placements, lecture: Lecture): LectureStatus {
  return placements[lecture.id]?.status ?? "reading";
}
