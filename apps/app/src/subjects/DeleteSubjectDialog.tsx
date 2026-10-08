import type { Subject } from "@betternotez/core";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useLibrary, useLibraryQuery } from "../library";
import { errorMessage } from "../lib/errors";
import { countLabel } from "../lib/format";
import { notifyLibraryChanged } from "../store";
import { Button } from "../ui/button";
import { DialogActions, ModalDialog } from "../ui/dialog";

export function DeleteSubjectDialog({
  subject,
  lectureCount,
  onClose,
}: {
  readonly subject: Subject;
  readonly lectureCount: number;
  readonly onClose: () => void;
}) {
  const library = useLibrary();
  const navigate = useNavigate();
  const planner = useLibraryQuery((current) => current.listPlannerCards());
  const cardCount = planner.data?.filter((card) => card.subjectId === subject.id).length ?? 0;
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await library.deleteSubject(subject.id);
      onClose();
      navigate("/");
      notifyLibraryChanged();
      toast.success(`Deleted ${subject.name}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <ModalDialog
      title={`Delete ${subject.name}?`}
      description="There is no trash, so this cannot be undone."
      onClose={onClose}
    >
      <p className="text-sm">This removes:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{countLabel(lectureCount, "lecture")}, with their PDFs, annotations, and notes</li>
        <li>{countLabel(cardCount, "planner card")}</li>
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">Tasks linked to this subject stay, but lose the link.</p>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
          Delete subject
        </Button>
      </DialogActions>
    </ModalDialog>
  );
}
