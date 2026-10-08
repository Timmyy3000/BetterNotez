import { createHashRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { LibraryProvider } from "./library";
import { AppShell } from "./shell/AppShell";
import { HomePage } from "./pages/HomePage";
import { LecturePage } from "./pages/LecturePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlannerPage, TasksPage } from "./pages/PlaceholderPages";
import { SearchPage } from "./pages/SearchPage";
import { SubjectPage } from "./pages/SubjectPage";
import { TooltipProvider } from "./ui/tooltip";

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "subjects/:subjectId", element: <SubjectPage /> },
      { path: "lecture/:lectureId", element: <LecturePage /> },
      { path: "planner", element: <PlannerPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <LibraryProvider>
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" closeButton />
      </TooltipProvider>
    </LibraryProvider>
  );
}
