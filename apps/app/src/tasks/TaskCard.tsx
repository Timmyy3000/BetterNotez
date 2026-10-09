import type { Subject, Task } from "@betternotez/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Pencil } from "lucide-react";
import type { PointerEvent, KeyboardEvent } from "react";
import { cn } from "../lib/cn";
import { formatLectureDate } from "../lib/format";
import { subjectTone } from "../lib/subject-colors";
import { iconButtonClass } from "../ui/button";
import { cardClass } from "../ui/card";

export interface TaskCardInfo {
  readonly task: Task;
  readonly subject?: Subject;
  readonly lectureTitle?: string;
  readonly overdue: boolean;
}

/** A card in a column. Dragging it moves it, and a click or the pencil opens the editor. */
export function SortableTaskCard({ info, onEdit }: { readonly info: TaskCardInfo; readonly onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: info.task.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onEdit}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-none cursor-grab rounded-lg active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <TaskCardFace info={info} onEdit={onEdit} />
    </div>
  );
}

/** The card's look without drag behavior, so the drag overlay can show a copy of it. */
export function TaskCardFace({ info, onEdit }: { readonly info: TaskCardInfo; readonly onEdit?: () => void }) {
  const { task, subject, lectureTitle, overdue } = info;
  const stop = (event: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => event.stopPropagation();

  return (
    <div className={cn(cardClass, "p-3 shadow-sm hover:shadow-md")}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm leading-snug font-medium break-words">{task.title}</p>
        {onEdit !== undefined && (
          <button
            type="button"
            aria-label={`Edit ${task.title}`}
            className={cn(iconButtonClass, "-mt-1 -mr-1")}
            onPointerDown={stop}
            onKeyDown={stop}
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Pencil />
          </button>
        )}
      </div>
      {(subject !== undefined || lectureTitle !== undefined || task.due !== undefined) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {subject !== undefined && (
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: subjectTone(subject.color) }} aria-hidden />
              <span className="truncate">{subject.name}</span>
            </span>
          )}
          {lectureTitle !== undefined && <span className="min-w-0 truncate">{lectureTitle}</span>}
          {task.due !== undefined && (
            <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-danger")}>
              <CalendarDays className="size-3.5" />
              {formatLectureDate(task.due)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
