import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useParams } from "react-router";
import { useLibraryQuery } from "../library";
import { cn } from "../lib/cn";
import { subjectTone } from "../lib/subject-colors";
import { SubjectDialog } from "../subjects/SubjectDialog";
import { IconButton } from "../ui/tooltip";
import { RibbonMark } from "./Brand";
import { MAIN_NAV, SETTINGS_NAV } from "./nav";

/**
 * The collapsed margin used while a lecture is open. Each icon keeps its name for screen readers and as a tooltip,
 * so the rail is only a narrower way to reach the same places.
 */
export function Rail() {
  const subjects = useLibraryQuery((library) => library.listSubjects());
  const { lectureId = "" } = useParams();
  // The open lecture's subject stays marked, since the lecture route is not a subject route.
  const openSubject = useLibraryQuery((library) => library.getLecture(lectureId).then((lecture) => lecture.subjectId), [lectureId]);
  const [creating, setCreating] = useState(false);
  const SettingsIcon = SETTINGS_NAV.icon;

  return (
    <aside className="grain flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-background py-[22px]">
      <Link to="/" aria-label="BetterNotez home" title="BetterNotez" className="mb-[22px] text-accent">
        <RibbonMark />
      </Link>

      <nav aria-label="Main" className="flex flex-col items-center gap-1.5">
        {MAIN_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} aria-label={label} title={label} className={({ isActive }) => railItemClass(isActive)}>
            <Icon />
          </NavLink>
        ))}
      </nav>

      <section className="mt-5 flex w-10 flex-col items-center gap-1.5 border-t border-border pt-5">
        {subjects.data?.map((subject) => (
          <NavLink
            key={subject.id}
            to={`/subjects/${subject.id}`}
            aria-label={subject.name}
            title={subject.name}
            className={({ isActive }) => railItemClass(isActive || subject.id === openSubject.data)}
          >
            <span className="ink-dot" style={{ backgroundColor: subjectTone(subject.color) }} />
          </NavLink>
        ))}
        <IconButton label="New subject" onClick={() => setCreating(true)}>
          <Plus />
        </IconButton>
      </section>

      <nav aria-label="Footer" className="mt-auto">
        <NavLink to={SETTINGS_NAV.to} aria-label={SETTINGS_NAV.label} title={SETTINGS_NAV.label} className={({ isActive }) => railItemClass(isActive)}>
          <SettingsIcon />
        </NavLink>
      </nav>

      {creating && <SubjectDialog onClose={() => setCreating(false)} />}
    </aside>
  );
}

function railItemClass(active: boolean): string {
  return cn(
    "relative grid size-10 place-items-center rounded-sm transition-[color,background-color] duration-150 [&_svg]:size-[18px]",
    active
      ? "text-foreground before:absolute before:-left-3 before:inset-y-2.5 before:w-0.5 before:bg-accent"
      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
  );
}
