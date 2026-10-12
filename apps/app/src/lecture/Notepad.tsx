import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NoteText } from "./NoteText";
import type { PageNotesView } from "./use-page-notes";

/**
 * The notes for the page the panel shows. Switching pages swaps the text and keeps the field focused, so typing carries
 * on from the new page. The text of the page being left is already in memory, and is saved with the other pages.
 *
 * A page with text shows its note as Markdown until the reader opens the source with Edit. A page with no text always
 * shows the field, so there is somewhere to write.
 */
export function Notepad({
  id,
  page,
  notes,
  width,
  onFocusChange,
}: {
  readonly id: string;
  /** The page whose note is shown and edited. */
  readonly page: number;
  readonly notes: PageNotesView;
  readonly width: number;
  /** Reports when the field gains or loses focus, so the page under typing can be held. */
  readonly onFocusChange: (focused: boolean) => void;
}) {
  // The page the source was opened for. It stops matching when the page changes, so turning the page shows the new
  // page's mode with no reset to run.
  const [editingPage, setEditingPage] = useState<number>();
  const editing = editingPage === page;
  const text = notes.textOf(page);
  const showField = editing || text.trim() === "";
  const field = useRef<HTMLTextAreaElement>(null);

  // Edit moves focus into the field with the caret at the end. A field the reader focused already has the caret.
  useEffect(() => {
    const element = field.current;
    if (!editing || element === null || document.activeElement === element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [editing]);

  return (
    <aside
      id={id}
      aria-label="Notes"
      style={{ width }}
      className="grain flex shrink-0 flex-col border-l border-border bg-surface"
    >
      <div className="flex h-[84px] shrink-0 items-end justify-between pt-0 pr-6 pb-1.5 pl-[66px]">
        <h2 className="font-serif text-[32px] leading-none">
          Notes <span className="label ml-1 text-[11px]">· Page {page}</span>
        </h2>
        <div className="flex items-center gap-4">
          {notes.status !== "unreadable" && !showField && (
            <button
              type="button"
              aria-label={`Edit notes for page ${page}`}
              onClick={() => setEditingPage(page)}
              onKeyDown={(event) => {
                // Enter opens the source here, and is stopped so it never lands in the field as a line break.
                if (event.key !== "Enter") return;
                event.preventDefault();
                setEditingPage(page);
              }}
              className="text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Edit
            </button>
          )}
          <SaveStatus notes={notes} />
        </div>
      </div>
      {notes.status === "unreadable" ? (
        <p role="alert" className="pt-2 pr-6 pl-[66px] text-[15px] leading-relaxed text-muted-foreground">
          This material's notes can't be read. The notes file is damaged or was made by a newer version of BetterNotez,
          so it has been left as it is.
        </p>
      ) : showField ? (
        <textarea
          ref={field}
          aria-label={`Notes for page ${page}`}
          placeholder={`Write notes for page ${page}`}
          disabled={!notes.ready}
          value={text}
          onChange={(event) => notes.edit(page, event.target.value)}
          onFocus={() => {
            setEditingPage(page);
            onFocusChange(true);
          }}
          onBlur={() => {
            setEditingPage(undefined);
            onFocusChange(false);
          }}
          className="ruled-paper min-h-0 flex-1 resize-none bg-transparent pr-6 pb-4 pl-[66px] text-base leading-[28px] text-foreground placeholder:text-faint disabled:opacity-60"
        />
      ) : (
        <div data-rendered-note className="ruled-paper min-h-0 flex-1 overflow-y-auto pr-6 pb-4 pl-[66px]">
          <NoteText text={text} />
        </div>
      )}
    </aside>
  );
}

/**
 * The save state. Only a failure is announced, so the routine "Saving…" and "Saved" are not read out on every keystroke.
 */
function SaveStatus({ notes }: { readonly notes: PageNotesView }) {
  if (notes.status === "failed") {
    return (
      <span className="flex items-center gap-2 text-[13px] text-faint">
        <span role="alert">{notes.ready ? "Couldn't save" : "Couldn't load notes"}</span>
        <button type="button" onClick={notes.retry} className="text-foreground underline underline-offset-4">
          Retry
        </button>
      </span>
    );
  }
  if (notes.status === "unreadable") return null;
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-faint">
      {notes.status === "saved" && <Check aria-hidden className="size-3.5" />}
      {notes.status === "loading" ? "Loading…" : notes.status === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}
