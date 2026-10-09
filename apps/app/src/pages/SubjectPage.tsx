import type { Lecture } from "@betternotez/core";
import { Ellipsis, FileText, Pencil, Trash2, Upload } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Link, useParams } from "react-router";
import { DeleteLectureDialog } from "../lectures/DeleteLectureDialog";
import { EditLectureDialog } from "../lectures/EditLectureDialog";
import { ImportDialog } from "../lectures/ImportDialog";
import { useLibraryQuery } from "../library";
import { cn } from "../lib/cn";
import { countLabel, lectureMeta } from "../lib/format";
import { sortLectures } from "../lib/lectures";
import { selectPdfs } from "../pdf/import";
import { DeleteSubjectDialog } from "../subjects/DeleteSubjectDialog";
import { SubjectDialog } from "../subjects/SubjectDialog";
import { Button, iconButtonClass } from "../ui/button";
import { cardClass } from "../ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { EmptyState } from "../ui/empty-state";
import { QueryError } from "../ui/query-error";

type OpenDialog =
  | { readonly kind: "rename" }
  | { readonly kind: "delete-subject" }
  | { readonly kind: "import"; readonly files: readonly File[] }
  | { readonly kind: "edit-lecture"; readonly lecture: Lecture }
  | { readonly kind: "delete-lecture"; readonly lecture: Lecture };

export function SubjectPage() {
  const { subjectId = "" } = useParams();
  const subject = useLibraryQuery((library) => library.getSubject(subjectId), [subjectId]);
  const lectures = useLibraryQuery((library) => library.listLectures(subjectId), [subjectId]);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [dragging, setDragging] = useState(false);

  if (subject.error !== undefined) {
    return <QueryError error={subject.error} />;
  }
  if (lectures.error !== undefined) {
    return <QueryError error={lectures.error} />;
  }
  if (subject.data === undefined || lectures.data === undefined) {
    return null;
  }

  const current = subject.data;
  const ordered = sortLectures(lectures.data);
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

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/70 text-lg font-medium text-accent">
          Drop PDFs to add them to {current.name}
        </div>
      )}

      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: current.color }} aria-hidden />
            Subject
          </p>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">{current.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{countLabel(ordered.length, "lecture")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="primary" onClick={() => setDialog({ kind: "import", files: [] })}>
            <Upload />
            Import PDF
          </Button>
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
        </div>
      </header>

      <div className="mt-8">
        {ordered.length === 0 ? (
          <EmptyState icon={FileText} title="No lectures yet">
            Drop lecture PDFs anywhere on this page, or click Import PDF.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {ordered.map((lecture) => (
              <LectureRow
                key={lecture.id}
                lecture={lecture}
                onEdit={() => setDialog({ kind: "edit-lecture", lecture })}
                onDelete={() => setDialog({ kind: "delete-lecture", lecture })}
              />
            ))}
          </ul>
        )}
      </div>

      {dialog?.kind === "rename" && <SubjectDialog subject={current} onClose={close} />}
      {dialog?.kind === "delete-subject" && (
        <DeleteSubjectDialog subject={current} lectureCount={ordered.length} onClose={close} />
      )}
      {dialog?.kind === "import" && (
        <ImportDialog subjectId={current.id} initialFiles={dialog.files} onClose={close} />
      )}
      {dialog?.kind === "edit-lecture" && <EditLectureDialog lecture={dialog.lecture} onClose={close} />}
      {dialog?.kind === "delete-lecture" && <DeleteLectureDialog lecture={dialog.lecture} onClose={close} />}
    </div>
  );
}

function LectureRow({
  lecture,
  onEdit,
  onDelete,
}: {
  readonly lecture: Lecture;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <li className={cn(cardClass, "relative flex items-center gap-4 px-4 py-3")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        <FileText className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <Link
          to={`/lecture/${lecture.id}`}
          className="block truncate font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-accent"
        >
          {lecture.title}
        </Link>
        <p className="mt-0.5 text-sm text-muted-foreground">{lectureMeta(lecture)}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${lecture.title}`}
            className={cn(iconButtonClass, "relative")}
          >
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
            Delete lecture
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
