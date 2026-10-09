import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState, type DragEvent } from "react";
import { useLibrary } from "../library";
import { cn } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { countLabel, formatFileSize } from "../lib/format";
import { importPdf, selectPdfs } from "../pdf/import";
import { notifyLibraryChanged } from "../store";
import { Button, iconButtonClass } from "../ui/button";
import { DialogActions, ModalDialog } from "../ui/dialog";
import { Input } from "../ui/input";

export function ImportDialog({
  subjectId,
  initialFiles,
  onClose,
}: {
  readonly subjectId: string;
  readonly initialFiles: readonly File[];
  readonly onClose: () => void;
}) {
  const library = useLibrary();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<readonly File[]>(initialFiles);
  const [date, setDate] = useState("");
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);

  function addFiles(selection: Iterable<File>) {
    const pdfs = selectPdfs(selection);
    setFiles((current) => [...current, ...pdfs]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function handleImport() {
    setImporting(true);
    const failed: File[] = [];
    let imported = 0;
    for (const file of files) {
      try {
        await importPdf(library, subjectId, file, date === "" ? undefined : date);
        imported += 1;
      } catch (error) {
        failed.push(file);
        toast.error(errorMessage(error));
      }
    }
    if (imported > 0) {
      notifyLibraryChanged();
      toast.success(`Imported ${countLabel(imported, "lecture")}`);
    }
    if (failed.length === 0) {
      onClose();
      return;
    }
    setFiles(failed);
    setImporting(false);
  }

  return (
    <ModalDialog
      title="Import lecture PDFs"
      description="Each PDF becomes a lecture, titled after its file name."
      onClose={onClose}
    >
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-control",
        )}
      >
        <p className="text-sm text-muted-foreground">Drop PDFs here, or</p>
        <Button onClick={() => inputRef.current?.click()}>
          <Upload />
          Choose PDFs
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(event) => {
            addFiles(event.target.files ?? []);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto">
          {files.map((file, index) => (
            <li
              key={`${index}-${file.name}`}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <FileText className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                disabled={importing}
                className={iconButtonClass}
                onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}
              >
                <X />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-5 block space-y-2">
        <span className="text-sm font-medium">Lecture date (optional)</span>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>

      <DialogActions>
        <Button onClick={onClose} disabled={importing}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleImport} disabled={files.length === 0 || importing}>
          {importing ? "Importing…" : files.length === 0 ? "Import PDFs" : `Import ${countLabel(files.length, "PDF")}`}
        </Button>
      </DialogActions>
    </ModalDialog>
  );
}
