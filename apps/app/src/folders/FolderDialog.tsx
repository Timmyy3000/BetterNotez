import type { Folder } from "@betternotez/core";
import { toast } from "sonner";
import { useState, type FormEvent } from "react";
import { useLibrary } from "../library";
import { errorMessage } from "../lib/errors";
import { notifyLibraryChanged } from "../store";
import { Button } from "../ui/button";
import { DialogActions, ModalDialog } from "../ui/dialog";
import { Input } from "../ui/input";

/** Creates a folder in a subject, or renames the one passed in. */
export function FolderDialog({
  subjectId,
  folder,
  onClose,
}: {
  readonly subjectId: string;
  readonly folder?: Folder;
  readonly onClose: () => void;
}) {
  const library = useLibrary();
  const [name, setName] = useState(folder?.name ?? "");
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      if (folder === undefined) {
        await library.createFolder(subjectId, trimmed);
      } else {
        await library.renameFolder(subjectId, folder.id, trimmed);
      }
      onClose();
      notifyLibraryChanged();
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <ModalDialog
      title={folder === undefined ? "New folder" : "Rename folder"}
      description={
        folder === undefined
          ? "A folder groups the material in this subject. Drag material onto it."
          : "Change the name of this folder."
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="grid gap-2.5">
          <span className="text-sm font-medium">Name</span>
          <Input
            autoFocus
            maxLength={80}
            value={name}
            placeholder="e.g. Week 1"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={trimmed === "" || saving}>
            {folder === undefined ? "Create folder" : "Save changes"}
          </Button>
        </DialogActions>
      </form>
    </ModalDialog>
  );
}
