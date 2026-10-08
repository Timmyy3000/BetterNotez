# BetterNotes

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

- `packages/core`: domain types, storage interface, and library operations (`@betternotes/core`).

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
