import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { CircleAlert } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useParams } from "react-router";
import { errorMessage } from "../lib/errors";
import { sortLectures } from "../lib/lectures";
import { readingOrder, readOrganization } from "../lib/organization";
import { useLibrary, useLibraryQuery } from "../library";
import { EmptyState } from "../ui/empty-state";
import { QueryError } from "../ui/query-error";

// pdf.js and pdf-lib are large, so the viewer loads only when a lecture is opened.
const LectureView = lazy(() => import("../lecture/LectureView").then((module) => ({ default: module.LectureView })));

export function LecturePage() {
  const { lectureId = "" } = useParams();
  // Stepping to another material changes only the route, so a fresh page keeps the last PDF from showing in the next one.
  return <LectureScreen key={lectureId} lectureId={lectureId} />;
}

function LectureScreen({ lectureId }: { readonly lectureId: string }) {
  const page = useLibraryQuery(
    async (library) => {
      const lecture = await library.getLecture(lectureId);
      const [subject, lectures, organization] = await Promise.all([
        library.getSubject(lecture.subjectId),
        library.listLectures(lecture.subjectId),
        readOrganization(library, lecture.subjectId),
      ]);
      const order = readingOrder(organization.folders, sortLectures(lectures), organization.lectures);
      const at = order.findIndex((item) => item.id === lecture.id);
      return { lecture, subject, previous: order[at - 1], next: order[at + 1] };
    },
    [lectureId],
  );
  const pdf = useLecturePdf(lectureId);

  if (page.error !== undefined) {
    return (
      <div className="p-8">
        <QueryError error={page.error} />
      </div>
    );
  }
  if (pdf.error !== undefined) {
    return (
      <div className="p-8">
        <EmptyState icon={CircleAlert} title="This PDF could not be opened">
          {errorMessage(pdf.error)}
        </EmptyState>
      </div>
    );
  }
  if (page.data === undefined || pdf.bytes === undefined || pdf.doc === undefined) {
    return <div className="p-8 text-sm text-muted-foreground">Opening material…</div>;
  }

  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Opening material…</div>}>
      <LectureView
        lecture={page.data.lecture}
        subject={page.data.subject}
        previous={page.data.previous}
        next={page.data.next}
        pdfBytes={pdf.bytes}
        doc={pdf.doc}
      />
    </Suspense>
  );
}

/** Loads the PDF once. Library writes do not reload it, because the file can be tens of megabytes. */
function useLecturePdf(lectureId: string): {
  readonly bytes?: Uint8Array;
  readonly doc?: PDFDocumentProxy;
  readonly error?: unknown;
} {
  const library = useLibrary();
  const [state, setState] = useState<{ bytes?: Uint8Array; doc?: PDFDocumentProxy; error?: unknown }>({});

  useEffect(() => {
    let live = true;
    let loading: PDFDocumentLoadingTask | undefined;
    Promise.all([library.getPdf(lectureId), import("../pdf/pdfjs")])
      .then(async ([bytes, { getDocument }]) => {
        if (!live) return;
        const task = getDocument({ data: bytes.slice() });
        loading = task;
        const doc = await task.promise;
        if (live) setState({ bytes, doc });
        else void task.destroy();
      })
      .catch((error: unknown) => {
        if (live) setState({ error });
      });
    return () => {
      live = false;
      void loading?.destroy();
    };
  }, [library, lectureId]);

  return state;
}
