import { invoke } from "@tauri-apps/api/core";
import { Copy, Flame, FolderOpen, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
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
const SERVER_DOWNLOAD_URL = `${RELEASES_URL}/latest/download/betternotez-mcp.mjs`;
const REPOSITORY_URL = "https://github.com/Timmyy3000/BetterNotez";
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
      <PageHeader title="Settings" description="Change how BetterNotez looks, find your library, and connect your AI." />

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
                "inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] [&_svg]:size-4",
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
      <Section id="assistant-heading" title="Connect your AI" numeral={3}>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Connecting your AI needs the desktop app. Your AI reads your library from a folder on your computer. The web app
          keeps its library in this browser, where your AI cannot reach it.{" "}
          <a href={RELEASES_URL} className="text-accent underline underline-offset-2">
            Download the desktop app
          </a>
          .
        </p>
      </Section>
    );
  }

  const libraryPath = folder ?? LIBRARY_PLACEHOLDER;

  return (
    <Section id="assistant-heading" title="Connect your AI" numeral={3}>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Claude or ChatGPT can find a lecture by name, read its PDF text and your notes, and help you write notes or add
        text boxes and drawings to a PDF. Try asking about one of your lectures, such as &quot;Let's talk about Lecture 1
        in Digital Systems.&quot;
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="font-serif text-2xl">What your AI can do</h3>
          <ul className="mt-2 list-none space-y-1.5 text-sm text-muted-foreground">
            <li className={LIST_ITEM}>Find and read subjects, lectures, notes, text boxes, and PDF text</li>
            <li className={LIST_ITEM}>Create and edit subjects, lectures, notes, tasks, and timetable classes</li>
            <li className={LIST_ITEM}>Add text boxes and drawings to PDF pages</li>
          </ul>
        </div>
        <div>
          <h3 className="font-serif text-2xl">What your AI can't do</h3>
          <ul className="mt-2 list-none space-y-1.5 text-sm text-muted-foreground">
            <li className={LIST_ITEM}>Delete anything. Deleting happens only in the app.</li>
            <li className={LIST_ITEM}>Bring back a note's text after it replaces it. There is no trash or history.</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Text your AI reads, such as your notes and PDF text, goes to the AI service you use so it can answer you.
      </p>

      <ol className="mt-8 space-y-6">
        <Step number={1}>
          <p>Copy the setup prompt for the app you use.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <CopyPromptButton label="Claude setup prompt" value={claudeSetupPrompt(libraryPath)}>
              Copy prompt for Claude
            </CopyPromptButton>
            <CopyPromptButton label="ChatGPT and Codex setup prompt" value={codexSetupPrompt(libraryPath)}>
              Copy prompt for ChatGPT or Codex
            </CopyPromptButton>
          </div>
        </Step>
        <Step number={2}>
          <p>Paste it into a new chat and send it. Your AI sets everything up and tells you when it's done.</p>
        </Step>
        <Step number={3}>
          <p>
            Quit the app completely, then open it again. Ask, &quot;List my BetterNotez subjects.&quot; If it lists your
            subjects, the connection works.
          </p>
        </Step>
      </ol>
    </Section>
  );
}

function CopyPromptButton({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly children: ReactNode;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("The prompt could not be copied. Try again.");
    }
  }

  return (
    <Button variant="primary" onClick={() => void copy()}>
      <Copy />
      {children}
    </Button>
  );
}

/** Shared steps: get Node, download the server to a fixed folder, then the app-specific registration. */
function setupPrompt(app: string, register: string, libraryPath: string): string {
  return `Please connect BetterNotez to ${app} so you can read and help with my notes. I'm not technical, so do every step yourself on my computer and only ask me if you're truly stuck.

1. Check that Node.js 22 or newer is installed (run \`node --version\`). If it isn't, install it for me (winget on Windows, Homebrew on Mac), or tell me exactly what to click.
2. Download ${SERVER_DOWNLOAD_URL} into a folder that won't be moved:
   - Windows: %LOCALAPPDATA%\\BetterNotez\\mcp\\
   - Mac and Linux: ~/.betternotez/mcp/
3. Register it as an MCP server named "betternotez" that runs:
   node "<full path of the downloaded file>" --library "${libraryPath}"
${register}
4. Read the config back and check it's valid. Then tell me to quit ${app} completely, open it again, and ask "List my BetterNotez subjects".`;
}

function claudeSetupPrompt(libraryPath: string): string {
  return setupPrompt(
    "Claude",
    `   Keep any settings that are already there.
   - Claude Desktop: add it under "mcpServers" in claude_desktop_config.json (Windows: %APPDATA%\\Claude\\, Mac: ~/Library/Application Support/Claude/). Use forward slashes in paths so the JSON stays valid.
   - Claude Code: run \`claude mcp add --scope user betternotez -- node "<file>" --library "${libraryPath}"\`.`,
    libraryPath,
  );
}

function codexSetupPrompt(libraryPath: string): string {
  return setupPrompt(
    "ChatGPT or Codex",
    `   ChatGPT desktop and Codex share one config file. Add a [mcp_servers.betternotez] entry to ~/.codex/config.toml (Windows: %USERPROFILE%\\.codex\\config.toml, or under CODEX_HOME if that is set), keeping everything already there. Use single-quoted TOML strings for Windows paths. If the codex command is available, \`codex mcp add betternotez -- node "<file>" --library "${libraryPath}"\` does the same.`,
    libraryPath,
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

/** A list item with a hanging en dash, in place of a disc bullet. */
const LIST_ITEM = "relative pl-5 before:absolute before:left-0 before:content-['–']";

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
