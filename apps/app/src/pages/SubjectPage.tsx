import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  UnreadableOrganizationError,
  type Folder,
  type Lecture,
  type LectureStatus,
  type Library,
  type SubjectOrganization,
} from "@betternotez/core";
import { Check, Ellipsis, FileText, FolderPlus, GripVertical, Pencil, Trash2, Upload } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode, type RefObject } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { DeleteFolderDialog } from "../folders/DeleteFolderDialog";
import { FolderDialog } from "../folders/FolderDialog";
import { DeleteLectureDialog } from "../lectures/DeleteLectureDialog";
import { EditLectureDialog } from "../lectures/EditLectureDialog";
import { ImportDialog } from "../lectures/ImportDialog";
import { useLibrary, useLibraryQuery } from "../library";
import { cn } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { countLabel, displayTitle, lectureMeta } from "../lib/format";
import { revealAt } from "../lib/motion";
import { countByStatus, groupLectures, type Section, type StatusFilter } from "../lib/organization";
import { sortLectures } from "../lib/lectures";
import { subjectTone } from "../lib/subject-colors";
import { selectPdfs } from "../pdf/import";
import { notifyLibraryChanged } from "../store";
import { DeleteSubjectDialog } from "../subjects/DeleteSubjectDialog";
import { SubjectDialog } from "../subjects/SubjectDialog";
import { Button, iconButtonClass } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { EmptyState } from "../ui/empty-state";
import { PageHeader } from "../ui/page-header";
import { QueryError } from "../ui/query-error";

type OpenDialog =
  | { readonly kind: "rename" }
  | { readonly kind: "delete-subject" }
  | { readonly kind: "import"; readonly files: readonly File[] }
  | { readonly kind: "edit-lecture"; readonly lecture: Lecture; readonly folderId: string | undefined }
  | { readonly kind: "delete-lecture"; readonly lecture: Lecture }
  | { readonly kind: "new-folder" }
  | { readonly kind: "rename-folder"; readonly folder: Folder }
  | { readonly kind: "delete-folder"; readonly folder: Folder; readonly materialCount: number };

const FILTERS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "reading", label: "Reading" },
  { value: "done", label: "Done" },
];

/** Drop targets. A folder's id is prefixed so it cannot collide with the Unfiled target. */
const UNFILED_TARGET = "unfiled";
const FOLDER_TARGET = "folder:";

export function SubjectPage() {
  const { subjectId = "" } = useParams();
  const library = useLibrary();
  const subject = useLibraryQuery((lib) => lib.getSubject(subjectId), [subjectId]);
  const lectures = useLibraryQuery((lib) => lib.listLectures(subjectId), [subjectId]);
  const organization = useLibraryQuery((lib) => readOrganization(lib, subjectId), [subjectId]);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  // A pointer drag ends with a click on the row it started from. Opening the material there would be wrong.
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Enter opens a material, as a click does, so only Space picks one up.
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Tab"] },
    }),
  );

  if (subject.error !== undefined) {
    return <QueryError error={subject.error} />;
  }
  if (lectures.error !== undefined) {
    return <QueryError error={lectures.error} />;
  }
  if (organization.error !== undefined) {
    return <QueryError error={organization.error} />;
  }
  if (subject.data === undefined || lectures.data === undefined || organization.data === undefined) {
    return null;
  }

  const current = subject.data;
  const ordered = sortLectures(lectures.data);
  const { readable, folders, lectures: placements } = organization.data;
  const counts = countByStatus(ordered, placements);
  // Without a readable file no material has a known status, so the filter shows every material.
  const sections = groupLectures(folders, ordered, placements, readable ? filter : "all");
  // Numbers follow the whole list, so a filter does not renumber the material it shows.
  const numberOf = new Map(ordered.map((lecture, index) => [lecture.id, index + 1]));
  const activeLecture = ordered.find((lecture) => lecture.id === activeId);
  const titleOf = (id: string | number) => ordered.find((lecture) => lecture.id === String(id))?.title ?? "a material";
  const nameOfTarget = (id: string | number | undefined) => {
    if (id === undefined) return "a folder";
    const target = targetFolder(String(id));
    return target === null ? "Unfiled" : (folders.find((folder) => folder.id === target)?.name ?? "a folder");
  };
  const close = () => setDialog(null);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const pdfs = selectPdfs(event.dataTransfer.files);
    if (pdfs.length > 0) {
      setDialog({ kind: "import", files: pdfs });
    }
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    justDragged.current = true;
    window.setTimeout(() => {
      justDragged.current = false;
    }, 0);

    const lecture = ordered.find((item) => item.id === String(active.id));
    if (lecture === undefined || over === null) return;
    const target = targetFolder(String(over.id));
    // Dropping a material where it already is changes nothing, so it is not written.
    if ((placements[lecture.id]?.folderId ?? null) === target) return;
    try {
      await library.moveLecture(lecture.id, target);
      notifyLibraryChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function setStatus(lecture: Lecture, status: LectureStatus) {
    try {
      await library.setLectureStatus(lecture.id, status);
      notifyLibraryChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function renderRow(lecture: Lecture) {
    const status = placements[lecture.id]?.status ?? "reading";
    return (
      <LectureRow
        key={lecture.id}
        number={numberOf.get(lecture.id) ?? 0}
        lecture={lecture}
        status={status}
        readable={readable}
        movable={readable && folders.length > 0}
        justDragged={justDragged}
        onEdit={() =>
          setDialog({ kind: "edit-lecture", lecture, folderId: placements[lecture.id]?.folderId })
        }
        onDelete={() => setDialog({ kind: "delete-lecture", lecture })}
        onToggleStatus={() => void setStatus(lecture, status === "done" ? "reading" : "done")}
      />
    );
  }

  const doneCount = counts.done;
  const shown = sections.flatMap((section) => section.lectures);

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-30 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-background/85 font-serif text-3xl text-accent italic">
          Drop PDFs to add them to {current.name}
        </div>
      )}

      <PageHeader
        eyebrow={
          <>
            <span className="ink-dot" style={{ backgroundColor: subjectTone(current.color) }} aria-hidden />
            Subject
          </>
        }
        title={current.name}
        description={`${countLabel(ordered.length, "material")}${doneCount > 0 ? ` · ${doneCount} done` : ""}`}
        actions={
          <>
            <Button variant="primary" onClick={() => setDialog({ kind: "import", files: [] })}>
              <Upload />
              Import PDF
            </Button>
            {readable && (
              <Button onClick={() => setDialog({ kind: "new-folder" })}>
                <FolderPlus />
                New folder
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Subject actions" className={iconButtonClass}>
                  <Ellipsis />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setDialog({ kind: "rename" })}>
                  <Pencil />
                  Rename subject
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => setDialog({ kind: "delete-subject" })}>
                  <Trash2 />
                  Delete subject
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
            onDragOver: ({ active, over }) =>
              over === null
                ? `${titleOf(active.id)} is not over a folder.`
                : `${titleOf(active.id)} was moved over ${nameOfTarget(over.id)}.`,
            onDragEnd: ({ active, over }) =>
              over === null
                ? `${titleOf(active.id)} was dropped.`
                : `${titleOf(active.id)} was dropped in ${nameOfTarget(over.id)}.`,
            onDragCancel: ({ active }) => `Dragging ${titleOf(active.id)} was cancelled.`,
          },
        }}
      >
        <div className="rise" style={revealAt(2)}>
          {!readable && (
            <p role="alert" className="mb-7 text-[15px] leading-relaxed text-muted-foreground">
              This subject's folders and reading status can't be read. The file is damaged or was made by a newer
              version of BetterNotez, so it has been left as it is.
            </p>
          )}
          {ordered.length === 0 ? (
            <EmptyState icon={FileText} title="No material yet">
              Drop PDFs anywhere on this page, or click Import PDF.
            </EmptyState>
          ) : (
            <>
              {readable && (
                <div
                  role="group"
                  aria-label="Show material"
                  className="mb-7 flex flex-wrap gap-x-7 gap-y-2 border-b border-rule pb-3"
                >
                  {FILTERS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                      className="font-serif text-xl text-muted-foreground italic transition-colors hover:text-foreground aria-pressed:text-foreground aria-pressed:underline aria-pressed:underline-offset-4"
                    >
                      {label} <span className="tabular-nums">{counts[value]}</span>
                    </button>
                  ))}
                </div>
              )}

              {folders.length === 0 ? (
                shown.length === 0 ? (
                  <EmptySection>No material matches this filter.</EmptySection>
                ) : (
                  <ol className="border-b border-border">{shown.map(renderRow)}</ol>
                )
              ) : (
                sections.map((section) => (
                  <FolderSection
                    key={section.folder?.id ?? UNFILED_TARGET}
                    section={section}
                    onRename={(folder) => setDialog({ kind: "rename-folder", folder })}
                    onDelete={(folder) =>
                      setDialog({
                        kind: "delete-folder",
                        folder,
                        materialCount: ordered.filter((lecture) => placements[lecture.id]?.folderId === folder.id)
                          .length,
                      })
                    }
                  >
                    {section.lectures.length === 0 ? (
                      <EmptySection>{emptyHint(section, filter)}</EmptySection>
                    ) : (
                      <ol className="border-b border-border [&>li:first-child]:border-t-0">
                        {section.lectures.map(renderRow)}
                      </ol>
                    )}
                  </FolderSection>
                ))
              )}
            </>
          )}
        </div>

        <DragOverlay>
          {activeLecture === undefined ? null : (
            <LectureRowFace number={numberOf.get(activeLecture.id) ?? 0} lecture={activeLecture} />
          )}
        </DragOverlay>
      </DndContext>

      {dialog?.kind === "rename" && <SubjectDialog subject={current} onClose={close} />}
      {dialog?.kind === "delete-subject" && (
        <DeleteSubjectDialog subject={current} lectureCount={ordered.length} onClose={close} />
      )}
      {dialog?.kind === "import" && (
        <ImportDialog subjectId={current.id} initialFiles={dialog.files} onClose={close} />
      )}
      {dialog?.kind === "edit-lecture" && (
        <EditLectureDialog lecture={dialog.lecture} folders={folders} folderId={dialog.folderId} onClose={close} />
      )}
      {dialog?.kind === "delete-lecture" && <DeleteLectureDialog lecture={dialog.lecture} onClose={close} />}
      {dialog?.kind === "new-folder" && <FolderDialog subjectId={current.id} onClose={close} />}
      {dialog?.kind === "rename-folder" && (
        <FolderDialog subjectId={current.id} folder={dialog.folder} onClose={close} />
      )}
      {dialog?.kind === "delete-folder" && (
        <DeleteFolderDialog
          subjectId={current.id}
          folder={dialog.folder}
          materialCount={dialog.materialCount}
          onClose={close}
        />
      )}
    </div>
  );
}

/**
 * A subject's folders and status. An unreadable organization.json is not an error here. The page lists the material
 * flat, and the file stays as it is. Any other failure is still reported.
 */
async function readOrganization(
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

/** The folder a drop target stands for, or null for Unfiled. */
function targetFolder(target: string): string | null {
  return target === UNFILED_TARGET ? null : target.slice(FOLDER_TARGET.length);
}

/** What an empty section says. Under a filter the material is there but hidden, so the hint says that instead. */
function emptyHint(section: Section, filter: StatusFilter): string {
  if (filter !== "all") return "No material matches this filter.";
  return section.folder === undefined ? "Drop material here to unfile it." : "Drop material here.";
}

function FolderSection({
  section,
  children,
  onRename,
  onDelete,
}: {
  readonly section: Section;
  readonly children: ReactNode;
  readonly onRename: (folder: Folder) => void;
  readonly onDelete: (folder: Folder) => void;
}) {
  const { folder } = section;
  const name = folder?.name ?? "Unfiled";
  const { setNodeRef, isOver } = useDroppable({
    id: folder === undefined ? UNFILED_TARGET : `${FOLDER_TARGET}${folder.id}`,
  });

  return (
    <section aria-label={name} className="mt-9 first:mt-0">
      <header className="flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-3">
        <h2 className="font-serif text-[28px] leading-tight">{name}</h2>
        <div className="flex items-center gap-2">
          <span className="font-serif text-[22px] text-faint italic tabular-nums">{section.lectures.length}</span>
          {folder !== undefined && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Actions for folder ${folder.name}`} className={iconButtonClass}>
                  <Ellipsis />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => onRename(folder)}>
                  <Pencil />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => onDelete(folder)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>
      <div ref={setNodeRef} className={cn("mt-2 min-h-24 rounded-lg transition-colors", isOver && "bg-accent-soft")}>
        {children}
      </div>
    </section>
  );
}

function EmptySection({ children }: { readonly children: ReactNode }) {
  return (
    <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-rule-strong">
      <p className="font-serif text-lg text-faint italic">{children}</p>
    </div>
  );
}

function LectureRow({
  number,
  lecture,
  status,
  readable,
  movable,
  justDragged,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  readonly number: number;
  readonly lecture: Lecture;
  readonly status: LectureStatus;
  /** False when organization.json cannot be read. The status is then unknown, so no status control is shown. */
  readonly readable: boolean;
  /** A material can be dragged only when the subject has folders to drop it on, and its organization can be read. */
  readonly movable: boolean;
  readonly justDragged: RefObject<boolean>;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onToggleStatus: () => void;
}) {
  // Only the grip starts a drag, so the rest of the row can still be clicked and scrolled.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: lecture.id });
  const done = status === "done";

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "group relative flex items-baseline gap-6 border-t border-border py-5 transition-colors hover:bg-foreground/[0.025]",
        isDragging && "opacity-40",
      )}
    >
      <span className="w-8 shrink-0 font-serif text-xl text-faint italic tabular-nums">{String(number).padStart(2, "0")}</span>
      {movable && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Move ${lecture.title}`}
          {...attributes}
          {...listeners}
          className="relative z-10 grid size-8 shrink-0 cursor-grab touch-none place-items-center self-center rounded-lg text-faint transition-colors hover:bg-foreground/5 hover:text-foreground active:cursor-grabbing [&_svg]:size-4"
        >
          <GripVertical />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <Link
          to={`/lecture/${lecture.id}`}
          onClick={(event) => {
            if (justDragged.current) event.preventDefault();
          }}
          className="line-clamp-2 font-serif text-[28px] leading-tight after:absolute after:inset-0 after:rounded-lg"
        >
          {displayTitle(lecture.title)}
        </Link>
        <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">{lectureMeta(lecture)}</p>
      </div>
      {readable && (
        <button
          type="button"
          aria-pressed={done}
          aria-label={`Mark ${lecture.title} as done`}
          onClick={onToggleStatus}
          className={cn(
            "relative inline-flex h-7 shrink-0 items-center gap-1.5 self-center rounded-full border px-3 text-xs transition-colors [&_svg]:size-3.5",
            done
              ? "border-foreground bg-foreground text-background"
              : "border-control text-muted-foreground hover:text-foreground",
          )}
        >
          {done && <Check aria-hidden />}
          {done ? "Done" : "Reading"}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Actions for ${lecture.title}`} className={cn(iconButtonClass, "relative self-center")}>
            <Ellipsis />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit details
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={onDelete}>
            <Trash2 />
            Delete material
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** A copy of a row for the drag overlay. It has no link and no controls, so it is only a picture of the row. */
function LectureRowFace({ number, lecture }: { readonly number: number; readonly lecture: Lecture }) {
  return (
    <div className="flex w-[55rem] max-w-[calc(100vw-2rem)] items-baseline gap-6 rounded-lg border border-rule bg-raised px-5 py-4 shadow-(--lift)">
      <span className="w-8 shrink-0 font-serif text-xl text-faint italic tabular-nums">{String(number).padStart(2, "0")}</span>
      <div className="min-w-0">
        <p className="line-clamp-2 font-serif text-[28px] leading-tight">{displayTitle(lecture.title)}</p>
        <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">{lectureMeta(lecture)}</p>
      </div>
    </div>
  );
}
