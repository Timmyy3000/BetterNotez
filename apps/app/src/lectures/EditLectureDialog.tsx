import type { Folder, Lecture } from "@betternotez/core";
import { toast } from "sonner";
import { useState, type FormEvent } from "react";
import { useLibrary } from "../library";
import { errorMessage } from "../lib/errors";
import { notifyLibraryChanged } from "../store";
import { Button } from "../ui/button";
import { DialogActions, ModalDialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { SelectField } from "../ui/select";

const NO_FOLDER = "";

export function EditLectureDialog({
  lecture,
  folders,
  folderId,
  onClose,
}: {
  readonly lecture: Lecture;
  readonly folders: readonly Folder[];
  readonly folderId: string | undefined;
  readonly onClose: () => void;
}) {
  const library = useLibrary();
  const [title, setTitle] = useState(lecture.title);
  const [date, setDate] = useState(lecture.date ?? "");
  const [openedFolder] = useState(folderId ?? NO_FOLDER);
  const [folder, setFolder] = useState(openedFolder);
  const [saving, setSaving] = useState(false);
  const trimmed = title.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await library.updateLecture(lecture.id, { title: trimmed, date: date === "" ? null : date });
      if (folder !== openedFolder) {
        await library.moveLecture(lecture.id, folder === NO_FOLDER ? null : folder);
      }
      notifyLibraryChanged();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <ModalDialog
      title="Edit material"
      description="Change the title, the date, or the folder. The PDF stays as it is."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Title</span>
          <Input autoFocus maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Date (optional)</span>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        {folders.length > 0 && (
          <SelectField
            label="Folder"
            value={folder}
            onValueChange={setFolder}
            options={[
              { value: NO_FOLDER, label: "Not in a folder" },
              ...folders.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        )}
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={trimmed === "" || saving}>
            Save changes
          </Button>
        </DialogActions>
      </form>
    </ModalDialog>
  );
}
