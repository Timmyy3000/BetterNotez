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
import { ListChecks } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { TaskStatus, type Task } from "@betternotez/core";
import { useLibrary, useLibraryQuery, useLibraryRefresh } from "../library";
import { errorMessage } from "../lib/errors";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { QueryError } from "../ui/query-error";
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
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">Drag each task from To do to Doing, then to Done.</p>
        </div>
        <select
          aria-label="Filter by subject"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="h-9 shrink-0 rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
        >
          <option value={ALL_SUBJECTS}>All subjects</option>
          <option value={NO_SUBJECT}>No subject</option>
          {subjectList.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </header>

      {saved.length === 0 && (
        <div className="mt-8">
          <EmptyState icon={ListChecks} title="Plan your study tasks">
            Type a task into To do. Drag it to Doing when you start, and to Done when you finish.
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
        <div className="mt-8 grid items-start gap-4 md:grid-cols-3">
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
    <section aria-label={label} className="flex min-h-72 flex-col rounded-2xl bg-muted/60 p-3">
      <header className="flex items-center justify-between px-1 pb-3">
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </header>
      <AddTaskForm label={label} onAdd={onAdd} />
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="mt-3 flex flex-1 flex-col gap-2">
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} info={infoFor(task)} onEdit={() => onOpen(task.id)} />
          ))}
          {tasks.length === 0 && <div className="flex-1 rounded-xl border border-dashed border-border" />}
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
    <form onSubmit={handleSubmit}>
      <Input
        aria-label={`Add a task to ${label}`}
        placeholder="Add a task"
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="bg-surface"
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
