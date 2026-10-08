import { FileText } from "lucide-react";
import { Link, useParams } from "react-router";
import { useLibraryQuery } from "../library";
import { lectureMeta } from "../lib/format";
import { EmptyState } from "../ui/empty-state";
import { QueryError } from "../ui/query-error";

export function LecturePage() {
  const { lectureId = "" } = useParams();
  const page = useLibraryQuery(
    async (library) => {
      const lecture = await library.getLecture(lectureId);
      return { lecture, subject: await library.getSubject(lecture.subjectId) };
    },
    [lectureId],
  );

  if (page.error !== undefined) {
    return <QueryError error={page.error} />;
  }
  if (page.data === undefined) {
    return null;
  }
  const { lecture, subject } = page.data;

  return (
    <>
      <nav className="text-sm text-muted-foreground">
        <Link to={`/subjects/${subject.id}`} className="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent">
          {subject.name}
        </Link>
      </nav>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{lecture.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{lectureMeta(lecture)}</p>
      <div className="mt-10">
        <EmptyState icon={FileText} title="Viewer coming soon">
          The PDF viewer, annotations, and notepad for this lecture are on their way.
        </EmptyState>
      </div>
    </>
  );
}
