import type { Subject } from "@betternotez/core";
import { toast } from "sonner";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useLibrary } from "../library";
import { errorMessage } from "../lib/errors";
import { cn } from "../lib/cn";
import { DEFAULT_SUBJECT_COLOR, SUBJECT_COLORS } from "../lib/subject-colors";
import { notifyLibraryChanged } from "../store";
import { Button } from "../ui/button";
import { DialogActions, ModalDialog } from "../ui/dialog";
import { Input } from "../ui/input";

/** Creates a subject, or renames and recolors the one passed in. */
export function SubjectDialog({ subject, onClose }: { readonly subject?: Subject; readonly onClose: () => void }) {
  const library = useLibrary();
  const navigate = useNavigate();
  const [name, setName] = useState(subject?.name ?? "");
  const [color, setColor] = useState(subject?.color ?? DEFAULT_SUBJECT_COLOR);
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      if (subject === undefined) {
        const created = await library.createSubject({ name: trimmed, color });
        onClose();
        navigate(`/subjects/${created.id}`);
      } else {
        await library.updateSubject(subject.id, { name: trimmed, color });
        onClose();
      }
      notifyLibraryChanged();
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <ModalDialog
      title={subject === undefined ? "New subject" : "Rename subject"}
      description={
        subject === undefined
          ? "A subject groups the lecture PDFs for one course."
          : "Change the name or the color."
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Name</span>
          <Input
            autoFocus
            maxLength={80}
            value={name}
            placeholder="e.g. Digital Systems"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="space-y-2">
          <p className="text-sm font-medium">Color</p>
          <div role="group" aria-label="Color" className="flex flex-wrap gap-2.5">
            {SUBJECT_COLORS.map(({ name: colorName, hex }) => (
              <button
                key={hex}
                type="button"
                aria-label={colorName}
                aria-pressed={color === hex}
                onClick={() => setColor(hex)}
                className={cn(
                  "size-8 rounded-full outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  color === hex && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={trimmed === "" || saving}>
            {subject === undefined ? "Create subject" : "Save changes"}
          </Button>
        </DialogActions>
      </form>
    </ModalDialog>
  );
}
