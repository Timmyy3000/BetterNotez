import { Check } from "lucide-react";
import type { NoteStatus } from "./page-notes";
import type { PageNotesView } from "./use-page-notes";

const STATUS_LABEL: Record<NoteStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  failed: "Couldn't save",
};

/**
 * The notes for the page in view. Switching pages swaps the text and keeps the field focused, so typing carries on
 * from the new page. The text of the page being left is already in memory, and is saved when the page changes.
 */
export function Notepad({
  id,
  page,
  notes,
  width,
}: {
  readonly id: string;
  /** The page in view. Its note is the one shown and edited. */
  readonly page: number;
  readonly notes: PageNotesView;
  readonly width: number;
}) {
  return (
    <aside
      id={id}
      aria-label="Notes"
      style={{ width }}
      className="grain flex shrink-0 flex-col border-l border-border bg-surface"
    >
      <div className="flex h-[84px] shrink-0 items-end justify-between pt-0 pr-6 pb-1.5 pl-[66px]">
        <h2 className="font-serif text-[32px] leading-none">
          Notes <span className="label ml-1 text-[11px]">Page {page}</span>
        </h2>
        <span role="status" className="flex items-center gap-1.5 text-[13px] text-faint">
          {notes.status === "saved" && <Check aria-hidden className="size-3.5" />}
          {STATUS_LABEL[notes.status]}
        </span>
      </div>
      <textarea
        aria-label="Material notes"
        placeholder={`Write notes for page ${page}`}
        disabled={!notes.ready}
        value={notes.textOf(page)}
        onChange={(event) => notes.edit(page, event.target.value)}
        className="ruled-paper min-h-0 flex-1 resize-none bg-transparent pr-6 pb-4 pl-[66px] text-base leading-[28px] text-foreground placeholder:text-faint disabled:opacity-60"
      />
    </aside>
  );
}
