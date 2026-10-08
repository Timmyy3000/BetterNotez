import type { Annotation } from "@betternotez/core";

/**
 * One change to a lecture's annotations. `put` adds an annotation or replaces it. `prev` is the
 * version it replaces, and is absent when the annotation is new. `delete` removes one.
 */
export type Command =
  | { readonly type: "put"; readonly next: Annotation; readonly prev?: Annotation }
  | { readonly type: "delete"; readonly prev: Annotation };

/** Commands that one user action makes, such as one stroke or one erase drag. Undo takes a whole step. */
export type Step = readonly Command[];

export interface History {
  readonly past: readonly Step[];
  readonly future: readonly Step[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

export function invertCommand(command: Command): Command {
  switch (command.type) {
    case "put":
      return command.prev
        ? { type: "put", next: command.prev, prev: command.next }
        : { type: "delete", prev: command.next };
    case "delete":
      return { type: "put", next: command.prev };
  }
}

/** The step that undoes `step`: its commands inverted, in reverse order. */
export function invertStep(step: Step): Step {
  return [...step].reverse().map(invertCommand);
}

export function applyStep(annotations: readonly Annotation[], step: Step): Annotation[] {
  return step.reduce<Annotation[]>((list, command) => {
    if (command.type === "delete") {
      return list.filter((annotation) => annotation.id !== command.prev.id);
    }
    const exists = list.some((annotation) => annotation.id === command.next.id);
    return exists
      ? list.map((annotation) => (annotation.id === command.next.id ? command.next : annotation))
      : [...list, command.next];
  }, [...annotations]);
}

/** Field-by-field equality. Key order does not matter, so a copy read from disk compares equal. */
export function sameAnnotation(a: Annotation, b: Annotation): boolean {
  return canonical(a) === canonical(b);
}

export function sameAnnotations(a: readonly Annotation[], b: readonly Annotation[]): boolean {
  return a.length === b.length && a.every((annotation, index) => sameAnnotation(annotation, b[index] as Annotation));
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([x], [y]) => (x < y ? -1 : 1)))
      : item,
  );
}

export function pushStep(history: History, step: Step): History {
  return { past: [...history.past, step], future: [] };
}

/** Moves the last step to `future`. Returns the inverse of that step to run, or undefined when there is none. */
export function takeUndo(history: History): { readonly history: History; readonly run: Step } | undefined {
  const step = history.past.at(-1);
  if (step === undefined) {
    return undefined;
  }
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, step] },
    run: invertStep(step),
  };
}

/** Moves the next step back to `past`. Returns that step to run, or undefined when there is none. */
export function takeRedo(history: History): { readonly history: History; readonly run: Step } | undefined {
  const step = history.future.at(-1);
  if (step === undefined) {
    return undefined;
  }
  return {
    history: { past: [...history.past, step], future: history.future.slice(0, -1) },
    run: step,
  };
}
