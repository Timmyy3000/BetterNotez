import { CalendarDays, ListChecks } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "../ui/empty-state";

export function PlannerPage() {
  return (
    <ComingSoon title="Planner" icon={CalendarDays}>
      A weekly timetable where each subject is a card in its time slot.
    </ComingSoon>
  );
}

export function TasksPage() {
  return (
    <ComingSoon title="Tasks" icon={ListChecks}>
      A simple board to track study tasks: To do, Doing, and Done.
    </ComingSoon>
  );
}

function ComingSoon({
  title,
  icon,
  children,
}: {
  readonly title: string;
  readonly icon: LucideIcon;
  readonly children: string;
}) {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-8">
        <EmptyState icon={icon} title="Coming soon">
          {children}
        </EmptyState>
      </div>
    </>
  );
}
