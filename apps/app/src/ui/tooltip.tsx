import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { iconButtonClass } from "./button";

export const TooltipProvider = TooltipPrimitive.Provider;

/** An icon-only button. Its label is both the accessible name and the tooltip. */
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string; readonly children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <button type="button" aria-label={label} className={iconButtonClass} {...props}>
          {children}
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          sideOffset={6}
          className="z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
