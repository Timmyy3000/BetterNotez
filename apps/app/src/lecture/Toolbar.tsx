import { ChevronDown, ChevronUp, Eraser, Highlighter, MousePointer2, Pen, Redo2, Trash2, Type, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { HIGHLIGHT_COLORS } from "@betternotez/core";
import { cn } from "../lib/cn";
import type { Tool } from "./editor";
import { INK_COLORS } from "./inks";

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;

/** The ink a new stroke or text box starts with: the pen blue of the mockup. */
export const DEFAULT_INK = "#2b4b78";

/** The colour swatches the tool panel offers for a tool. The highlighter has its own marker palette. */
export function paletteFor(tool: Tool): readonly { readonly label: string; readonly value: string }[] {
  if (tool === "highlighter") return HIGHLIGHT_COLORS.map((swatch) => ({ label: swatch.label, value: swatch.value }));
  return INK_COLORS.map((swatch) => ({ label: swatch.name, value: swatch.value }));
}

export const PEN_SIZES = [
  { name: "Thin", value: 1.5 },
  { name: "Medium", value: 3 },
  { name: "Thick", value: 6 },
] as const;

const TOOLS: readonly { readonly tool: Tool; readonly label: string; readonly icon: LucideIcon }[] = [
  { tool: "select", label: "Select and move", icon: MousePointer2 },
  { tool: "text", label: "Text box", icon: Type },
  { tool: "pen", label: "Pen", icon: Pen },
  { tool: "highlighter", label: "Highlighter", icon: Highlighter },
  { tool: "eraser", label: "Eraser", icon: Eraser },
];

/** The floating tool palette above the page. It is one raised strip, with pressed tools filled in ink. */
export function Toolbar({
  tool,
  onTool,
  color,
  onColor,
  size,
  onSize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canDelete,
  onDelete,
}: {
  readonly tool: Tool;
  readonly onTool: (tool: Tool) => void;
  readonly color: string;
  readonly onColor: (color: string) => void;
  readonly size: number;
  readonly onSize: (size: number) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly canDelete: boolean;
  readonly onDelete: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Annotate"
      className="raised-edge absolute top-[18px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-border bg-raised p-[5px] shadow-(--lift)"
    >
      {TOOLS.map(({ tool: value, label, icon: Icon }) => (
        <IconToggle key={value} label={label} active={tool === value} onClick={() => onTool(value)}>
          <Icon />
        </IconToggle>
      ))}

      <Divider />

      {paletteFor(tool).map((swatch) => (
        <ColorSwatch
          key={swatch.value}
          label={`Color ${swatch.label}`}
          value={swatch.value}
          pressed={color === swatch.value}
          onClick={() => onColor(swatch.value)}
        />
      ))}

      <Divider />

      {PEN_SIZES.map((option) => (
        <button
          key={option.name}
          type="button"
          aria-label={option.name}
          aria-pressed={size === option.value}
          onClick={() => onSize(option.value)}
          className={cn(
            "relative grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-[background-color,color] duration-150 ease-out before:absolute before:-inset-1 before:content-[''] hover:bg-foreground/5 hover:text-foreground [&_svg]:size-4",
            size === option.value && "bg-foreground text-background hover:bg-foreground hover:text-background",
          )}
        >
          <span className="rounded-full bg-current" style={{ width: 4 + option.value * 2, height: 4 + option.value * 2 }} />
        </button>
      ))}

      <Divider />

      <IconToggle label="Undo" disabled={!canUndo} onClick={onUndo}>
        <Undo2 />
      </IconToggle>
      <IconToggle label="Redo" disabled={!canRedo} onClick={onRedo}>
        <Redo2 />
      </IconToggle>
      <IconToggle label="Delete selected" disabled={!canDelete} onClick={onDelete}>
        <Trash2 />
      </IconToggle>
    </div>
  );
}

/** One of the palette's colours, as a round chip. The chip rings itself when it is the current colour. */
export function ColorSwatch({
  label,
  value,
  pressed,
  onClick,
}: {
  readonly label: string;
  readonly value: string;
  readonly pressed: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className="relative mx-1 size-[18px] shrink-0 rounded-full shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_35%,transparent)] transition-transform duration-150 ease-out before:absolute before:-inset-[11px] before:content-[''] active:scale-[0.96] aria-pressed:shadow-[0_0_0_2px_var(--raised),0_0_0_3.5px_var(--foreground)]"
      style={{ backgroundColor: value }}
    />
  );
}

/** The page navigator and zoom, in the desk margin below the page. The page count keeps its "Page N of M" wording. */
export function ViewControls({
  page,
  pageCount,
  zoom,
  onPage,
  onZoom,
}: {
  readonly page: number;
  readonly pageCount: number;
  readonly zoom: number;
  readonly onPage: (page: number) => void;
  readonly onZoom: (zoom: number) => void;
}) {
  const percent = Math.round(zoom * 100);
  return (
    <div className="raised-edge absolute bottom-5 left-5 z-20 flex items-center gap-0.5 rounded-md border border-border bg-raised p-[5px] text-sm shadow-(--lift)">
      <IconToggle label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronUp />
      </IconToggle>
      <span className="min-w-24 px-1 text-center text-[14px] text-muted-foreground tabular-nums" aria-live="polite">
        Page {page} of {pageCount}
      </span>
      <IconToggle label="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        <ChevronDown />
      </IconToggle>

      <Divider />

      <IconToggle label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => onZoom(zoom / ZOOM_STEP)}>
        <ZoomOut />
      </IconToggle>
      <button
        type="button"
        onClick={() => onZoom(1)}
        className="h-9 min-w-16 rounded-md px-2 text-center text-[14px] text-muted-foreground tabular-nums transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
      >
        {zoom === 1 ? "Fit width" : `${percent}%`}
      </button>
      <IconToggle label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => onZoom(zoom * ZOOM_STEP)}>
        <ZoomIn />
      </IconToggle>
    </div>
  );
}

export function IconToggle({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  readonly label: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ? true : undefined}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out before:absolute before:-inset-1 before:content-[''] hover:bg-foreground/5 hover:text-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
        active && "bg-foreground text-background hover:bg-foreground hover:text-background",
      )}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <span aria-hidden className="mx-1.5 h-[22px] w-px shrink-0 bg-border" />;
}
