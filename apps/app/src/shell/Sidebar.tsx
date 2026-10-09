import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router";
import { useLibraryQuery } from "../library";
import { cn } from "../lib/cn";
import { subjectTone } from "../lib/subject-colors";
import { SubjectDialog } from "../subjects/SubjectDialog";
import { IconButton } from "../ui/tooltip";
import { RibbonMark, Wordmark } from "./Brand";
import { MAIN_NAV, SETTINGS_NAV } from "./nav";

/** The desk margin: the brand, the working views, and the subjects. */
export function Sidebar() {
  const subjects = useLibraryQuery((library) => library.listSubjects());
  const [creating, setCreating] = useState(false);
  const SettingsIcon = SETTINGS_NAV.icon;

  return (
    <aside className="grain flex w-60 shrink-0 flex-col gap-0.5 border-r border-border bg-sidebar pt-[26px] pr-[18px] pb-[22px] pl-[22px]">
      <Link to="/" className="mb-[30px] ml-1.5 flex items-center gap-2.5 text-accent">
        <RibbonMark />
        <Wordmark />
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {MAIN_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => navItemClass(isActive)}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      <section className="mt-[34px] flex min-h-0 flex-1 flex-col">
        <div className="mb-2.5 flex items-center justify-between pr-1 pl-2">
          <h2 className="label">Subjects</h2>
          <IconButton label="New subject" onClick={() => setCreating(true)}>
            <Plus />
          </IconButton>
        </div>
        {/* The list clips at its padding edge, so the active marker's 22px offset must sit inside that padding. */}
        <ul className="-ml-[22px] flex flex-col gap-0.5 overflow-y-auto pl-[22px]">
          {subjects.data?.map((subject) => (
            <li key={subject.id}>
              <NavLink to={`/subjects/${subject.id}`} title={subject.name} className={({ isActive }) => subjectItemClass(isActive)}>
                <span className="ink-dot" style={{ backgroundColor: subjectTone(subject.color) }} />
                <span className="truncate">{subject.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {subjects.data?.length === 0 && <p className="px-2 text-sm text-muted-foreground">No subjects yet</p>}
      </section>

      <nav aria-label="Footer" className="flex flex-col gap-0.5">
        <NavLink to={SETTINGS_NAV.to} className={({ isActive }) => navItemClass(isActive)}>
          <SettingsIcon />
          {SETTINGS_NAV.label}
        </NavLink>
      </nav>

      {creating && <SubjectDialog onClose={() => setCreating(false)} />}
    </aside>
  );
}

/** The active view is marked by ink colour and a vermilion rule in the margin, not by a filled pill. */
function navItemClass(active: boolean): string {
  return cn(
    "relative flex items-center gap-3 rounded-sm py-2 pr-2.5 pl-2 text-[15px] transition-[color,background-color] duration-150 [&_svg]:size-[18px] [&_svg]:shrink-0",
    active
      ? "text-foreground before:absolute before:-left-[22px] before:inset-y-[7px] before:w-0.5 before:bg-accent"
      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
  );
}

function subjectItemClass(active: boolean): string {
  return cn(
    "relative flex items-center gap-3 rounded-sm py-[7px] pr-2.5 pl-2 text-[15px] transition-[color,background-color] duration-150",
    active
      ? "text-foreground before:absolute before:-left-[22px] before:inset-y-[7px] before:w-0.5 before:bg-accent"
      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
  );
}
