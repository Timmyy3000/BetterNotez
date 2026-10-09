import type { Subject, Task } from "@betternotez/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Check, Pencil } from "lucide-react";
import type { PointerEvent, KeyboardEvent } from "react";
import { cn } from "../lib/cn";
import { displayTitle, formatLectureDate } from "../lib/format";
import { subjectTone } from "../lib/subject-colors";
import { iconButtonClass } from "../ui/button";

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

/**
 * The card's look without drag behavior, so the drag overlay can show a copy of it.
 * It is an index card: paper, a fine rule, and a vermilion spine when the task is overdue.
 */
export function TaskCardFace({ info, onEdit }: { readonly info: TaskCardInfo; readonly onEdit?: () => void }) {
  const { task, subject, lectureTitle, overdue } = info;
  const done = task.status === "done";
  const stop = (event: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => event.stopPropagation();

  return (
    <div
      className={cn(
        "grain relative flex flex-col gap-3 rounded-lg border border-rule bg-surface py-4 pr-4 pl-[18px] shadow-[0_1px_0_var(--rule)] transition-[border-color] duration-200 hover:border-rule-strong",
        overdue &&
          "before:absolute before:-top-px before:-bottom-px before:-left-px before:w-[3px] before:rounded-l-sm before:bg-accent before:content-['']",
      )}
    >
      <div className="flex items-start gap-2.5">
        {done && (
          <span aria-hidden className="mt-1 grid size-[18px] shrink-0 place-items-center rounded-full bg-faint text-surface [&_svg]:size-3 [&_svg]:stroke-[2.2px]">
            <Check />
          </span>
        )}
        <p
          className={cn(
            "min-w-0 flex-1 font-serif text-[23px] leading-[1.16] break-words",
            done && "text-muted-foreground",
          )}
        >
          {task.title}
        </p>
        {onEdit !== undefined && (
          <button
            type="button"
            aria-label={`Edit ${task.title}`}
            className={cn(iconButtonClass, "-mt-1 -mr-1.5")}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
          {subject !== undefined && (
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="ink-dot" style={{ backgroundColor: subjectTone(subject.color) }} aria-hidden />
              <span className="truncate">{subject.name}</span>
            </span>
          )}
          {lectureTitle !== undefined && <span className="min-w-0 truncate">{displayTitle(lectureTitle)}</span>}
          {task.due !== undefined && (
            <span className={cn("inline-flex items-center gap-1.5 tabular-nums", overdue && "font-semibold text-foreground")}>
              <CalendarDays className="size-3.5" />
              {overdue && <span className="sr-only">Overdue, </span>}
              {formatLectureDate(task.due)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
