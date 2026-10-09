import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent/90",
  secondary: "border border-control bg-surface hover:bg-muted",
  danger: "bg-danger-solid text-white hover:bg-danger-solid/90",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
};

/** The keyboard focus ring for buttons, links, and cards. Inputs use their own border and ring. */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function buttonClass(variant: ButtonVariant = "secondary"): string {
  return cn(
    "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
    focusRing,
    VARIANTS[variant],
  );
}

export const iconButtonClass = cn(
  "relative grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 active:scale-[0.96] hover:bg-muted hover:text-foreground before:absolute before:-inset-1 before:content-[''] [&_svg]:size-4",
  focusRing,
);

export function Button({
  variant,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: ButtonVariant }) {
  return <button type={type} className={cn(buttonClass(variant), className)} {...props} />;
}
