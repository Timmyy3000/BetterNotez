import { BookOpen, CalendarDays, ListChecks, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router";
import { useLibraryQuery } from "../library";
import { cn } from "../lib/cn";
import { SubjectDialog } from "../subjects/SubjectDialog";
import { IconButton } from "../ui/tooltip";

const NAV_ITEMS = [
  { to: "/planner", label: "Planner", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/search", label: "Search", icon: Search },
] as const;

export function Sidebar() {
  const subjects = useLibraryQuery((library) => library.listSubjects());
  const [creating, setCreating] = useState(false);

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 bg-sidebar px-3 py-5">
      <Link to="/" className="flex items-center gap-2.5 rounded-lg px-2 font-semibold tracking-tight outline-none">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
          <BookOpen className="size-4" />
        </span>
        BetterNotez
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => navItemClass(isActive)}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between pr-1 pl-3">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Subjects</h2>
          <IconButton label="New subject" onClick={() => setCreating(true)}>
            <Plus />
          </IconButton>
        </div>
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {subjects.data?.map((subject) => (
            <li key={subject.id}>
              <NavLink to={`/subjects/${subject.id}`} className={({ isActive }) => navItemClass(isActive)}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
                <span className="truncate">{subject.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {subjects.data?.length === 0 && <p className="px-3 text-sm text-muted-foreground">No subjects yet.</p>}
      </section>

      {creating && <SubjectDialog onClose={() => setCreating(false)} />}
    </aside>
  );
}

function navItemClass(active: boolean): string {
  return cn(
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent [&_svg]:size-4 [&_svg]:shrink-0",
    active ? "bg-surface shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}
