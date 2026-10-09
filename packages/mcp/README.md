# @betternotez/mcp

A local MCP server that lets an AI assistant read and update a BetterNotez library: subjects, lectures, PDF text, notepads, annotations, tasks, and the weekly planner.

The assistant can create and edit everything. It cannot delete anything. Deletes happen only in the app.

## Install it

Download `betternotez-mcp.mjs` from the [latest release](https://github.com/Timmyy3000/BetterNotez/releases/latest) into a folder you will keep. It is one self-contained file, so there is nothing to install beside it. It needs Node.js 22 or newer.

```sh
node /path/to/betternotez-mcp.mjs --library "/path/to/BetterNotez Library"
```

The server talks over stdio, so running it by hand only shows that it starts. Connect it to an assistant using one of the snippets below.

## Build from source

For contributors. Requires Node.js 22 or newer.

```sh
npm install
npm run build         # compiled modules in dist/
npm run bundle        # single file, dist/betternotez-mcp.mjs, the same file as the release
npm run test:bundle   # runs that file alone, in a folder with no node_modules
node dist/index.js --library "/path/to/BetterNotez Library"
```

### Choosing the library folder

The server picks the first of these that is set:

1. The `--library <path>` argument.
2. The `BETTERNOTEZ_LIBRARY` environment variable.
3. `BetterNotez Library` in your home folder.

Use the same folder as the app. The server creates the folder and its `library.json` on first start if they are missing.

## Connect Claude Desktop

Add this to `claude_desktop_config.json`, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "betternotez": {
      "command": "node",
      "args": ["/absolute/path/to/betternotez-mcp.mjs"]
    }
  }
}
```

## Connect Claude Code

```sh
claude mcp add betternotez -- node /absolute/path/to/betternotez-mcp.mjs
```

From a source checkout, use `packages/mcp/dist/index.js` in place of `betternotez-mcp.mjs`.

## Tools

Coordinates on a page are normalized from 0 to 1, with the origin at the top-left corner. Dates are `YYYY-MM-DD`. Times are 24-hour `HH:MM`. Pages are 1-based.

| Tool | Purpose |
| --- | --- |
| `list_subjects` | List subjects. |
| `create_subject` | Create a subject with `name` and optional `color`. |
| `update_subject` | Change `subjectId` with optional `name` or `color`. |
| `list_lectures` | List material, optionally for one `subjectId`. |
| `import_lecture` | Import a PDF from an absolute `pdfPath` on the student's computer into `subjectId`. Copies the PDF into the library and caches its text. Takes optional `title` (defaults to the file name) and `date`. |
| `find_lecture` | Rank material for a phrase such as "Lecture 1 in [subject name]". |
| `get_lecture` | Return one piece of material with its notes, annotations, and whether its PDF text is cached. |
| `get_lecture_text` | Return PDF text per page, with optional `fromPage` and `toPage`. |
| `update_lecture` | Change `title` or `date`. Pass `date: null` to clear it. |
| `update_notes` | Set `text` with `mode` `append` (default) or `replace`. |
| `add_text_box` | Add a text box to `page` at `x`, `y`, with `text` and optional size and color. |
| `add_ink` | Add a freehand stroke from `points` (`[x, y]` or `[x, y, pressure]`). |
| `add_highlight` | Highlight `text` on `page`, found exactly as it reads on the page. Takes optional `occurrence` when the text appears more than once, and `color`: `yellow` (the default), `green`, `pink`, `blue`, or `orange`. |
| `update_annotation` | Change a text box or stroke by `annotationId`, sending only the fields that apply to it. Highlights are changed in the app. |
| `list_tasks` | List tasks in board order, optionally for one `status`. |
| `create_task` | Create a task with `title`, optional `status`, `subjectId`, `lectureId`, and `due`. |
| `update_task` | Edit a task by `taskId`. Set `status` to move it between columns. |
| `list_planner` | List the weekly timetable cards. |
| `create_planner_card` | Add a subject card for `day` (0 is Monday), `start`, and `end`. |
| `update_planner_card` | Move or edit a card by `cardId`. |
| `search` | Search subject names, material titles, notepads, text boxes, and PDF text. |
| `request_deletion` | Explain to the student how to delete something in the app. Nothing is deleted. Takes `what`. |

Every annotation the assistant creates has author `ai`. Annotations the student made keep their author when the assistant edits them.

## Notes

- The assistant cannot delete. Calling a tool named `delete_*` or `remove_*` gets an error result that says the tool is not found. For a deletion request, `request_deletion` replies that nothing was deleted and that the student can delete it in the app.
- `import_lecture` cannot read password-protected or corrupt PDFs. It says why and imports nothing.
- Tool calls run one at a time, so overlapping requests cannot drop each other's writes.
- PDF text is cached when a lecture is imported with `import_lecture`, or when the student opens it in the app. Until then, `get_lecture_text` says so.
- The app and this server both write the same folder. Writes are atomic per file, but the server does not lock against the app.
