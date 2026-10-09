import type { TextBoxStyle } from "@betternotez/core";
import { Bold, Italic, Underline } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { useEditor, type TextStylePatch } from "./editor";
import { placeBar, type Frame } from "./format-placement";
import { INK_COLORS } from "./inks";

/** Font sizes in points. M is the size a new box is made at. */
export const FONT_SIZES = [
  { label: "S", name: "Small text", value: 11 },
  { label: "M", name: "Medium text", value: 14 },
  { label: "L", name: "Large text", value: 18 },
  { label: "XL", name: "Extra large text", value: 24 },
] as const;

const MODIFIER = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl+";

/**
 * The format bar for a text box that is selected or being typed in. It is the box's own style, so it does not
 * belong in the tool palette. It is a child of the box, so it moves with the box while the box is dragged.
 */
export function FormatBar({
  style,
  frame,
  pageWidth,
  onChange,
  onEscape,
}: {
  readonly style: TextBoxStyle;
  readonly frame: Frame;
  /** The page width in CSS pixels. The bar stays inside it. */
  readonly pageWidth: number;
  readonly onChange: (patch: TextStylePatch) => void;
  /** Returns focus to the box, so a keyboard user can get back into the text. */
  readonly onEscape: () => void;
}) {
  const { scrollRef } = useEditor();
  const bar = useRef<HTMLDivElement>(null);
  // Relative to the box, which is the bar's containing block.
  const [place, setPlace] = useState({ left: 0, top: 0 });
  // A scroll moves the page under the toolbar, so the bar is placed again after each one.
  const [, setScrolls] = useState(0);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    const placeAgain = () => setScrolls((count) => count + 1);
    scroller.addEventListener("scroll", placeAgain, { passive: true });
    return () => scroller.removeEventListener("scroll", placeAgain);
  }, [scrollRef]);

  // Measured before paint, so the bar never shows in the wrong place. Its size is only known once it is drawn.
  useLayoutEffect(() => {
    const element = bar.current;
    const scroller = scrollRef.current;
    if (element === null || scroller === null || element.parentElement === null) return;
    // The box's border edge is the frame's origin, so the visible page is found by the offset between the two.
    const boxRect = element.parentElement.getBoundingClientRect();
    const viewRect = scroller.getBoundingClientRect();
    const placed = placeBar({
      box: frame,
      bar: { width: element.offsetWidth, height: element.offsetHeight },
      page: { width: pageWidth },
      view: {
        left: frame.left + viewRect.left - boxRect.left,
        top: frame.top + viewRect.top - boxRect.top,
        width: scroller.clientWidth,
      },
    });
    const next = { left: placed.left - frame.left, top: placed.top - frame.top };
    setPlace((previous) => (previous.left === next.left && previous.top === next.top ? previous : next));
  });

  return (
    <div
      ref={bar}
      role="group"
      aria-label="Format text box"
      className="raised-edge absolute z-10 flex w-max animate-[fade-in_140ms_ease-out] cursor-default items-center gap-0.5 rounded-md border border-border bg-raised p-1 shadow-(--lift)"
      style={{ left: place.left, top: place.top }}
      // Presses on the bar belong to the bar, so they must not start a move or select the box underneath.
      onPointerDown={(event) => event.stopPropagation()}
      // A press must not move focus, so an edit in progress keeps its cursor after a click on the bar.
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Stopped here, so the viewer's own Escape does not also clear the selection.
        event.preventDefault();
        event.stopPropagation();
        onEscape();
      }}
    >
      {FONT_SIZES.map((size) => (
        <FormatButton
          key={size.value}
          label={size.name}
          pressed={style.fontSize === size.value}
          onClick={() => onChange({ fontSize: size.value })}
          className="font-serif text-[15px] leading-none"
        >
          {size.label}
        </FormatButton>
      ))}

      <Divider />

      <FormatButton
        label="Bold"
        title={`Bold (${MODIFIER}B)`}
        pressed={style.bold}
        onClick={() => onChange({ bold: !style.bold })}
      >
        <Bold />
      </FormatButton>
      <FormatButton
        label="Italic"
        title={`Italic (${MODIFIER}I)`}
        pressed={style.italic}
        onClick={() => onChange({ italic: !style.italic })}
      >
        <Italic />
      </FormatButton>
      <FormatButton
        label="Underline"
        title={`Underline (${MODIFIER}U)`}
        pressed={style.underline}
        onClick={() => onChange({ underline: !style.underline })}
      >
        <Underline />
      </FormatButton>

      <Divider />

      <div role="group" aria-label="Text color" className="flex items-center gap-1.5 px-0.5">
        {INK_COLORS.map((ink) => (
          <button
            key={ink.value}
            type="button"
            aria-label={`${ink.name} ink`}
            aria-pressed={style.color.toLowerCase() === ink.value}
            title={`${ink.name} ink`}
            onClick={() => onChange({ color: ink.value })}
            className="relative size-[15px] shrink-0 rounded-full shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_35%,transparent)] transition-transform duration-150 ease-out before:absolute before:-inset-[9px] before:content-[''] active:scale-[0.96] aria-pressed:shadow-[0_0_0_2px_var(--raised),0_0_0_3.5px_var(--foreground)]"
            style={{ backgroundColor: ink.value }}
          />
        ))}
      </div>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />;
}

function FormatButton({
  label,
  title,
  pressed,
  onClick,
  className,
  children,
}: {
  readonly label: string;
  readonly title?: string;
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      onClick={onClick}
      className={cn(
        "relative grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1 text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out before:absolute before:-inset-1 before:content-[''] hover:bg-foreground/5 hover:text-foreground active:scale-[0.96] [&_svg]:size-4",
        pressed && "bg-foreground text-background hover:bg-foreground hover:text-background",
        className,
      )}
    >
      {children}
    </button>
  );
}
