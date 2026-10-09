import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLibrary } from "../library";
import { useRefreshWhileVisible } from "./use-refresh";

const SAVE_DELAY_MS = 500;

type SaveStatus = "saved" | "saving" | "failed";

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  failed: "Couldn't save",
};

export function Notepad({ lectureId, width }: { readonly lectureId: string; readonly width: number }) {
  const library = useLibrary();
  const [text, setText] = useState<string>();
  const [status, setStatus] = useState<SaveStatus>("saved");
  // `shown` is what the field holds, `stored` is what the notes file holds as far as we know.
  const shown = useRef("");
  const stored = useRef("");
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(0);
  const saves = useRef(0);

  function unsaved(): boolean {
    return timer.current !== undefined || inFlight.current > 0 || shown.current !== stored.current;
  }

  function save(): void {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const value = shown.current;
    saves.current += 1;
    inFlight.current += 1;
    queue.current = queue.current.then(async () => {
      let written = true;
      try {
        await library.setNotes(lectureId, value);
        stored.current = value;
      } catch {
        written = false;
      }
      inFlight.current -= 1;
      setStatus(!written ? "failed" : unsaved() ? "saving" : "saved");
    });
  }

  useEffect(() => {
    let live = true;
    void library.getNotes(lectureId).then(
      (value) => {
        if (!live) return;
        shown.current = value;
        stored.current = value;
        setText(value);
      },
      () => {
        if (live) setStatus("failed");
      },
    );
    return () => {
      live = false;
      // Typing that has not reached disk yet is saved before the panel goes away.
      if (unsaved()) save();
    };
  }, [library, lectureId]);

  useRefreshWhileVisible(async () => {
    const startedAt = saves.current;
    let onDisk: string;
    try {
      onDisk = await library.getNotes(lectureId);
    } catch {
      return;
    }
    // A read that overlaps a save, or lands on unsaved typing, must not overwrite the field.
    if (saves.current !== startedAt || unsaved()) return;
    if (onDisk !== stored.current) {
      shown.current = onDisk;
      stored.current = onDisk;
      setText(onDisk);
    }
  });

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    shown.current = event.target.value;
    setText(shown.current);
    setStatus("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, SAVE_DELAY_MS);
  }

  return (
    <aside
      aria-label="Notes"
      style={{ width }}
      className="grain flex shrink-0 flex-col border-l border-border bg-surface"
    >
      <div className="flex h-[84px] shrink-0 items-end justify-between pt-0 pr-6 pb-1.5 pl-[66px]">
        <h2 className="font-serif text-[32px] leading-none">Notes</h2>
        <span role="status" className="flex items-center gap-1.5 text-[13px] text-faint">
          {status === "saved" && <Check aria-hidden className="size-3.5" />}
          {STATUS_LABEL[status]}
        </span>
      </div>
      <textarea
        aria-label="Lecture notes"
        placeholder="Write notes for this lecture"
        disabled={text === undefined}
        value={text ?? ""}
        onChange={handleChange}
        className="ruled-paper min-h-0 flex-1 resize-none bg-transparent pr-6 pb-4 pl-[66px] text-base leading-[28px] text-foreground placeholder:text-faint disabled:opacity-60"
      />
    </aside>
  );
}
