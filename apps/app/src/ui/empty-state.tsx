import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon className="size-6" />
      </span>
      <h2 className="mt-5 text-base font-semibold">{title}</h2>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
