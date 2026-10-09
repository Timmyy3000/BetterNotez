import type { CSSProperties } from "react";

/** Places a block in the single page-load sequence. index.css staggers each step by 70ms. */
export function revealAt(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}
