import type { PlannerCard, Subject } from "@betternotez/core";
import { toast } from "sonner";
import { useState, type FormEvent } from "react";
import { useLibrary } from "../library";
import { errorMessage } from "../lib/errors";
import { notifyLibraryChanged } from "../store";
import { Button } from "../ui/button";
import { DialogActions, ModalDialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { DAY_NAMES, toMinutes, toTime, type Span } from "./time";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25";

/** Adds a class when `card` is absent, and edits or removes it otherwise. */
export function PlannerCardDialog({
  subjects,
  card,
  slot,
  onClose,
}: {
  readonly subjects: readonly Subject[];
  readonly card?: PlannerCard;
  /** Prefill for a new class, from a press on the grid. */
  readonly slot?: { readonly day: number } & Span;
  readonly onClose: () => void;
}) {
  const library = useLibrary();
  const [subjectId, setSubjectId] = useState(card?.subjectId ?? subjects[0]?.id ?? "");
  const [day, setDay] = useState(card?.day ?? slot?.day ?? 0);
  const [start, setStart] = useState(card?.start ?? toTime(slot?.start ?? 9 * 60));
  const [end, setEnd] = useState(card?.end ?? toTime(slot?.end ?? 10 * 60));
  const [location, setLocation] = useState(card?.location ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const trimmedLocation = location.trim();
  const timesValid = toMinutes(start) < toMinutes(end);
  const subjectName = subjects.find((subject) => subject.id === subjectId)?.name ?? "this class";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!timesValid || saving) return;
    setSaving(true);
    try {
      if (card === undefined) {
        await library.createPlannerCard({
          subjectId,
          day,
          start,
          end,
          location: trimmedLocation === "" ? undefined : trimmedLocation,
        });
      } else {
        await library.updatePlannerCard(card.id, {
          subjectId,
          day,
          start,
          end,
          location: trimmedLocation === "" ? null : trimmedLocation,
        });
      }
      notifyLibraryChanged();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (card === undefined) return;
    setSaving(true);
    try {
      await library.removePlannerCard(card.id);
      notifyLibraryChanged();
      onClose();
      toast.success(`Removed ${subjectName} from your timetable`);
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  if (confirmingRemoval && card !== undefined) {
    return (
      <ModalDialog
        title={`Remove ${subjectName}?`}
        description="This takes the class off your timetable. The subject and its lectures stay."
        onClose={onClose}
      >
        <DialogActions>
          <Button onClick={() => setConfirmingRemoval(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleRemove} disabled={saving}>
            Remove class
          </Button>
        </DialogActions>
      </ModalDialog>
    );
  }

  return (
    <ModalDialog
      title={card === undefined ? "Add class" : "Edit class"}
      description="Choose the subject and when it meets each week."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Subject</span>
          <select className={SELECT_CLASS} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Day</span>
            <select className={SELECT_CLASS} value={day} onChange={(event) => setDay(Number(event.target.value))}>
              {DAY_NAMES.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Start</span>
            <Input type="time" step={900} value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">End</span>
            <Input type="time" step={900} value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
        {!timesValid && <p className="text-sm text-danger">The end time must be after the start time.</p>}

        <label className="block space-y-2">
          <span className="text-sm font-medium">Location (optional)</span>
          <Input
            maxLength={80}
            value={location}
            placeholder="e.g. Room B2"
            onChange={(event) => setLocation(event.target.value)}
          />
        </label>

        <div className="mt-6 flex items-center gap-2">
          {card !== undefined && (
            <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirmingRemoval(true)}>
              Remove
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!timesValid || subjectId === "" || saving}>
              {card === undefined ? "Add class" : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
    </ModalDialog>
  );
}
