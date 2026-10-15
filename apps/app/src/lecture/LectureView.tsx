import { AnnotationId, DEFAULT_HIGHLIGHT_COLOR, newId, type ImageBox, type Lecture, type Subject } from "@betternotez/core";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft, ArrowRight, ChevronLeft, FileDown, NotebookPen } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router";
import { useStore } from "zustand";
import { useLibrary } from "../library";
import { cn } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { displayTitle } from "../lib/format";
import { savePdf } from "../lib/save-pdf";
import { Button, iconButtonClass } from "../ui/button";
import { IconLink } from "../ui/tooltip";
import { commitTextEdit, createAnnotationStore, restyleTextBox } from "./annotation-store";
import { EditorContext, isTypingTarget, type EditorValue, type EditSession, type TextStylePatch, type Tool } from "./editor";
import { exportAnnotatedPdf } from "./export";
import { Notepad } from "./Notepad";
import { NotesResizeHandle } from "./NotesResizeHandle";
import { PdfPages, type PdfPagesHandle } from "./PdfPages";
import { createImageCache, imageFileIn, prepareImage } from "./images";
import { DEFAULT_INK, DEFAULT_TEXT_INK, MAX_ZOOM, MIN_ZOOM, PEN_SIZES, Toolbar, ViewControls } from "./Toolbar";
import { usePendingText } from "./text-selection";
import { useNotesWidth } from "./use-notes-width";
import { notesPageFor } from "./page-notes";
import { usePageNotes } from "./use-page-notes";
import { useRefreshWhileVisible } from "./use-refresh";

export function LectureView({
  lecture,
  subject,
  previous,
  next,
  pdfBytes,
  doc,
}: {
  readonly lecture: Lecture;
  readonly subject: Subject;
  /** The material listed before and after this one on the subject page. */
  readonly previous: Lecture | undefined;
  readonly next: Lecture | undefined;
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
  const [textColor, setTextColor] = useState<string>(DEFAULT_TEXT_INK);
  const activeColor = tool === "highlighter" ? markColor : tool === "text" ? textColor : color;
  const setActiveColor = tool === "highlighter" ? setMarkColor : tool === "text" ? setTextColor : setColor;
  const [images] = useState(() => createImageCache(library, lecture.id));
  useEffect(() => () => images.dispose(), [images]);
  const imagePicker = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState<number>(PEN_SIZES[1].value);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<EditSession>();
  // Read by the edit callbacks, which may run before React has re-rendered with the new session.
  const editingRef = useRef<EditSession | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(startPage);
  const [notesOpen, setNotesOpen] = useState(() => searchParams.has("notes"));
  // The page the notes field was focused on. While it has focus, the notes stay on that page, whatever the PDF shows.
  const [focusedPage, setFocusedPage] = useState<number>();
  const notesPage = notesPageFor(page, focusedPage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pages = useRef<PdfPagesHandle>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const notesId = useId();
  const notes = useNotesWidth(rowRef);
  const pendingText = usePendingText(tool === "select");
  const pageNotes = usePageNotes(lecture.id, page);

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
      images,
      select,
      beginEdit,
      endEdit,
      announce,
      restyle,
    }),
    [store, tool, activeColor, size, selectedId, editing, pendingText, images, select, beginEdit, endEdit, announce, restyle],
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
      if (event.key === "Escape") {
        setSelectedId(undefined);
        setTool("select");
        window.getSelection()?.removeAllRanges();
        return;
      }
      if (event.target instanceof Node && document.getElementById(notesId)?.contains(event.target)) return;
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
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store, selectedId, notesId]);

  /** Puts a picture in the middle of the visible part of the page in view, selected, so it can be moved straight away. */
  async function addImage(file: File) {
    try {
      const prepared = await prepareImage(file);
      const sheet = scrollRef.current?.querySelector<HTMLElement>(`section[data-page-number="${page}"]`);
      const view = scrollRef.current?.getBoundingClientRect();
      const box = sheet?.getBoundingClientRect();
      if (box === undefined || view === undefined) return;
      let width = 0.5;
      let height = (width * box.width * prepared.height) / prepared.width / box.height;
      if (height > 0.6) {
        width *= 0.6 / height;
        height = 0.6;
      }
      const visibleTop = Math.max(box.top, view.top);
      const visibleBottom = Math.min(box.bottom, view.bottom);
      const middle = ((visibleTop + visibleBottom) / 2 - box.top) / box.height;
      const name = await library.addImage(lecture.id, prepared.bytes, prepared.type);
      const image: ImageBox = {
        id: AnnotationId.parse(newId()),
        kind: "image",
        page,
        author: "user",
        x: (1 - width) / 2,
        y: Math.min(Math.max(middle - height / 2, 0), 1 - height),
        width,
        height,
        image: name,
      };
      endTyping();
      setTool("select");
      store.getState().apply([{ type: "put", next: image }], { record: true });
      setSelectedId(image.id);
      announce("Image added");
    } catch (error) {
      toast.error(`The image could not be added. ${errorMessage(error)}`);
    }
  }

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (isTypingTarget(event.target)) return;
      const file = imageFileIn(event.clipboardData);
      if (file === undefined) return;
      event.preventDefault();
      void addImage(file);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });

  const openNote = useCallback((pageNumber: number) => {
    pages.current?.goToPage(pageNumber);
    setNotesOpen(true);
  }, []);

  async function exportPdf() {
    try {
      const bytes = await exportAnnotatedPdf(pdfBytes, store.getState().annotations, (name) =>
        library.getImage(lecture.id, name),
      );
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
          {(previous !== undefined || next !== undefined) && (
            <nav aria-label="Material in this subject" className="flex items-center gap-1">
              <SiblingLink direction="previous" lecture={previous} />
              <SiblingLink direction="next" lecture={next} />
            </nav>
          )}
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
              notedPages={pageNotes.noted}
              onOpenNote={openNote}
              onPageChange={setPage}
            />
            <Toolbar
              tool={tool}
              onTool={chooseTool}
              color={activeColor}
              onColor={setActiveColor}
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
              onAddImage={() => imagePicker.current?.click()}
            />
            <input
              ref={imagePicker}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="Image file"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file !== undefined) void addImage(file);
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
              <Notepad
                id={notesId}
                page={notesPage}
                notes={pageNotes}
                width={notes.width}
                onFocusChange={(focused) => setFocusedPage(focused ? page : undefined)}
                onPointerDown={() => setSelectedId(undefined)}
              />
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

function SiblingLink({
  direction,
  lecture,
}: {
  readonly direction: "previous" | "next";
  readonly lecture: Lecture | undefined;
}) {
  const Icon = direction === "previous" ? ArrowLeft : ArrowRight;
  if (lecture === undefined) {
    return (
      <span aria-hidden className={cn(iconButtonClass, "pointer-events-none opacity-30")}>
        <Icon />
      </span>
    );
  }
  const word = direction === "previous" ? "Previous" : "Next";
  return (
    <IconLink to={`/lecture/${lecture.id}`} label={`${word}: ${displayTitle(lecture.title)}`}>
      <Icon />
    </IconLink>
  );
}
