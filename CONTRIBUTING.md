# Contributing to BetterNotez

Thanks for helping. BetterNotez is small on purpose, so the best changes are focused, tested, and easy to read.

## Before you start

- Open an issue for a new feature or a large change, so we can agree on the approach first.
- Keep pull requests to one change. A bug fix does not need surrounding cleanup.
- The library folder is a public format. Changing how files are written needs a note in the pull request and, when it breaks old libraries, a migration.

## Setup

```sh
npm install
npm run dev
```

Node.js 22 or newer is required. The desktop app also needs Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Checks

Run these before you push. CI runs the same checks.

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`desktop-check` in CI also runs `cargo check` in `apps/app/src-tauri`. If you change Rust code or `tauri.conf.json`, run `cargo check` there yourself.

## Guidelines

- **Test behavior.** Call code the way a user or another package would, and assert on the result. A test that would still pass if the code returned nothing is not useful.
- **Keep the AI boundary.** The MCP server must never gain a delete tool. Deletion stays in the app.
- **Keep the web and desktop apps on one UI.** Platform differences belong behind small helpers such as `isDesktop()` in `apps/app/src/lib/platform.ts`, not in page code.
- **Write comments for the why.** Comments should explain a constraint the code cannot show. They should not describe the change you are making.
- **Match the surrounding code.** Follow the naming, structure, and comment density of the file you are editing.

## Pull requests

- Describe what changes for a student or an assistant, and why.
- Include a screenshot for visible UI changes. Put it in `docs/screenshots/` only if it belongs in the README.
- Say which checks you ran.

## License

By contributing, you agree that your contribution is licensed under AGPL-3.0-only, the same as the rest of the project.
