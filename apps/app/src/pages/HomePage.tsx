import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useLibraryQuery } from "../library";
import { cn } from "../lib/cn";
import { countLabel } from "../lib/format";
import { SubjectDialog } from "../subjects/SubjectDialog";
import { Button, focusRing } from "../ui/button";
import { cardClass } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { PageHeader } from "../ui/page-header";
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
          Start with one subject, such as Digital Systems, then add its lecture PDFs.
        </EmptyState>
        {creating && <SubjectDialog onClose={() => setCreating(false)} />}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Subjects" description={`${countLabel(lectures.length, "lecture")} in ${countLabel(subjects.length, "subject")}`} />
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject) => {
          const count = lectures.filter((lecture) => lecture.subjectId === subject.id).length;
          return (
            <li key={subject.id}>
              <Link to={`/subjects/${subject.id}`} className={cn(cardClass, "block p-5", focusRing)}>
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
