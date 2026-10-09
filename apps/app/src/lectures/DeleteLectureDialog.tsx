import type { Lecture } from "@betternotez/core";
import { toast } from "sonner";
import { useState } from "react";
import { useLibrary } from "../library";
import { errorMessage } from "../lib/errors";
import { notifyLibraryChanged } from "../store";
import { Button } from "../ui/button";
import { DialogActions, ModalDialog } from "../ui/dialog";

export function DeleteLectureDialog({ lecture, onClose }: { readonly lecture: Lecture; readonly onClose: () => void }) {
  const library = useLibrary();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await library.deleteLecture(lecture.id);
      onClose();
      notifyLibraryChanged();
      toast.success(`Deleted ${lecture.title}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <ModalDialog
      title={`Delete ${lecture.title}?`}
      description="This can't be undone."
      onClose={onClose}
    >
      <p className="text-sm text-muted-foreground">
        This removes the material's PDF, its annotations, and its notes. Tasks linked to it stay, but lose the link.
      </p>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
          Delete material
        </Button>
      </DialogActions>
    </ModalDialog>
  );
}
