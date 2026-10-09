import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";

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
  // Radix returns focus to what it saw at mount. An autofocused field has already taken focus by then, so the opener is kept here, from the first render.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-[fade-in_150ms_ease-out] bg-overlay backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener?.isConnected) opener.focus();
          }}
          className="raised-edge fixed top-1/2 left-1/2 z-50 w-[min(calc(100vw-2rem),32rem)] -translate-x-1/2 -translate-y-1/2 animate-[dialog-in_200ms_cubic-bezier(0.23,1,0.32,1)] rounded-xl border border-border bg-raised p-8 shadow-(--lift) outline-none"
        >
          <div className="border-b border-border pr-10 pb-5">
            <DialogPrimitive.Title className="font-serif text-[30px] leading-tight">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-5 right-5 grid size-8 place-items-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] hover:bg-foreground/5 hover:text-foreground [&_svg]:size-4"
          >
            <X />
          </DialogPrimitive.Close>
          <div className="mt-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogActions({ children }: { readonly children: ReactNode }) {
  return <div className="mt-8 flex justify-end gap-2">{children}</div>;
}
