# BetterNotez

A free, open-source study app for lecture PDFs: organize by subject, annotate with text boxes and freehand ink, keep a notepad per lecture, plan your week, and track tasks. Any MCP-capable AI assistant can read and update your material, but cannot delete it.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run typecheck
npm test
npm run build
```

## Layout

- `packages/core`: domain types, storage interface, and library operations (`@betternotez/core`).
- `packages/mcp`: local MCP server that lets an AI assistant read and edit a library, without deleting (`@betternotez/mcp`).
- `apps/app`: the web and desktop shell (`@betternotez/app`). Run `npm run dev` to start it. `npm run test:e2e` builds it and runs the Playwright journeys in `apps/app/e2e`.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
