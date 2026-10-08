import { CalendarDays, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLibrary, useLibraryQuery, useLibraryRefresh } from "../library";
import { errorMessage } from "../lib/errors";
import { DEFAULT_SUBJECT_COLOR } from "../lib/subject-colors";
import { PlannerCardDialog } from "../planner/PlannerCardDialog";
import { PlannerGrid, type Placement, type PlannerBlock } from "../planner/PlannerGrid";
import { gridRange, toMinutes, toTime } from "../planner/time";
import { SubjectDialog } from "../subjects/SubjectDialog";
import { notifyLibraryChanged } from "../store";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { QueryError } from "../ui/query-error";

type OpenDialog =
  | { readonly kind: "new"; readonly slot: Placement }
  | { readonly kind: "edit"; readonly id: string }
  | { readonly kind: "subject" };

const FIRST_SLOT: Placement = { day: 0, start: 9 * 60, end: 10 * 60 };
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [0, 1, 2, 3, 4];

export function PlannerPage() {
  const library = useLibrary();
  const cards = useLibraryQuery((current) => current.listPlannerCards());
  const subjects = useLibraryQuery((current) => current.listSubjects());
  // Placements the user just moved or resized. They stay until the saved card matches them.
  const [overrides, setOverrides] = useState<Record<string, Placement>>({});
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [showWeekend, setShowWeekend] = useState(true);
  useLibraryRefresh();

  useEffect(() => {
    const saved = cards.data;
    if (saved === undefined) return;
    setOverrides((previous) => {
      const next = Object.fromEntries(
        Object.entries(previous).filter(([id, placement]) => {
          const card = saved.find((item) => item.id === id);
          return card !== undefined && !matchesPlacement(card, placement);
        }),
      );
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
  }, [cards.data]);

  if (cards.error !== undefined) return <QueryError error={cards.error} />;
  if (subjects.error !== undefined) return <QueryError error={subjects.error} />;
  if (cards.data === undefined || subjects.data === undefined) return null;

  const subjectList = subjects.data;
  const subjectById = new Map(subjectList.map((subject) => [subject.id, subject]));
  const blocks: PlannerBlock[] = cards.data.map((card) => {
    const subject = subjectById.get(card.subjectId);
    return {
      id: card.id,
      ...(overrides[card.id] ?? { day: card.day, start: toMinutes(card.start), end: toMinutes(card.end) }),
      name: subject?.name ?? "Deleted subject",
      color: subject?.color ?? DEFAULT_SUBJECT_COLOR,
      location: card.location,
    };
  });
  const editing = dialog?.kind === "edit" ? cards.data.find((card) => card.id === dialog.id) : undefined;
  const close = () => setDialog(null);

  function handleChange(id: string, placement: Placement, commit: boolean) {
    setOverrides((previous) => ({ ...previous, [id]: placement }));
    if (!commit) return;
    library
      .updatePlannerCard(id, { day: placement.day, start: toTime(placement.start), end: toTime(placement.end) })
      .then(
        () => notifyLibraryChanged(),
        (error: unknown) => {
          setOverrides((previous) => {
            const { [id]: _reverted, ...rest } = previous;
            return rest;
          });
          toast.error(errorMessage(error));
        },
      );
  }

  return (
    <>
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Planner</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your week, one class per time slot.</p>
        </div>
        {subjectList.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" onClick={() => setShowWeekend((shown) => !shown)}>
              {showWeekend ? "Hide weekend" : "Show weekend"}
            </Button>
            <Button variant="primary" onClick={() => setDialog({ kind: "new", slot: FIRST_SLOT })}>
              <Plus />
              Add class
            </Button>
          </div>
        )}
      </header>

      <div className="mt-8">
        {subjectList.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Create a subject first"
            action={
              <Button variant="primary" onClick={() => setDialog({ kind: "subject" })}>
                <Plus />
                Create subject
              </Button>
            }
          >
            Every class in the timetable belongs to a subject. Create one, then come back to add it here.
          </EmptyState>
        ) : (
          <>
            {cards.data.length === 0 && (
              <div className="mb-6">
                <EmptyState
                  icon={CalendarDays}
                  title="Add your first class"
                  action={
                    <Button variant="primary" onClick={() => setDialog({ kind: "new", slot: FIRST_SLOT })}>
                      <Plus />
                      Add your first class
                    </Button>
                  }
                >
                  Click an empty time slot, or drag across one, to place a class on the week.
                </EmptyState>
              </div>
            )}
            <PlannerGrid
              days={showWeekend ? ALL_DAYS : WEEKDAYS}
              blocks={blocks}
              range={gridRange(blocks)}
              onCreate={(slot) => setDialog({ kind: "new", slot })}
              onOpen={(id) => setDialog({ kind: "edit", id })}
              onChange={handleChange}
            />
          </>
        )}
      </div>

      {dialog?.kind === "new" && <PlannerCardDialog subjects={subjectList} slot={dialog.slot} onClose={close} />}
      {editing !== undefined && <PlannerCardDialog subjects={subjectList} card={editing} onClose={close} />}
      {dialog?.kind === "subject" && <SubjectDialog onClose={close} />}
    </>
  );
}

function matchesPlacement(
  card: { readonly day: number; readonly start: string; readonly end: string },
  placement: Placement,
): boolean {
  return card.day === placement.day && toMinutes(card.start) === placement.start && toMinutes(card.end) === placement.end;
}
