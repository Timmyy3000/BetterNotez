import { Children, type ComponentProps, isValidElement, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isDesktop } from "../lib/platform";

const components: Components = {
  a: NoteLink,
  h1: "h3",
  h2: "h4",
  h3: "h5",
  h4: "h6",
  h5: "h6",
  img: NoteImage,
  li: NoteItem,
  table: NoteTable,
};

export function NoteText({ text }: { readonly text: string }) {
  return (
    <div className="notes-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}

const WEB_ADDRESS = /^(https?|mailto):/i;

function NoteLink({ href, children }: ComponentProps<"a">) {
  if (!href || !WEB_ADDRESS.test(href) || isDesktop()) return <span>{children}</span>;
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

function NoteItem({ className, children }: ComponentProps<"li">) {
  const nodes = Children.toArray(children);
  const isSeparator = (node: ReactNode, index: number) =>
    node === "\n" && [nodes[index - 1], nodes[index + 1]].some(isBlockElement);
  return <li className={className}>{nodes.filter((node, index) => !isSeparator(node, index))}</li>;
}

function NoteImage({ alt }: ComponentProps<"img">) {
  return <span>{alt || "image"}</span>;
}

function NoteTable({ children }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  );
}
