import type { Lecture, Subject, Task } from "@betternotez/core";
import { toast } from "sonner";
import { useState, type FormEvent } from "react";
import { useLibrary } from "../library";
import { errorMessage } from "../lib/errors";
import { notifyLibraryChanged } from "../store";
import { Button } from "../ui/button";
import { DialogActions, ModalDialog } from "../ui/dialog";
import { Input } from "../ui/input";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-control bg-background px-3 text-[15px] outline-none transition-colors focus:border-accent disabled:opacity-50";

export function TaskDialog({
  task,
  subjects,
  lectures,
  onClose,
}: {
  readonly task: Task;
  readonly subjects: readonly Subject[];
  readonly lectures: readonly Lecture[];
  readonly onClose: () => void;
}) {
  const library = useLibrary();
  const [title, setTitle] = useState(task.title);
  const [subjectId, setSubjectId] = useState(task.subjectId ?? "");
  const [lectureId, setLectureId] = useState(task.lectureId ?? "");
  const [due, setDue] = useState(task.due ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const trimmed = title.trim();
  const subjectLectures = lectures.filter((lecture) => lecture.subjectId === subjectId);
  const linkedLectureId = subjectLectures.some((lecture) => lecture.id === lectureId) ? lectureId : "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await library.updateTask(task.id, {
        title: trimmed,
        subjectId: subjectId === "" ? null : subjectId,
        lectureId: linkedLectureId === "" ? null : linkedLectureId,
        due: due === "" ? null : due,
      });
      notifyLibraryChanged();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await library.removeTask(task.id);
      notifyLibraryChanged();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  if (confirmingDelete) {
    return (
      <ModalDialog title={`Delete ${task.title}?`} description="This can't be undone." onClose={onClose}>
        <DialogActions>
          <Button onClick={() => setConfirmingDelete(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={saving}>
            Delete task
          </Button>
        </DialogActions>
      </ModalDialog>
    );
  }

  return (
    <ModalDialog title="Edit task" description="Link it to a subject, a lecture, or a due date." onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Title</span>
          <Input autoFocus maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Subject</span>
          <select
            className={SELECT_CLASS}
            value={subjectId}
            onChange={(event) => {
              setSubjectId(event.target.value);
            }}
          >
            <option value="">No subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Lecture</span>
          <select
            className={SELECT_CLASS}
            value={linkedLectureId}
            disabled={subjectId === ""}
            onChange={(event) => setLectureId(event.target.value)}
          >
            <option value="">No lecture</option>
            {subjectLectures.map((lecture) => (
              <option key={lecture.id} value={lecture.id}>
                {lecture.title}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <label htmlFor="task-due" className="block text-sm font-medium">
            Due date
          </label>
          <div className="flex items-center gap-2">
            <Input id="task-due" type="date" value={due} onChange={(event) => setDue(event.target.value)} />
            {due !== "" && (
              <Button variant="ghost" onClick={() => setDue("")}>
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={trimmed === "" || saving}>
              Save changes
            </Button>
          </div>
        </div>
      </form>
    </ModalDialog>
  );
}
