import type { Lecture, Subject } from "@betternotez/core";
import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { dueLedger } from "../due/ledger";
import { useLibraryQuery } from "../library";
import { cn } from "../lib/cn";
import { countLabel, displayTitle, isoWeek, romanNumeral } from "../lib/format";
import { revealAt } from "../lib/motion";
import { subjectTone } from "../lib/subject-colors";
import { SubjectDialog } from "../subjects/SubjectDialog";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { QueryError } from "../ui/query-error";
import { localDateKey } from "../tasks/board";

const DUE_LIMIT = 5;

export function HomePage() {
  const overview = useLibraryQuery(async (library) => ({
    subjects: await library.listSubjects(),
    lectures: await library.listLectures(),
    tasks: await library.listTasks(),
  }));
  const [creating, setCreating] = useState(false);

  if (overview.error !== undefined) {
    return <QueryError error={overview.error} />;
  }
  if (overview.data === undefined) {
    return null;
  }
  const { subjects, lectures, tasks } = overview.data;

  if (subjects.length === 0) {
    return (
      <>
        <EmptyState
          icon={GraduationCap}
          title="Welcome to BetterNotez"
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              Create your first subject
            </Button>
          }
        >
          Start with one subject, then add its PDFs.
        </EmptyState>
        {creating && <SubjectDialog onClose={() => setCreating(false)} />}
      </>
    );
  }

  const now = new Date();
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject] as const));
  const ledger = dueLedger(tasks, localDateKey(now), DUE_LIMIT);

  return (
    <>
      <header className="rise" style={revealAt(0)}>
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <p className="label">{longDate(now)}</p>
          <p className="font-serif text-xl text-faint italic">Week {isoWeek(now)}</p>
        </div>
        <h1 className="mt-4 text-[clamp(3rem,5.6vw,5rem)] leading-[0.92] tracking-[-0.02em]">Subjects</h1>
        <p className="mt-4 font-serif text-2xl leading-[1.3] text-muted-foreground italic">
          {`${countLabel(lectures.length, "material")} across ${countLabel(subjects.length, "subject")}`}
        </p>
      </header>
      <div aria-hidden className="double-rule my-10 rise" style={revealAt(1)} />

      <ul className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject, index) => (
          <Folio
            key={subject.id}
            subject={subject}
            numeral={romanNumeral(index + 1)}
            lectures={lectures.filter((lecture) => lecture.subjectId === subject.id)}
            index={index}
          />
        ))}
      </ul>

      <section aria-labelledby="due-heading" className="rise mt-14" style={revealAt(subjects.length + 2)}>
        <div className="flex items-baseline justify-between">
          <h2 id="due-heading" className="label">
            Due
          </h2>
          <Link to="/tasks" className="-my-2.5 py-2.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            All tasks
          </Link>
        </div>
        {ledger.length === 0 ? (
          <p className="mt-3 border-t border-border pt-3 font-serif text-lg text-muted-foreground italic">
            Nothing is due. Give a task a due date and it will appear here.
          </p>
        ) : (
          <ol className="mt-3.5 border-b border-border">
            {ledger.map(({ task, when, overdue }) => {
              const subject = task.subjectId === undefined ? undefined : subjectById.get(task.subjectId);
              return (
                <li key={task.id} className="border-t border-border">
                  <Link
                    to={`/tasks?task=${task.id}`}
                    className={cn(
                      "grid grid-cols-1 gap-1 py-3 transition-colors hover:text-accent sm:items-baseline sm:gap-5",
                      subject === undefined ? "sm:grid-cols-[178px_minmax(0,1fr)]" : "sm:grid-cols-[178px_minmax(0,1fr)_200px]",
                    )}
                  >
                    <span className={cn("text-sm tabular-nums", overdue ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {when}
                    </span>
                    <span className="min-w-0 font-serif text-2xl leading-tight">{task.title}</span>
                    {subject !== undefined && (
                      <span className="flex min-w-0 items-center gap-2.5 text-sm sm:justify-end text-muted-foreground">
                        <span className="ink-dot" style={{ backgroundColor: subjectTone(subject.color) }} />
                        <span className="truncate">{subject.name}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}

function Folio({
  subject,
  lectures,
  numeral,
  index,
}: {
  readonly subject: Subject;
  readonly lectures: readonly Lecture[];
  readonly numeral: string;
  readonly index: number;
}) {
  const latest = newestLecture(lectures);
  return (
    <li className="rise flex" style={revealAt(index + 2)}>
      <Link
        to={`/subjects/${subject.id}`}
        className="group grain flex min-h-60 w-full flex-col rounded-lg border border-border bg-surface p-[22px_26px_24px] transition-transform duration-300 ease-out hover:-translate-y-[3px] active:scale-[0.985]"
        style={{ boxShadow: pageEdges(lectures.length) }}
      >
        <span className="flex items-center justify-between">
          <span className="font-serif text-[21px] text-faint italic">{numeral}.</span>
          <span
            aria-hidden
            className="h-[3px] w-7 transition-[width] duration-300 ease-out group-hover:w-[60px]"
            style={{ backgroundColor: subjectTone(subject.color) }}
          />
        </span>
        <h2 className="mb-3 text-[42px] leading-none tracking-[-0.01em] text-balance">{subject.name}</h2>
        <p className="mb-5 text-sm text-muted-foreground tabular-nums">{countLabel(lectures.length, "material")}</p>
        {latest !== undefined && (
          <p className="mt-auto border-t border-border pt-3.5 text-[15px] leading-snug text-muted-foreground">
            Latest: {displayTitle(latest.title)}
          </p>
        )}
      </Link>
    </li>
  );
}

/** Each lecture adds a sheet to the stack, so a subject with more pages shows more edges. Three is the most drawn. */
function pageEdges(lectureCount: number): string {
  const layers = ["1px 1px 0 var(--edge-1)", "2px 2px 0 var(--edge-2)", "3px 3px 0 var(--edge-3)"];
  return [...layers.slice(0, Math.min(Math.max(lectureCount, 1), 3)), "var(--lift)"].join(", ");
}

function newestLecture(lectures: readonly Lecture[]): Lecture | undefined {
  return lectures.reduce<Lecture | undefined>(
    (newest, lecture) => (newest === undefined || lecture.createdAt > newest.createdAt ? lecture : newest),
    undefined,
  );
}

function longDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}
