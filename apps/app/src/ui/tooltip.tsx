import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { iconButtonClass } from "./button";

export const TooltipProvider = TooltipPrimitive.Provider;

/** An icon-only button. Its label is both the accessible name and the tooltip. */
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string; readonly children: ReactNode }) {
  return (
    <Tip label={label}>
      <button type="button" aria-label={label} className={iconButtonClass} {...props}>
        {children}
      </button>
    </Tip>
  );
}

/** An icon-only link, labelled the same way as IconButton. */
export function IconLink({ label, children, ...props }: LinkProps & { readonly label: string }) {
  return (
    <Tip label={label}>
      <Link aria-label={label} className={iconButtonClass} {...props}>
        {children}
      </Link>
    </Tip>
  );
}

function Tip({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          sideOffset={6}
          className="z-50 animate-[fade-in_125ms_ease-out] rounded-md bg-foreground px-2 py-1 text-xs text-background"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
