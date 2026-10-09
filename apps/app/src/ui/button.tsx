import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

/** Primary is ink on paper, so the vermilion accent stays for marks and the active state. */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-foreground text-background hover:bg-foreground/90",
  secondary: "border border-control text-foreground hover:bg-foreground/5",
  danger: "bg-danger-solid text-danger-foreground hover:bg-danger-solid/90",
  ghost: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
};

export function buttonClass(variant: ButtonVariant = "secondary"): string {
  return cn(
    "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm transition-[background-color,color,opacity,transform] duration-150 ease-out active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:border-foreground [&_svg]:size-4",
    VARIANTS[variant],
  );
}

export const iconButtonClass = cn(
  "relative grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] hover:bg-foreground/5 hover:text-foreground before:absolute before:-inset-1 before:content-[''] [&_svg]:size-4",
);

export function Button({
  variant,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: ButtonVariant }) {
  return <button type={type} className={cn(buttonClass(variant), className)} {...props} />;
}
