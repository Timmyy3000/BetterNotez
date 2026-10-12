import type { ComponentProps } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isDesktop } from "../lib/platform";

/**
 * A note as it reads on the page. A note holds text an assistant may have written, so nothing here loads from the
 * network or runs. Task-list checkboxes come out disabled and stay that way, because ticking one would rewrite the
 * note's source.
 */
const components: Components = {
  a: NoteLink,
  img: NoteImage,
  table: NoteTable,
};

/**
 * The note as Markdown. Raw HTML is deliberately not rendered. There is no rehype-raw below, so a note's tags show as
 * text. Do not add rehype-raw here.
 */
export function NoteText({ text }: { readonly text: string }) {
  return (
    <div className="notes-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}

/**
 * A link with no address shows its text alone. Markdown leaves the address empty when it is unsafe, such as a
 * javascript: address. The desktop window must not navigate away from the app, so its links show as text too.
 */
function NoteLink({ href, children }: ComponentProps<"a">) {
  if (!href || isDesktop()) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** The alt text stands in for the picture, so a note never fetches an image. */
function NoteImage({ alt }: ComponentProps<"img">) {
  return <span>{alt || "image"}</span>;
}

/** A wide table scrolls sideways inside the panel instead of squeezing its columns. */
function NoteTable({ children }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  );
}
