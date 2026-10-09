import type { Lecture } from "@betternotez/core";
import { Ellipsis, FileText, Pencil, Trash2, Upload } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Link, useParams } from "react-router";
import { DeleteLectureDialog } from "../lectures/DeleteLectureDialog";
import { EditLectureDialog } from "../lectures/EditLectureDialog";
import { ImportDialog } from "../lectures/ImportDialog";
import { useLibraryQuery } from "../library";
import { cn } from "../lib/cn";
import { countLabel, displayTitle, lectureMeta } from "../lib/format";
import { revealAt } from "../lib/motion";
import { subjectTone } from "../lib/subject-colors";
import { sortLectures } from "../lib/lectures";
import { selectPdfs } from "../pdf/import";
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
        description={countLabel(ordered.length, "material")}
        actions={
          <>
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
          </>
        }
      />

      <div className="rise" style={revealAt(2)}>
        {ordered.length === 0 ? (
          <EmptyState icon={FileText} title="No material yet">
            Drop PDFs anywhere on this page, or click Import PDF.
          </EmptyState>
        ) : (
          <ol className="border-b border-border">
            {ordered.map((lecture, index) => (
              <LectureRow
                key={lecture.id}
                number={index + 1}
                lecture={lecture}
                onEdit={() => setDialog({ kind: "edit-lecture", lecture })}
                onDelete={() => setDialog({ kind: "delete-lecture", lecture })}
              />
            ))}
          </ol>
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
  number,
  lecture,
  onEdit,
  onDelete,
}: {
  readonly number: number;
  readonly lecture: Lecture;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <li className="group relative flex items-baseline gap-6 border-t border-border py-5 transition-colors hover:bg-foreground/[0.025]">
      <span className="w-8 shrink-0 font-serif text-xl text-faint italic tabular-nums">{String(number).padStart(2, "0")}</span>
      <div className="min-w-0 flex-1">
        <Link
          to={`/lecture/${lecture.id}`}
          className="line-clamp-2 font-serif text-[28px] leading-tight after:absolute after:inset-0 after:rounded-lg"
        >
          {displayTitle(lecture.title)}
        </Link>
        <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">{lectureMeta(lecture)}</p>
      </div>
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
