import { invoke } from "@tauri-apps/api/core";
import { Bot, FolderOpen, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import pkg from "../../package.json";
import { cn } from "../lib/cn";
import { isDesktop } from "../lib/platform";
import { libraryFolder } from "../storage";
import { type ThemePreference, useThemeStore } from "../theme";
import { Button, focusRing } from "../ui/button";
import { Copyable } from "../ui/copyable";
import { PageHeader } from "../ui/page-header";

const RELEASES_URL = "https://github.com/Timmyy3000/BetterNotez/releases";
const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;
const REPOSITORY_URL = "https://github.com/Timmyy3000/BetterNotez";
const NODE_URL = "https://nodejs.org/";
const SERVER_PLACEHOLDER = "/absolute/path/to/betternotez-mcp.mjs";
const LIBRARY_PLACEHOLDER = "/absolute/path/to/BetterNotez Library";

const THEME_OPTIONS: readonly { readonly value: ThemePreference; readonly label: string; readonly icon: LucideIcon }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function SettingsPage() {
  const desktop = isDesktop();
  const [folder, setFolder] = useState<string>();

  useEffect(() => {
    if (desktop) void libraryFolder().then(setFolder);
  }, [desktop]);

  return (
    <>
      <PageHeader title="Settings" description="Appearance, your library, and the AI assistant." />

      <AppearanceSection />
      <AssistantSection desktop={desktop} folder={folder} />
      <LibrarySection desktop={desktop} folder={folder} />
      <AboutSection />
    </>
  );
}

function AppearanceSection() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <Section id="appearance-heading" title="Appearance">
      <p className="mt-1 text-sm text-muted-foreground">Dark is the default. System matches your computer's setting.</p>
      <div role="group" aria-label="Theme" className="mt-4 inline-flex rounded-xl border border-border bg-muted p-1">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => setPreference(value)}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors [&_svg]:size-4",
                focusRing,
                selected
                  ? "bg-surface text-foreground shadow-sm ring-1 ring-border [&_svg]:text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon />
              {label}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function AssistantSection({ desktop, folder }: { readonly desktop: boolean; readonly folder: string | undefined }) {
  if (!desktop) {
    return (
      <Section id="assistant-heading" title="Connect an AI assistant" icon={Bot}>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Connecting an AI assistant needs the desktop app. The assistant reads the library folder on your computer, and
          the web app keeps its library in this browser.{" "}
          <a href={RELEASES_URL} className="text-accent underline underline-offset-2">
            Download the desktop app
          </a>
          .
        </p>
      </Section>
    );
  }

  const libraryPath = folder ?? LIBRARY_PLACEHOLDER;
  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        betternotez: { command: "node", args: [SERVER_PLACEHOLDER, "--library", libraryPath] },
      },
    },
    null,
    2,
  );
  const claudeCodeCommand = `claude mcp add betternotez -- node ${SERVER_PLACEHOLDER} --library "${libraryPath}"`;

  return (
    <Section id="assistant-heading" title="Connect an AI assistant" icon={Bot}>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        An AI assistant such as Claude can read your library and make changes for you. It connects through MCP, a
        standard way for AI apps to use tools on your computer. BetterNotez includes that tool. Setup takes three steps.
      </p>

      <ol className="mt-6 space-y-6">
        <Step number={1}>
          <p>
            Download <code className="text-foreground">betternotez-mcp.mjs</code> from the{" "}
            <a href={LATEST_RELEASE_URL} className="text-accent underline underline-offset-2">
              latest release
            </a>
            . Save it in a folder you will keep, then copy its full file path.
          </p>
          <p className="text-muted-foreground">
            It needs{" "}
            <a href={NODE_URL} className="text-accent underline underline-offset-2">
              Node.js
            </a>{" "}
            22 or newer.
          </p>
        </Step>

        <Step number={2}>
          <p>Add the server to Claude. Replace the placeholder path below with the file path from step 1.</p>
          <h3 className="mt-4 text-sm font-medium">Claude Desktop</h3>
          <p className="mt-1 text-muted-foreground">Paste this into claude_desktop_config.json.</p>
          <Copyable label="Claude Desktop config" value={claudeDesktopConfig} />
          <h3 className="mt-4 text-sm font-medium">Claude Code</h3>
          <p className="mt-1 text-muted-foreground">Run this once in a terminal.</p>
          <Copyable label="Claude Code command" value={claudeCodeCommand} />
        </Step>

        <Step number={3}>
          <p>Restart Claude Desktop, or start a new Claude Code session.</p>
        </Step>
      </ol>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">What Claude can do</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Read subjects, lectures, notes, and the text inside PDFs</li>
            <li>Create and edit notes, tasks, planner classes, and drawings on PDFs</li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-medium">What Claude can't do</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Delete anything. Deleting happens only in the app.</li>
          </ul>
        </div>
      </div>
    </Section>
  );
}

function LibrarySection({ desktop, folder }: { readonly desktop: boolean; readonly folder: string | undefined }) {
  if (!desktop) {
    return (
      <Section id="library-heading" title="Your library">
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          This web app keeps your library in this browser. Clearing site data removes it, and other browsers cannot see
          it. To keep a copy of one lecture, use Export PDF in its viewer. For a library you can back up as a folder, use
          the desktop app.
        </p>
      </Section>
    );
  }

  return (
    <Section id="library-heading" title="Your library">
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Your library is one folder on this computer. Lectures, notes, annotations, and tasks are plain files, so you can
        open, copy, or back up the folder without BetterNotez.
      </p>
      {folder !== undefined && (
        <>
          <div className="mt-4">
            <Button onClick={() => void openFolder(folder)}>
              <FolderOpen />
              Open folder
            </Button>
          </div>
          <Copyable label="Library folder" value={folder} />
        </>
      )}
    </Section>
  );
}

function AboutSection() {
  return (
    <Section id="about-heading" title="About">
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        BetterNotez {pkg.version} is free and open source, licensed under AGPL-3.0.
      </p>
      <a href={REPOSITORY_URL} className="mt-3 inline-block text-sm text-accent underline underline-offset-2">
        View the code on GitHub
      </a>
    </Section>
  );
}

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly icon?: LucideIcon;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10 max-w-2xl border-t border-border pt-8">
      <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
        {Icon !== undefined && <Icon className="size-5 text-accent" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Step({ number, children }: { readonly number: number; readonly children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-2 text-sm leading-relaxed">{children}</div>
    </li>
  );
}

async function openFolder(path: string): Promise<void> {
  try {
    await invoke("reveal_folder", { path });
  } catch {
    toast.error("The folder could not be opened. Open it from your file manager.");
  }
}
