import { NotFoundError, type Annotation, type Library } from "@betternotez/core";
import { toast } from "sonner";
import { createStore } from "zustand/vanilla";
import { errorMessage } from "../lib/errors";
import type { EditSession } from "./editor";
import {
  applyStep,
  EMPTY_HISTORY,
  pushStep,
  sameAnnotation,
  sameAnnotations,
  takeRedo,
  takeUndo,
  type Command,
  type History,
  type Step,
} from "./history";

export interface AnnotationState {
  readonly annotations: readonly Annotation[];
  readonly history: History;
  /** Writes that have not finished yet. */
  readonly pending: number;
  /** Counts every local write. A read from disk that began before the latest write is stale. */
  readonly writes: number;
  /** Gestures and text edits in progress. A read from disk waits until none are left. */
  readonly interactions: number;
  /** Applies a step locally and writes it to disk. `record` adds it to undo history. */
  readonly apply: (step: Step, options?: { readonly record?: boolean }) => void;
  /** Applies a step locally only. Use it for changes that are written later. */
  readonly preview: (step: Step) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly beginInteraction: () => void;
  readonly endInteraction: () => void;
  /** Replaces the local list with what is on disk, unless a local change is still unsaved. */
  readonly sync: () => Promise<void>;
}

/**
 * Holds one lecture's annotations. Writes go through one queue, in order, so two of them never
 * race on annotations.json. The UI reads from the store and never waits on the disk.
 */
export function createAnnotationStore(library: Library, lectureId: string, annotations: readonly Annotation[]) {
  let queue: Promise<void> = Promise.resolve();

  return createStore<AnnotationState>()((set, get) => {
    function persist(step: Step): void {
      set((state) => ({ pending: state.pending + 1, writes: state.writes + 1 }));
      queue = queue
        .then(async () => {
          for (const command of step) {
            await writeCommand(library, lectureId, command);
          }
        })
        .catch((error: unknown) => {
          toast.error(`A change was not saved. ${errorMessage(error)}`);
        })
        .finally(() => {
          set((state) => ({ pending: state.pending - 1 }));
        });
    }

    return {
      annotations,
      history: EMPTY_HISTORY,
      pending: 0,
      writes: 0,
      interactions: 0,
      preview: (step) => {
        set((state) => ({ annotations: applyStep(state.annotations, step) }));
      },
      apply: (step, options = {}) => {
        set((state) => ({
          annotations: applyStep(state.annotations, step),
          history: options.record ? pushStep(state.history, step) : state.history,
        }));
        persist(step);
      },
      undo: () => {
        const taken = takeUndo(get().history);
        if (taken === undefined) return;
        set((state) => ({ annotations: applyStep(state.annotations, taken.run), history: taken.history }));
        persist(taken.run);
      },
      redo: () => {
        const taken = takeRedo(get().history);
        if (taken === undefined) return;
        set((state) => ({ annotations: applyStep(state.annotations, taken.run), history: taken.history }));
        persist(taken.run);
      },
      beginInteraction: () => {
        set((state) => ({ interactions: state.interactions + 1 }));
      },
      endInteraction: () => {
        set((state) => ({ interactions: Math.max(0, state.interactions - 1) }));
      },
      sync: async () => {
        const writesBefore = get().writes;
        let onDisk: Annotation[];
        try {
          onDisk = await library.listAnnotations(lectureId);
        } catch {
          return;
        }
        const state = get();
        const busy = state.writes !== writesBefore || state.pending > 0 || state.interactions > 0;
        if (!busy && !sameAnnotations(onDisk, state.annotations)) {
          set({ annotations: onDisk });
        }
      },
    };
  });
}

export type AnnotationStore = ReturnType<typeof createAnnotationStore>;

/**
 * Ends a text edit. An empty box is removed, and undo brings back what it said before. A new box
 * becomes one undo step, and a changed box becomes one step from its earlier version.
 */
export function commitTextEdit(store: AnnotationStore, session: EditSession): void {
  const current = store.getState().annotations.find((annotation) => annotation.id === session.id);
  if (current?.kind !== "text") return;
  const { before } = session;
  if (current.text.trim() === "") {
    store.getState().apply([{ type: "delete", prev: before ?? current }], { record: before !== undefined });
  } else if (before === undefined) {
    store.getState().apply([{ type: "put", next: current }], { record: true });
  } else if (!sameAnnotation(before, current)) {
    store.getState().apply([{ type: "put", next: current, prev: before }], { record: true });
  }
}

async function writeCommand(library: Library, lectureId: string, command: Command): Promise<void> {
  if (command.type === "put") {
    await library.setAnnotation(lectureId, command.next);
    return;
  }
  try {
    await library.removeAnnotation(lectureId, command.prev.id);
  } catch (error) {
    // Already gone, for example after a delete from another window. The end state is the same.
    if (!(error instanceof NotFoundError)) throw error;
  }
}
