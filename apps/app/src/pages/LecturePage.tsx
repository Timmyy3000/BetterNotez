import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { CircleAlert } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useParams } from "react-router";
import { errorMessage } from "../lib/errors";
import { useLibrary, useLibraryQuery } from "../library";
import { EmptyState } from "../ui/empty-state";
import { QueryError } from "../ui/query-error";

// pdf.js and pdf-lib are large, so the viewer loads only when a lecture is opened.
const LectureView = lazy(() => import("../lecture/LectureView").then((module) => ({ default: module.LectureView })));

export function LecturePage() {
  const { lectureId = "" } = useParams();
  const page = useLibraryQuery(
    async (library) => {
      const lecture = await library.getLecture(lectureId);
      return { lecture, subject: await library.getSubject(lecture.subjectId) };
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
    return <div className="p-8 text-sm text-muted-foreground">Opening lecture…</div>;
  }

  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Opening lecture…</div>}>
      <LectureView
        key={lectureId}
        lecture={page.data.lecture}
        subject={page.data.subject}
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
