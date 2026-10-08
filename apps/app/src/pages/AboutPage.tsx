import { Bot, Check, Copy, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { isDesktop } from "../lib/platform";
import { libraryFolder } from "../storage";
import { IconButton } from "../ui/tooltip";

const RELEASES_URL = "https://github.com/Timmyy3000/BetterNotez/releases";
const SERVER_PLACEHOLDER = "/absolute/path/to/BetterNotez/packages/mcp/dist/index.js";

export function AboutPage() {
  const desktop = isDesktop();
  const [folder, setFolder] = useState<string>();

  useEffect(() => {
    if (desktop) void libraryFolder().then(setFolder);
  }, [desktop]);

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        betternotez: {
          command: "node",
          args: [SERVER_PLACEHOLDER, "--library", folder ?? "/absolute/path/to/BetterNotez Library"],
        },
      },
    },
    null,
    2,
  );
  const claudeCodeCommand = `claude mcp add betternotez -- node ${SERVER_PLACEHOLDER} --library "${folder ?? "/absolute/path/to/BetterNotez Library"}"`;

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">About &amp; AI</h1>
        <p className="mt-1 text-sm text-muted-foreground">Where your library lives, and how an AI assistant can use it.</p>
      </header>

      <section aria-labelledby="library-heading" className="mt-10 max-w-3xl">
        <h2 id="library-heading" className="flex items-center gap-2 text-lg font-semibold">
          <FolderOpen className="size-5 text-accent" />
          Your library
        </h2>
        {desktop ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              BetterNotez keeps everything in one folder on this computer. Subjects, lecture PDFs, notes, and
              annotations are plain files, so you can open or back up the folder without the app.
            </p>
            {folder !== undefined && <Copyable label="Library folder" value={folder} />}
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This web app keeps your library in this browser. Install the desktop app to keep it in a folder on your
            computer, where an AI assistant can reach it.
          </p>
        )}
      </section>

      <section aria-labelledby="ai-heading" className="mt-10 max-w-3xl">
        <h2 id="ai-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Bot className="size-5 text-accent" />
          Connect an AI assistant
        </h2>
        {desktop ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              BetterNotez runs a local MCP server that reads and edits your library. It works with Claude Desktop and
              Claude Code. The assistant can create and change anything, but it cannot delete. Deleting is only
              possible in the app.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The server runs from a BetterNotez source checkout. Run <code className="text-foreground">npm install</code>{" "}
              and <code className="text-foreground">npm run build</code> once, then replace the placeholder path below
              with the path to <code className="text-foreground">packages/mcp/dist/index.js</code>.
            </p>

            <h3 className="mt-6 text-sm font-medium">Claude Desktop</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add this to <code className="text-foreground">claude_desktop_config.json</code>, then restart Claude Desktop.
            </p>
            <Copyable label="Claude Desktop config" value={claudeDesktopConfig} />

            <h3 className="mt-6 text-sm font-medium">Claude Code</h3>
            <p className="mt-1 text-sm text-muted-foreground">Run this once in a terminal.</p>
            <Copyable label="Claude Code command" value={claudeCodeCommand} />
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            An AI assistant connects through a local MCP server that reads the library folder on your computer. That
            needs the desktop app, which runs in the same place as the folder.{" "}
            <a href={RELEASES_URL} className="text-accent underline underline-offset-2">
              Download the desktop app
            </a>
            .
          </p>
        )}
      </section>
    </>
  );
}

function Copyable({ label, value }: { readonly label: string; readonly value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      toast.success(`${label} copied`);
    } catch {
      toast.error("The text could not be copied. Select it and copy it by hand.");
    }
  }

  return (
    <div className="relative mt-3">
      <pre className="rounded-xl border border-border bg-muted p-4 pr-14 text-sm leading-relaxed break-all whitespace-pre-wrap">
        <code>{value}</code>
      </pre>
      <div className="absolute top-2 right-2">
        <IconButton label={`Copy ${label.toLowerCase()}`} onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
        </IconButton>
      </div>
    </div>
  );
}
