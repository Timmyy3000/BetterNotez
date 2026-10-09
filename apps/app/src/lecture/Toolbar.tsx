import { ChevronDown, ChevronUp, Eraser, Highlighter, MousePointer2, Pen, Redo2, Trash2, Type, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import type { Tool } from "./editor";

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;

export const INK_COLORS = [
  { name: "Black", value: "#1c1917" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
] as const;

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
      className="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-border raised-edge bg-raised/95 p-1.5 shadow-lg backdrop-blur"
    >
      {TOOLS.map(({ tool: value, label, icon: Icon }) => (
        <IconToggle key={value} label={label} active={tool === value} onClick={() => onTool(value)}>
          <Icon />
        </IconToggle>
      ))}

      <Divider />

      {INK_COLORS.map((swatch) => (
        <button
          key={swatch.value}
          type="button"
          aria-label={`Color ${swatch.name}`}
          aria-pressed={color === swatch.value}
          onClick={() => onColor(swatch.value)}
          className={cn(
            "grid size-7 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent",
            color === swatch.value && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
          )}
        >
          <span className="size-4 rounded-full border-2 border-foreground/40" style={{ backgroundColor: swatch.value }} />
        </button>
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
            "grid size-8 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent",
            size === option.value && "bg-accent-soft text-accent",
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
      <IconToggle label="Delete text box" disabled={!canDelete} onClick={onDelete}>
        <Trash2 />
      </IconToggle>
    </div>
  );
}

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
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-border raised-edge bg-raised/95 p-1.5 text-sm shadow-lg backdrop-blur">
      <IconToggle label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronUp />
      </IconToggle>
      <span className="min-w-24 text-center tabular-nums" aria-live="polite">
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
        className="h-8 min-w-16 rounded-lg px-2 text-center text-muted-foreground tabular-nums transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        {zoom === 1 ? "Fit width" : `${percent}%`}
      </button>
      <IconToggle label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => onZoom(zoom * ZOOM_STEP)}>
        <ZoomIn />
      </IconToggle>
    </div>
  );
}

function IconToggle({
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
        "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
        active && "bg-accent-soft text-accent",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-6 w-px bg-border" />;
}
