import type { Lecture, SearchHit, Subject } from "@betternotez/core";
import { Search, SearchX } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useLibraryQuery } from "../library";
import { cn } from "../lib/cn";
import { cardClass } from "../ui/card";
import { Input } from "../ui/input";
import { EmptyState } from "../ui/empty-state";
import { PageHeader } from "../ui/page-header";
import { QueryError } from "../ui/query-error";

type HitKind = SearchHit["kind"];

const GROUPS: readonly { readonly kind: HitKind; readonly label: string }[] = [
  { kind: "subject", label: "Subjects" },
  { kind: "lecture", label: "Lectures" },
  { kind: "notes", label: "Notes" },
  { kind: "annotation", label: "Text boxes" },
  { kind: "pdf", label: "PDF text" },
];

interface ResultRow {
  readonly hit: SearchHit;
  readonly title: string;
  readonly detail: string;
  readonly to: string;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const needle = query.trim();

  const results = useLibraryQuery(
    async (library) => {
      if (needle === "") return [];
      const [hits, subjects, lectures] = await Promise.all([
        library.search(needle, { pdfText: async (id) => (await library.getPdfText(id)) ?? [] }),
        library.listSubjects(),
        library.listLectures(),
      ]);
      return toRows(hits, subjects, lectures);
    },
    [needle],
  );

  return (
    <>
      <PageHeader title="Search" />
      <div className="relative mt-6">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search"
          autoFocus
          className="h-11 pl-10"
          placeholder="Search subjects, lectures, notes, text boxes, or PDF text"
          value={query}
          onChange={(event) => setParams({ q: event.target.value }, { replace: true })}
        />
      </div>

      <div className="mt-8 space-y-8">
        {needle === "" && (
          <EmptyState icon={Search} title="Search your semester">
            Find subjects, lectures, notes, text boxes, or words inside a PDF.
          </EmptyState>
        )}
        {results.error !== undefined && <QueryError error={results.error} />}
        {needle !== "" && results.data?.length === 0 && (
          <EmptyState icon={SearchX} title={`No matches for "${needle}"`}>
            Check the spelling, or try a shorter word.
          </EmptyState>
        )}
        {GROUPS.map(({ kind, label }) => {
          const rows = results.data?.filter((row) => row.hit.kind === kind) ?? [];
          if (rows.length === 0) return null;
          return (
            <section key={kind} aria-labelledby={`results-${kind}`}>
              <h2
                id={`results-${kind}`}
                className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {label} ({rows.length})
              </h2>
              <ul className="space-y-2">
                {rows.map((row, index) => (
                  <li key={index}>
                    <Link to={row.to} className={cn(cardClass, "block px-4 py-3")}>
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.detail}</p>
                      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                        <Highlight text={row.hit.snippet} query={needle} />
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

function toRows(hits: readonly SearchHit[], subjects: readonly Subject[], lectures: readonly Lecture[]): ResultRow[] {
  const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.name] as const));
  const lectureById = new Map(lectures.map((lecture) => [lecture.id, lecture] as const));

  return hits.map((hit) => {
    const subjectName = subjectNames.get(hit.subjectId) ?? "";
    if (hit.kind === "subject") {
      return { hit, title: subjectName, detail: "Subject", to: `/subjects/${hit.subjectId}` };
    }
    const lecture = hit.lectureId === undefined ? undefined : lectureById.get(hit.lectureId);
    const page = hit.page === undefined ? undefined : `Page ${hit.page}`;
    return {
      hit,
      title: lecture?.title ?? subjectName,
      detail: [subjectName, page].filter(Boolean).join(" · "),
      to: `/lecture/${hit.lectureId}${hit.page === undefined ? "" : `?page=${hit.page}`}`,
    };
  });
}

/** Marks each case-insensitive occurrence of the query. Odd split positions hold the matches. */
function Highlight({ text, query }: { readonly text: string; readonly query: string }) {
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "i"));
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded bg-highlight px-0.5 text-highlight-foreground">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
