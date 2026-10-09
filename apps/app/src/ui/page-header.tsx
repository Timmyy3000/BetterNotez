import type { ReactNode } from "react";
import { revealAt } from "../lib/motion";

/**
 * The masthead of a page: a small label, the title in serif, an optional italic deck, and a double rule beneath.
 * Actions sit on the right and wrap below the title on narrow windows.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  readonly title: string;
  readonly eyebrow?: ReactNode;
  readonly description?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <>
      <header className="rise flex flex-wrap items-end justify-between gap-x-8 gap-y-5" style={revealAt(0)}>
        <div className="flex min-w-0 flex-col gap-4">
          {eyebrow !== undefined && <p className="label flex items-center gap-2.5">{eyebrow}</p>}
          <h1 className="text-[clamp(3rem,5.6vw,5rem)] leading-[0.92] tracking-[-0.02em]">{title}</h1>
          {description !== undefined && (
            <p className="font-serif text-2xl leading-[1.3] text-muted-foreground italic">{description}</p>
          )}
        </div>
        {actions !== undefined && <div className="flex shrink-0 items-end gap-3">{actions}</div>}
      </header>
      <div aria-hidden className="rise double-rule my-10" style={revealAt(1)} />
    </>
  );
}
