# @betternotez/mcp

A local MCP server that lets an AI assistant read and update a BetterNotez library: subjects, lectures, PDF text, notepads, annotations, tasks, and the weekly planner.

The assistant can create and edit everything. It cannot delete anything. Deletes happen only in the app.

## Run it

Requires Node.js 22 or newer.

```sh
npm install
npm run build
node packages/mcp/dist/index.js --library "/path/to/BetterNotez Library"
```

The server talks over stdio, so running it by hand only shows that it starts. Connect it to an assistant using one of the snippets below.

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
      "args": [
        "/absolute/path/to/BetterNotez/packages/mcp/dist/index.js",
        "--library",
        "/absolute/path/to/BetterNotez Library"
      ]
    }
  }
}
```

## Connect Claude Code

```sh
claude mcp add betternotez -- node /absolute/path/to/BetterNotez/packages/mcp/dist/index.js --library "/absolute/path/to/BetterNotez Library"
```

## Tools

Coordinates on a page are normalized from 0 to 1, with the origin at the top-left corner. Dates are `YYYY-MM-DD`. Times are 24-hour `HH:MM`. Pages are 1-based.

| Tool | Purpose |
| --- | --- |
| `list_subjects` | List subjects. |
| `create_subject` | Create a subject with `name` and optional `color`. |
| `update_subject` | Change `subjectId` with optional `name` or `color`. |
| `list_lectures` | List lectures, optionally for one `subjectId`. |
| `find_lecture` | Rank lectures for a phrase such as "Lecture 1 in Digital Systems". |
| `get_lecture` | Return a lecture with its notes, annotations, and whether its PDF text is cached. |
| `get_lecture_text` | Return PDF text per page, with optional `fromPage` and `toPage`. |
| `update_lecture` | Change `title` or `date`. Pass `date: null` to clear it. |
| `update_notes` | Set `text` with `mode` `append` (default) or `replace`. |
| `add_text_box` | Add a text box to `page` at `x`, `y`, with `text` and optional size and color. |
| `add_ink` | Add a freehand stroke from `points` (`[x, y]` or `[x, y, pressure]`). |
| `update_annotation` | Change a text box or stroke by `annotationId`, sending only the fields that apply to it. |
| `list_tasks` | List tasks in board order, optionally for one `status`. |
| `create_task` | Create a task with `title`, optional `status`, `subjectId`, `lectureId`, and `due`. |
| `update_task` | Edit a task by `taskId`. Set `status` to move it between columns. |
| `list_planner` | List the weekly timetable cards. |
| `create_planner_card` | Add a subject card for `day` (0 is Monday), `start`, and `end`. |
| `update_planner_card` | Move or edit a card by `cardId`. |
| `search` | Search subject names, lecture titles, notepads, text boxes, and PDF text. |

Every annotation the assistant creates has author `ai`. Annotations the student made keep their author when the assistant edits them.

## Notes

- The assistant cannot delete. A delete request gets an error result that says the tool is not found.
- Tool calls run one at a time, so overlapping requests cannot drop each other's writes.
- PDF text is only available after the student opens the lecture once in the app. Until then, `get_lecture_text` says so.
- The app and this server both write the same folder. Writes are atomic per file, but the server does not lock against the app.
