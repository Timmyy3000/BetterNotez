import { CalendarDays, ListChecks, Search, SlidersHorizontal, type LucideIcon } from "lucide-react";

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** The working views, in the order a student reaches for them. */
export const MAIN_NAV: readonly NavItem[] = [
  { to: "/planner", label: "Planner", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/search", label: "Search", icon: Search },
];

export const SETTINGS_NAV: NavItem = { to: "/settings", label: "Settings", icon: SlidersHorizontal };
