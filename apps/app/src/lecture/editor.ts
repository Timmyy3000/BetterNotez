import type { TextBox } from "@betternotez/core";
import { createContext, useContext, type RefObject } from "react";
import type { AnnotationStore } from "./annotation-store";

export type Tool = "select" | "text" | "pen" | "highlighter" | "eraser";

/** A text box being typed in. `before` is its state when editing began, and is absent for a new box. */
export interface EditSession {
  readonly id: string;
  readonly before?: TextBox;
}

export interface EditorValue {
  readonly store: AnnotationStore;
  readonly tool: Tool;
  readonly color: string;
  /** Pen width in PDF points. The highlighter draws a wider stroke at the same setting. */
  readonly size: number;
  readonly selectedId?: string;
  readonly editing?: EditSession;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly select: (id: string | undefined) => void;
  readonly beginEdit: (session: EditSession) => void;
  readonly endEdit: (id: string) => void;
}

export const EditorContext = createContext<EditorValue | undefined>(undefined);

export function useEditor(): EditorValue {
  const editor = useContext(EditorContext);
  if (editor === undefined) {
    throw new Error("useEditor must be used inside EditorContext");
  }
  return editor;
}

/** Keys and clipboard shortcuts belong to a text field, so the viewer leaves them alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}
