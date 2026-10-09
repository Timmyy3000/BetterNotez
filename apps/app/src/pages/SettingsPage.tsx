import { invoke } from "@tauri-apps/api/core";
import { Flame, FolderOpen, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import pkg from "../../package.json";
import { cn } from "../lib/cn";
import { romanNumeral } from "../lib/format";
import { revealAt } from "../lib/motion";
import { isDesktop } from "../lib/platform";
import { libraryFolder } from "../storage";
import { type ThemePreference, useThemeStore } from "../theme";
import { Button } from "../ui/button";
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
  { value: "warm", label: "Warm", icon: Flame },
];

export function SettingsPage() {
  const desktop = isDesktop();
  const [folder, setFolder] = useState<string>();

  useEffect(() => {
    if (desktop) void libraryFolder().then(setFolder);
  }, [desktop]);

  return (
    <>
      <PageHeader title="Settings" description="Change how BetterNotez looks, find your library, and connect Claude." />

      <div className="rise max-w-2xl space-y-16" style={revealAt(2)}>
        <AppearanceSection />
        <LibrarySection desktop={desktop} folder={folder} />
        <AssistantSection desktop={desktop} folder={folder} />
        <AboutSection />
      </div>
    </>
  );
}

function AppearanceSection() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <Section id="appearance-heading" title="Appearance" numeral={1}>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Choose how BetterNotez looks. System follows your computer's light or dark setting. Warm is the brown paper
        dark, and Dark is a neutral charcoal.
      </p>
      <div role="group" aria-label="Theme" className="mt-5 inline-flex gap-2">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => setPreference(value)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-sm transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] [&_svg]:size-4",
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-control text-foreground hover:bg-foreground/5",
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

function LibrarySection({ desktop, folder }: { readonly desktop: boolean; readonly folder: string | undefined }) {
  if (!desktop) {
    return (
      <Section id="library-heading" title="Your library" numeral={2}>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          This web app keeps your library in this browser only. Clearing your browser's data deletes it, and other
          browsers or computers cannot open it. To keep one lecture, open it and click Export PDF. To back up the whole
          library as a folder, use the desktop app.
        </p>
      </Section>
    );
  }

  return (
    <Section id="library-heading" title="Your library" numeral={2}>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Your library is one folder on this computer. BetterNotez saves lectures, notes, annotations, and tasks as ordinary
        files, so you can copy or back them up without the app. The folders are named by ID, and each PDF is saved as
        lecture.pdf, so use BetterNotez to find a lecture.
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

function AssistantSection({ desktop, folder }: { readonly desktop: boolean; readonly folder: string | undefined }) {
  if (!desktop) {
    return (
      <Section id="assistant-heading" title="Connect Claude" numeral={3}>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Connecting Claude needs the desktop app. Claude reads your library from a folder on your computer. The web app
          keeps its library in this browser, where Claude cannot reach it.{" "}
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
  const claudeCodeCommand = `claude mcp add betternotez -- node "${SERVER_PLACEHOLDER}" --library "${libraryPath}"`;

  return (
    <Section id="assistant-heading" title="Connect Claude" numeral={3}>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Claude can find a lecture by name, read its PDF text and your notes, and help you write notes or add text boxes
        and drawings to a PDF. Try asking about one of your lectures, such as &quot;Let's talk about Lecture 1 in Digital
        Systems.&quot; Setup takes three steps, and you do it once.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="font-serif text-2xl">What Claude can do</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Find and read subjects, lectures, notes, text boxes, and PDF text</li>
            <li>Create and edit subjects, lectures, notes, tasks, and timetable classes</li>
            <li>Add text boxes and drawings to PDF pages</li>
          </ul>
        </div>
        <div>
          <h3 className="font-serif text-2xl">What Claude can't do</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Delete anything. Deleting happens only in the app.</li>
            <li>Bring back a note's text after Claude replaces it. There is no trash or history.</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Text Claude reads, such as your notes and PDF text, goes to the AI service you use so it can answer you.
      </p>

      <ol className="mt-8 space-y-6">
        <Step number={1}>
          <p>
            Install{" "}
            <a href={NODE_URL} className="text-accent underline underline-offset-2">
              Node.js
            </a>{" "}
            22 or newer.
          </p>
          <p>
            Download <code className="text-foreground">betternotez-mcp.mjs</code> from the{" "}
            <a href={LATEST_RELEASE_URL} className="text-accent underline underline-offset-2">
              latest release
            </a>{" "}
            into a folder you will keep. Don't move it later, or Claude will lose the connection. Then copy its full path.
            On Windows, right-click the file and choose Copy as path. On a Mac, hold Option, right-click the file, and
            choose Copy as Pathname.
          </p>
        </Step>

        <Step number={2}>
          <p>
            Add BetterNotez to Claude. In each snippet below, replace /absolute/path/to/betternotez-mcp.mjs with the path
            you copied in step 1. On Windows, use forward slashes, such as C:/Users/you/Downloads/betternotez-mcp.mjs,
            because backslashes break the JSON.
          </p>
          <h3 className="mt-4 font-serif text-2xl">Claude Desktop</h3>
          <p className="mt-1 text-muted-foreground">
            In Claude Desktop, open Settings, then Developer, then Edit Config. If the file is new or empty, paste the
            whole snippet. If it already has settings, add the betternotez entry inside its mcpServers section and keep
            the rest.
          </p>
          <Copyable label="Claude Desktop config" value={claudeDesktopConfig} />
          <h3 className="mt-4 font-serif text-2xl">Claude Code (for terminal users)</h3>
          <p className="mt-1 text-muted-foreground">
            Open a terminal, paste this command, and press Enter. You only need to do this once.
          </p>
          <Copyable label="Claude Code command" value={claudeCodeCommand} />
        </Step>

        <Step number={3}>
          <p>
            Quit Claude Desktop completely, then open it again. Or start a new Claude Code session. Then ask Claude,
            &quot;List my BetterNotez subjects.&quot; If it lists your subjects, the connection works.
          </p>
        </Step>
      </ol>
    </Section>
  );
}

function AboutSection() {
  return (
    <Section id="about-heading" title="About" numeral={4}>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Version {pkg.version}. BetterNotez is free and open source under the AGPL-3.0 license.
      </p>
      <a href={REPOSITORY_URL} className="mt-3 inline-block text-sm text-accent underline underline-offset-4">
        View the code on GitHub
      </a>
    </Section>
  );
}

/** A numbered part of the page, set like a chapter: a roman numeral in the margin, then the title over a rule. */
function Section({
  id,
  title,
  numeral,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly numeral: number;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2">
      <span aria-hidden className="pt-2 font-serif text-xl text-faint italic">
        {romanNumeral(numeral)}.
      </span>
      <div className="min-w-0">
        <h2 id={id} className="border-b border-rule pb-4 text-[34px] leading-none">
          {title}
        </h2>
        <div className="mt-5 space-y-4">{children}</div>
      </div>
    </section>
  );
}

function Step({ number, children }: { readonly number: number; readonly children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden className="w-6 shrink-0 pt-0.5 font-serif text-2xl text-faint italic">
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
    toast.error(
      "The folder could not be opened. Copy the path below and paste it into your file manager.",
    );
  }
}
