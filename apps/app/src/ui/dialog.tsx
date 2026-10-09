import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./button";

/** A modal that is mounted while it is needed. Closing it calls `onClose`, and the parent unmounts it. */
export function ModalDialog({
  title,
  description,
  onClose,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay backdrop-blur-[2px] animate-[fade-in_150ms_ease-out]" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 -translate-y-1/2 raised-edge rounded-xl border border-border bg-raised p-6 shadow-2xl outline-none animate-[dialog-in_180ms_ease-out]">
          <DialogPrimitive.Title className="pr-8 text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
          <DialogPrimitive.Close
            aria-label="Close"
            className={cn(
              "absolute top-4 right-4 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              focusRing,
            )}
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
          <div className="mt-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogActions({ children }: { readonly children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}
