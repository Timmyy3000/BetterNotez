import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useLibraryQuery } from "../library";
import { countLabel } from "../lib/format";
import { SubjectDialog } from "../subjects/SubjectDialog";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { QueryError } from "../ui/query-error";

export function HomePage() {
  const overview = useLibraryQuery(async (library) => ({
    subjects: await library.listSubjects(),
    lectures: await library.listLectures(),
  }));
  const [creating, setCreating] = useState(false);

  if (overview.error !== undefined) {
    return <QueryError error={overview.error} />;
  }
  if (overview.data === undefined) {
    return null;
  }
  const { subjects, lectures } = overview.data;

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
          Start with one subject, such as Digital Systems. Then drop in its lecture PDFs.
        </EmptyState>
        {creating && <SubjectDialog onClose={() => setCreating(false)} />}
      </>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Subjects</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {countLabel(lectures.length, "lecture")} in {countLabel(subjects.length, "subject")}
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject) => {
          const count = lectures.filter((lecture) => lecture.subjectId === subject.id).length;
          return (
            <li key={subject.id}>
              <Link
                to={`/subjects/${subject.id}`}
                className="block rounded-xl border border-border bg-surface p-5 outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="block h-1.5 w-10 rounded-full" style={{ backgroundColor: subject.color }} />
                <span className="mt-6 block truncate text-base font-semibold">{subject.name}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{countLabel(count, "lecture")}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
