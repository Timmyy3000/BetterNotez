import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "../lib/cn";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** Radix does not accept an empty value for an option, so "" (such as "No subject") is carried as this stand-in. */
const EMPTY_ITEM = "__empty__";

interface SelectCommon {
  readonly options: readonly SelectOption[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly disabled?: boolean;
  /** `field` is a boxed control, as in the forms. `inline` is underlined, for a page's header. */
  readonly variant?: "field" | "inline";
  readonly className?: string;
}

/** Every dropdown needs an accessible name: an `aria-label`, or the id of the element that labels it. */
type SelectName =
  | { readonly "aria-label": string; readonly "aria-labelledby"?: never }
  | { readonly "aria-labelledby": string; readonly "aria-label"?: never };

export type SelectProps = SelectCommon & SelectName;

const FIELD_TRIGGER =
  "h-10 w-full rounded-lg border border-control bg-background px-3 text-[15px] hover:border-rule-strong focus:border-foreground focus-visible:outline-foreground data-[state=open]:border-foreground";

const INLINE_TRIGGER =
  "border-0 border-b border-rule-strong bg-transparent py-2 text-[17px] focus:border-foreground focus-visible:outline-foreground data-[state=open]:border-foreground";

/**
 * A dropdown drawn in the app's own paper and ink. A native select opens its list in the operating system's colours,
 * which ignore the theme. Keyboard use follows the listbox pattern: arrows, typing to jump, Enter, and Escape.
 */
export function Select(props: SelectProps) {
  return <SelectControl {...props} />;
}

interface SelectControlProps extends SelectCommon {
  readonly id?: string;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
}

function SelectControl({
  options,
  value,
  onValueChange,
  disabled = false,
  variant = "field",
  className,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": labelledBy,
}: SelectControlProps) {
  return (
    <SelectPrimitive.Root
      value={toItem(value)}
      onValueChange={(next) => onValueChange(fromItem(next))}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        className={cn(
          "group flex min-w-0 cursor-pointer items-center justify-between gap-2 text-left text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          variant === "field" ? FIELD_TRIGGER : INLINE_TRIGGER,
          className,
        )}
      >
        <SelectPrimitive.Value className="min-w-0 truncate" />
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="raised-edge z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) animate-[dialog-in_120ms_ease-out] overflow-hidden rounded-xl border border-border bg-raised p-1.5 text-foreground shadow-(--lift)"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={toItem(option.value)}
                className="relative flex cursor-default items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-2.5 text-[15px] outline-none select-none data-[highlighted]:bg-foreground/5 data-[state=checked]:font-medium"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ml-auto text-accent">
                  <Check aria-hidden className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** The value Radix is given. The empty value becomes the stand-in, because Radix rejects an empty item value. */
export function toItem(value: string): string {
  return value === "" ? EMPTY_ITEM : value;
}

/** The value the caller is given. Choosing the stand-in reports the empty value again. */
export function fromItem(item: string): string {
  return item === EMPTY_ITEM ? "" : item;
}

/** A select under a visible `<label>`. The label is tied to the trigger, so it names the control for assistive technology. */
export function SelectField({ label, ...control }: SelectCommon & { readonly label: string }) {
  const triggerId = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={triggerId} className="block text-sm font-medium">
        {label}
      </label>
      <SelectControl {...control} id={triggerId} />
    </div>
  );
}
