import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A page with nothing on it yet. The explanation is set in italic, as a note in the margin would be. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-lg border border-dashed border-control text-accent">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-6 font-serif text-[32px] leading-tight">{title}</h2>
      {children && <p className="mt-3 max-w-md font-serif text-lg leading-snug text-muted-foreground italic">{children}</p>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}
