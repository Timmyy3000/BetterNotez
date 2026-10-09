import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ListChecks, Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { TaskStatus, type Task } from "@betternotez/core";
import { useLibrary, useLibraryQuery, useLibraryRefresh } from "../library";
import { errorMessage } from "../lib/errors";
import { EmptyState } from "../ui/empty-state";
import { PageHeader } from "../ui/page-header";
import { QueryError } from "../ui/query-error";
import { revealAt } from "../lib/motion";
import { notifyLibraryChanged } from "../store";
import { dropOver, isOverdue, localDateKey, planDrop, statusOf, toBoard, type Board, type OrderUpdate } from "../tasks/board";
import { SortableTaskCard, TaskCardFace, type TaskCardInfo } from "../tasks/TaskCard";
import { TaskDialog } from "../tasks/TaskDialog";

const COLUMN_LABELS: Record<TaskStatus, string> = { todo: "To do", doing: "Doing", done: "Done" };
const ALL_SUBJECTS = "all";
const NO_SUBJECT = "none";

/** A position the user just set and that is not saved yet, so the board does not snap back. */
interface Planned {
  readonly status: TaskStatus;
  readonly order: number;
}

export function TasksPage() {
  const library = useLibrary();
  const tasks = useLibraryQuery((current) => current.listTasks());
  const subjects = useLibraryQuery((current) => current.listSubjects());
  const lectures = useLibraryQuery((current) => current.listLectures());
  const [planned, setPlanned] = useState<Record<string, Planned>>({});
  // Drag events can arrive before React re-renders, so the handlers read these refs, which update at once.
  const savedRef = useRef<readonly Task[]>([]);
  const plannedRef = useRef<Record<string, Planned>>({});
  const placeAfterRef = useRef(false);
  const [filter, setFilter] = useState(ALL_SUBJECTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // A pointer drag ends with a click on the card it started from. Opening the editor there would be wrong.
  const justDragged = useRef(false);
  useLibraryRefresh();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const saved = tasks.data;
    if (saved === undefined) return;
    savedRef.current = saved;
    const previous = plannedRef.current;
    const next = Object.fromEntries(
      Object.entries(previous).filter(([id, position]) => {
        const task = saved.find((item) => item.id === id);
        return task !== undefined && (task.status !== position.status || task.order !== position.order);
      }),
    );
    if (Object.keys(next).length !== Object.keys(previous).length) updatePlanned(next);
  }, [tasks.data]);

  if (tasks.error !== undefined) return <QueryError error={tasks.error} />;
  if (subjects.error !== undefined) return <QueryError error={subjects.error} />;
  if (lectures.error !== undefined) return <QueryError error={lectures.error} />;
  if (tasks.data === undefined || subjects.data === undefined || lectures.data === undefined) return null;

  const saved = tasks.data;
  const subjectList = subjects.data;
  const lectureList = lectures.data;
  const board = toBoard(saved.map((task) => (planned[task.id] === undefined ? task : { ...task, ...planned[task.id] })));
  const subjectById = new Map(subjectList.map((subject) => [subject.id, subject]));
  const lectureById = new Map(lectureList.map((lecture) => [lecture.id, lecture]));
  const today = localDateKey(new Date());
  const activeTask = activeId === null ? undefined : Object.values(board).flat().find((task) => task.id === activeId);
  const editing = editingId === null ? undefined : saved.find((task) => task.id === editingId);

  function infoFor(task: Task): TaskCardInfo {
    return {
      task,
      subject: task.subjectId === undefined ? undefined : subjectById.get(task.subjectId),
      lectureTitle: task.lectureId === undefined ? undefined : lectureById.get(task.lectureId)?.title,
      overdue: isOverdue(task, today),
    };
  }

  function visible(task: Task): boolean {
    if (filter === ALL_SUBJECTS) return true;
    if (filter === NO_SUBJECT) return task.subjectId === undefined;
    return task.subjectId === filter;
  }

  function updatePlanned(next: Record<string, Planned>) {
    plannedRef.current = next;
    setPlanned(next);
  }

  function currentBoard(): Board {
    return toBoard(
      savedRef.current.map((task) => {
        const position = plannedRef.current[task.id];
        return position === undefined ? task : { ...task, ...position };
      }),
    );
  }

  function handleDragStart({ active }: DragStartEvent) {
    placeAfterRef.current = false;
    setActiveId(String(active.id));
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (over === null) return;
    const board = currentBoard();
    const taskId = String(active.id);
    const translated = active.rect.current.translated;
    placeAfterRef.current =
      translated !== null && translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2;
    const drop = dropOver(board, taskId, String(over.id), placeAfterRef.current);
    if (drop === undefined || drop.status === statusOf(board, taskId)) return;
    updatePlanned({ ...plannedRef.current, ...toPlanned(planDrop(board, taskId, drop)) });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    justDragged.current = true;
    window.setTimeout(() => {
      justDragged.current = false;
    }, 0);

    const board = currentBoard();
    const taskId = String(active.id);
    const drop = over === null ? undefined : dropOver(board, taskId, String(over.id), placeAfterRef.current);
    const updates = drop === undefined ? [] : planDrop(board, taskId, drop);
    const writes = updates.filter((update) => differsFromSaved(savedRef.current, update));
    if (writes.length === 0) {
      updatePlanned({});
      return;
    }
    updatePlanned({ ...plannedRef.current, ...toPlanned(updates) });
    void saveOrders(writes);
  }

  function handleDragCancel() {
    setActiveId(null);
    updatePlanned({});
  }

  async function saveOrders(writes: readonly OrderUpdate[]) {
    try {
      for (const write of writes) {
        await library.updateTask(write.id, { status: write.status, order: write.order });
      }
    } catch (error) {
      updatePlanned({});
      toast.error(errorMessage(error));
    }
    notifyLibraryChanged();
  }

  async function addTask(title: string, status: TaskStatus) {
    try {
      await library.createTask({ title, status });
      notifyLibraryChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function openTask(id: string) {
    if (!justDragged.current) setEditingId(id);
  }

  return (
    <>
      <PageHeader
        title="Tasks"
        eyebrow="Study tasks"
        description="From To do to Done."
        actions={
          <div className="flex flex-col items-start gap-1.5">
            <span className="label">Subject</span>
            <div className="relative">
              <select
                aria-label="Filter by subject"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="min-w-52 cursor-pointer appearance-none border-0 border-b border-rule-strong bg-transparent py-2 pr-8 text-[17px] text-foreground transition-colors focus:border-accent"
              >
                <option value={ALL_SUBJECTS}>All subjects</option>
                <option value={NO_SUBJECT}>No subject</option>
                {subjectList.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute top-[40%] right-1.5 size-[7px] -translate-y-1/2 rotate-45 border-r-[1.5px] border-b-[1.5px] border-muted-foreground"
              />
            </div>
          </div>
        }
      />

      {saved.length === 0 && (
        <div className="mt-8">
          <EmptyState icon={ListChecks} title="Plan your study tasks">
            Type a task in the To do column. Drag it to Doing when you start, and to Done when you finish.
          </EmptyState>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="rise grid md:grid-cols-3" style={revealAt(2)}>
          {TaskStatus.options.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={board[status].filter(visible)}
              infoFor={infoFor}
              onOpen={openTask}
              onAdd={(title) => addTask(title, status)}
            />
          ))}
        </div>
        <DragOverlay>{activeTask === undefined ? null : <TaskCardFace info={infoFor(activeTask)} />}</DragOverlay>
      </DndContext>

      {editing !== undefined && (
        <TaskDialog
          key={editing.id}
          task={editing}
          subjects={subjectList}
          lectures={lectureList}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}

function BoardColumn({
  status,
  tasks,
  infoFor,
  onOpen,
  onAdd,
}: {
  readonly status: TaskStatus;
  readonly tasks: readonly Task[];
  readonly infoFor: (task: Task) => TaskCardInfo;
  readonly onOpen: (id: string) => void;
  readonly onAdd: (title: string) => Promise<void>;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const label = COLUMN_LABELS[status];

  return (
    <section aria-label={label} className="flex min-h-72 min-w-0 flex-col px-7 first:pl-0 last:pr-0 md:border-l md:border-rule first:md:border-l-0">
      <header className="flex items-baseline justify-between border-b-2 border-foreground pb-3">
        <h2 className="text-[34px] leading-none">{label}</h2>
        <span className="font-serif text-[22px] text-faint italic tabular-nums">{tasks.length}</span>
      </header>
      <AddTaskForm label={label} onAdd={onAdd} />
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="mt-4 flex flex-1 flex-col gap-3.5">
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} info={infoFor(task)} onEdit={() => onOpen(task.id)} />
          ))}
          {tasks.length === 0 && <div className="flex-1 rounded-lg border border-dashed border-rule-strong" />}
        </div>
      </SortableContext>
    </section>
  );
}

function AddTaskForm({ label, onAdd }: { readonly label: string; readonly onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === "") return;
    setTitle("");
    await onAdd(trimmed);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 flex items-center gap-2.5 border-b border-rule-strong pt-2.5 pb-2 text-faint transition-colors duration-200 focus-within:border-accent"
    >
      <Plus aria-hidden className="size-4 shrink-0" />
      <input
        aria-label={`Add a task to ${label}`}
        placeholder="Add a task"
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-faint"
      />
    </form>
  );
}

function toPlanned(updates: readonly OrderUpdate[]): Record<string, Planned> {
  return Object.fromEntries(updates.map((update) => [update.id, { status: update.status, order: update.order }]));
}

function differsFromSaved(saved: readonly Task[], update: OrderUpdate): boolean {
  const current = saved.find((task) => task.id === update.id);
  return current === undefined || current.status !== update.status || current.order !== update.order;
}
