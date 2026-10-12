import type { Folder } from "@betternotez/core";
import { toast } from "sonner";
import { useState } from "react";
import { useLibrary } from "../library";
import { errorMessage } from "../lib/errors";
import { countLabel } from "../lib/format";
import { notifyLibraryChanged } from "../store";
import { Button } from "../ui/button";
import { DialogActions, ModalDialog } from "../ui/dialog";

export function DeleteFolderDialog({
  subjectId,
  folder,
  materialCount,
  onClose,
}: {
  readonly subjectId: string;
  readonly folder: Folder;
  readonly materialCount: number;
  readonly onClose: () => void;
}) {
  const library = useLibrary();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await library.deleteFolder(subjectId, folder.id);
      onClose();
      notifyLibraryChanged();
      toast.success(`Deleted ${folder.name}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <ModalDialog title={`Delete ${folder.name}?`} description="This can't be undone." onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        {materialCount === 0
          ? "The folder is empty, so nothing moves."
          : `${countLabel(materialCount, "material")} ${materialCount === 1 ? "moves" : "move"} to Unfiled. Their PDFs and notes stay.`}
      </p>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
          Delete folder
        </Button>
      </DialogActions>
    </ModalDialog>
  );
}
