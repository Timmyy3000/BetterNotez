import { DEFAULT_HIGHLIGHT_COLOR, type Lecture, type Subject } from "@betternotez/core";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, FileDown, NotebookPen } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router";
import { useStore } from "zustand";
import { useLibrary } from "../library";
import { errorMessage } from "../lib/errors";
import { displayTitle } from "../lib/format";
import { savePdf } from "../lib/save-pdf";
import { Button, iconButtonClass } from "../ui/button";
import { commitTextEdit, createAnnotationStore, restyleTextBox } from "./annotation-store";
import { EditorContext, isTypingTarget, type EditorValue, type EditSession, type TextStylePatch, type Tool } from "./editor";
import { exportAnnotatedPdf } from "./export";
import { Notepad } from "./Notepad";
import { NotesResizeHandle } from "./NotesResizeHandle";
import { PdfPages, type PdfPagesHandle } from "./PdfPages";
import { DEFAULT_INK, MAX_ZOOM, MIN_ZOOM, PEN_SIZES, Toolbar, ViewControls } from "./Toolbar";
import { usePendingText } from "./text-selection";
import { useNotesWidth } from "./use-notes-width";
import { useRefreshWhileVisible } from "./use-refresh";

export function LectureView({
  lecture,
  subject,
  pdfBytes,
  doc,
}: {
  readonly lecture: Lecture;
  readonly subject: Subject;
  readonly pdfBytes: Uint8Array;
  readonly doc: PDFDocumentProxy;
}) {
  const library = useLibrary();
  const [searchParams] = useSearchParams();
  const requestedPage = parsePage(searchParams.get("page"), lecture.pageCount);
  const [startPage] = useState(requestedPage);
  const [store] = useState(() => createAnnotationStore(library, lecture.id, []));

  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(DEFAULT_INK);
  // The highlighter has its own marker palette, so its colour is kept apart from the pen's.
  const [markColor, setMarkColor] = useState<string>(DEFAULT_HIGHLIGHT_COLOR);
  const activeColor = tool === "highlighter" ? markColor : color;
  const [size, setSize] = useState<number>(PEN_SIZES[1].value);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<EditSession>();
  // Read by the edit callbacks, which may run before React has re-rendered with the new session.
  const editingRef = useRef<EditSession | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(startPage);
  const [notesOpen, setNotesOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pages = useRef<PdfPagesHandle>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const notesId = useId();
  const notes = useNotesWidth(rowRef);
  const pendingText = usePendingText(tool === "select");

  const canUndo = useStore(store, (state) => state.history.past.length > 0);
  const canRedo = useStore(store, (state) => state.history.future.length > 0);

  // External writes, such as an AI assistant editing the library folder, appear here.
  useRefreshWhileVisible(() => store.getState().sync());

  const select = useCallback((id: string | undefined) => setSelectedId(id), []);
  // A selection belongs to the tool that made it, so a different tool leaves nothing selected.
  const chooseTool = useCallback((next: Tool) => {
    setTool(next);
    setSelectedId(undefined);
    window.getSelection()?.removeAllRanges();
  }, []);

  const endEdit = useCallback(
    (id: string) => {
      const session = editingRef.current;
      if (session === undefined || session.id !== id) return;
      commitTextEdit(store, session);
      editingRef.current = undefined;
      setEditing(undefined);
      store.getState().endInteraction();
    },
    [store],
  );

  const beginEdit = useCallback(
    (session: EditSession) => {
      if (editingRef.current?.id === session.id) return;
      // The previous text is committed here, so a blur that arrives later finds nothing to do.
      if (editingRef.current !== undefined) endEdit(editingRef.current.id);
      store.getState().beginInteraction();
      editingRef.current = session;
      setEditing(session);
    },
    [store, endEdit],
  );

  // A toolbar action ends the typing session first, so the text typed so far is one step, and a save still waiting
  // cannot write over what the action did.
  const endTyping = useCallback(() => {
    const session = editingRef.current;
    if (session !== undefined) endEdit(session.id);
  }, [endEdit]);

  // Each message gets a new id, so a message that repeats is still read out.
  const [announcement, setAnnouncement] = useState({ text: "", id: 0 });
  const announce = useCallback((text: string) => setAnnouncement((previous) => ({ text, id: previous.id + 1 })), []);

  const restyle = useCallback(
    (id: string, patch: TextStylePatch) => {
      const session = editingRef.current;
      const carriedOn = restyleTextBox(store, id, patch, session);
      if (carriedOn !== session) {
        editingRef.current = carriedOn;
        setEditing(carriedOn);
      }
    },
    [store],
  );

  const editor = useMemo<EditorValue>(
    () => ({
      store,
      tool,
      color: activeColor,
      size,
      selectedId,
      editing,
      pendingText,
      scrollRef,
      select,
      beginEdit,
      endEdit,
      announce,
      restyle,
    }),
    [store, tool, activeColor, size, selectedId, editing, pendingText, select, beginEdit, endEdit, announce, restyle],
  );

  function deleteSelected() {
    const target = store.getState().annotations.find((annotation) => annotation.id === selectedId);
    if (target === undefined) return;
    store.getState().apply([{ type: "delete", prev: target }], { record: true });
    setSelectedId(undefined);
  }

  useEffect(() => {
    if (searchParams.has("page")) pages.current?.goToPage(requestedPage);
  }, [requestedPage]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) store.getState().redo();
        else store.getState().undo();
      } else if (modifier && key === "y") {
        event.preventDefault();
        store.getState().redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId !== undefined) {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape") {
        setSelectedId(undefined);
        setTool("select");
        window.getSelection()?.removeAllRanges();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store, selectedId]);

  async function exportPdf() {
    try {
      const bytes = await exportAnnotatedPdf(pdfBytes, store.getState().annotations);
      await savePdf(bytes, `${fileName(lecture.title)}.pdf`);
    } catch (error) {
      toast.error(`The PDF could not be exported. ${errorMessage(error)}`);
    }
  }

  return (
    <EditorContext value={editor}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background py-0 pr-[18px] pl-3.5">
          <Link to={`/subjects/${subject.id}`} aria-label={`Back to ${subject.name}`} className={iconButtonClass}>
            <ChevronLeft />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="label truncate text-[11px]">{subject.name}</p>
            <h1 title={displayTitle(lecture.title)} className="mt-0.5 truncate text-[27px] leading-tight">
              {displayTitle(lecture.title)}
            </h1>
          </div>
          <Button variant="secondary" aria-pressed={notesOpen} onClick={() => setNotesOpen((open) => !open)}>
            <NotebookPen />
            Notes
          </Button>
          <Button variant="secondary" onClick={() => void exportPdf()}>
            <FileDown />
            Export PDF
          </Button>
        </header>

        <div ref={rowRef} className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <PdfPages
              ref={pages}
              doc={doc}
              zoom={zoom}
              scrollRef={scrollRef}
              startPage={startPage}
              settleRedraw={notes.dragging}
              onPageChange={setPage}
            />
            <Toolbar
              tool={tool}
              onTool={chooseTool}
              color={activeColor}
              onColor={tool === "highlighter" ? setMarkColor : setColor}
              size={size}
              onSize={setSize}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={() => {
                endTyping();
                store.getState().undo();
              }}
              onRedo={() => {
                endTyping();
                store.getState().redo();
              }}
              canDelete={selectedId !== undefined}
              onDelete={() => {
                endTyping();
                deleteSelected();
              }}
            />
            <ViewControls
              page={page}
              pageCount={lecture.pageCount}
              zoom={zoom}
              onPage={(next) => pages.current?.goToPage(next)}
              onZoom={(next) => setZoom(Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)) * 100) / 100)}
            />
            {pendingText?.complete === false && (
              // Shown rather than stored: a highlight of the pages between is not whole until they are laid out again.
              <p
                role="status"
                className="raised-edge absolute top-[72px] left-1/2 z-20 -translate-x-1/2 rounded-md border border-border bg-raised px-3 py-1.5 text-[13px] whitespace-nowrap text-muted-foreground shadow-(--lift)"
              >
                Scroll so the whole selection is loaded, then try again
              </p>
            )}
          </div>
          {notesOpen && (
            <>
              {notes.bounds !== undefined && (
                <NotesResizeHandle
                  panelId={notesId}
                  width={notes.width}
                  bounds={notes.bounds}
                  dragging={notes.dragging}
                  onDraggingChange={notes.setDragging}
                  onResize={notes.resize}
                  onResizeEnd={notes.commit}
                />
              )}
              <Notepad id={notesId} lectureId={lecture.id} width={notes.width} />
            </>
          )}
        </div>
        {/* A live region needs no role. A role of status would collide with the notes' "Saved" indicator. */}
        <div aria-live="polite" className="sr-only">
          <span key={announcement.id}>{announcement.text}</span>
        </div>
      </div>
    </EditorContext>
  );
}

function parsePage(value: string | null, pageCount: number): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= pageCount ? page : 1;
}

function fileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Material";
}
