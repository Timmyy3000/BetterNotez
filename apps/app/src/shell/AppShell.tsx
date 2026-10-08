import { Outlet, useMatch } from "react-router";
import { cn } from "../lib/cn";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  // The lecture viewer fills the window and scrolls its own pages, so it gets no page padding.
  const immersive = useMatch("/lecture/:lectureId") !== null;
  return (
    <div className="flex h-dvh">
      <Sidebar />
      <main className={cn("min-w-0 flex-1", immersive ? "flex flex-col overflow-hidden" : "overflow-y-auto")}>
        <div className={cn(immersive ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-5xl px-8 py-10")}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
