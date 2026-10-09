import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { LibraryProvider } from "./library";
import { AppShell } from "./shell/AppShell";
import { HomePage } from "./pages/HomePage";
import { LecturePage } from "./pages/LecturePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlannerPage } from "./pages/PlannerPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SubjectPage } from "./pages/SubjectPage";
import { TasksPage } from "./pages/TasksPage";
import { toasterTheme, useAppTheme } from "./theme";
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
      { path: "settings", element: <SettingsPage /> },
      { path: "about", element: <Navigate to="/settings" replace /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  const theme = useAppTheme();
  return (
    <LibraryProvider>
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" theme={toasterTheme(theme)} />
      </TooltipProvider>
    </LibraryProvider>
  );
}
