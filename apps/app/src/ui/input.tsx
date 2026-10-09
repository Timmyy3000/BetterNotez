import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** A boxed field. Its border meets the 3:1 contrast needed for a control. Focus comes from the shared outline. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-control bg-background px-3 text-[15px] transition-colors placeholder:text-faint focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
