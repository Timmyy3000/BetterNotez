import { Children, type ComponentProps, isValidElement, type ReactNode } from "react";
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
  li: NoteItem,
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

const BLOCK_ELEMENTS: unknown[] = ["p", "ul", "ol", "pre", "blockquote", "hr", NoteTable];

function isBlockElement(node: ReactNode): boolean {
  return isValidElement(node) && BLOCK_ELEMENTS.includes(node.type);
}

/**
 * Markdown puts a newline between a list item's blocks. The item keeps its line breaks, so such a newline would show as
 * an empty line, and it is dropped. A newline between two pieces of inline text is a real line break, and stays.
 */
function NoteItem({ className, children }: ComponentProps<"li">) {
  const nodes = Children.toArray(children);
  const isSeparator = (node: ReactNode, index: number) =>
    node === "\n" && [nodes[index - 1], nodes[index + 1]].some(isBlockElement);
  return <li className={className}>{nodes.filter((node, index) => !isSeparator(node, index))}</li>;
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
