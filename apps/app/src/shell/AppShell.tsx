import { Outlet, useMatch } from "react-router";
import { cn } from "../lib/cn";
import { Rail } from "./Rail";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  // The lecture viewer fills the window behind a collapsed rail, and it scrolls its own pages.
  const immersive = useMatch("/lecture/:lectureId") !== null;
  return (
    <div className="flex h-dvh">
      {immersive ? <Rail /> : <Sidebar />}
      <main className={cn("min-w-0 flex-1", immersive ? "flex flex-col overflow-hidden" : "overflow-y-auto")}>
        <div
          className={cn(
            immersive ? "flex min-h-0 flex-1 flex-col" : "mx-auto w-full max-w-[1040px] px-8 pt-14 pb-20 sm:px-12 xl:px-16",
          )}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
