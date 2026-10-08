# BetterNotes MVP

## Status

- Status: Ready for Plan
- Product owner: Founder
- Created: 2026-10-08
- Last updated: 2026-10-08
- Template source: grill-to-spec bundled fallback (no repository template yet; promote to repo template if adopted)
- Product-owner confirmation: yes, 2026-10-08

## Problem

Students keep lecture PDFs from many classes and want one simple place to organize them by subject, write and draw on them, keep notes per lecture, and study them with AI. Goodnotes does this well but gates essentials behind a subscription (Free: 3 notebooks, 3 folders, 5MB imports, 5 AI questions/month). No free tool combines all of it in one simple app.

## Desired outcome

A free, fully open-source, Goodnotes-style study app with a sleek, minimalist, rounded UI. Students manage a semester's lecture material in it, and any MCP-capable AI assistant (e.g. Claude) can read and update that material.

## Users and actors

- **Student** - primary user; organizes, annotates, plans.
- **External AI assistant** (via MCP, e.g. Claude) - reads and updates the student's content on their behalf.

## User journeys

1. As a student, I create a folder per subject and add lecture PDFs, optionally tagging each with a lecture date.
2. As a student, I open a lecture PDF and write, type, draw diagrams, and add notes on its pages.
3. As a student, I keep a notepad attached to each lecture.
4. As a student, I connect Claude and say "Let's talk about Lecture 1 in Digital Systems in BetterNotes"; it reads that lecture and can update my content.
5. As a student, I lay out my weekly timetable by adding subject cards to a calendar-like planner.
6. As a student, I track study tasks on a simple task board.

## Requirements

- **REQ-001 Folders:** Subject folders containing lecture PDFs; optional date tag per lecture.
- **REQ-002 PDF annotation:** View PDFs with two annotation types on pages:
  - **Text boxes** - placed and typed with a keyboard; the primary mode for everyone.
  - **Freehand drawing** - ink for sketches and diagrams with a stylus or touch on touchscreen devices (mouse also works).
- **REQ-003 Lecture notepad:** One notepad per lecture, linked to it.
- **REQ-004 MCP:** A local MCP server with full access: an AI can read, create, and edit subjects, lectures, notepads, planner cards, and tasks. It can also read PDF text and add and edit PDF annotations, including text boxes and freehand drawings. **The AI cannot delete anything**; only the student can delete in the app.
- **REQ-005 Planner:** Simple weekly timetable; user adds subject cards to time slots. Nothing more.
- **REQ-006 Task board:** Kanban with fixed columns To do / Doing / Done. Each task has a title and can optionally link to a subject, a lecture, and a due date.
- **REQ-007 Platforms:** One shared UI published as desktop (Windows, macOS) and web.
- **REQ-008 Local-only:** All data stored locally; no account required.
- **REQ-010 Search:** Search across subject names, lecture titles, notepads, text boxes, and PDF text.
- **REQ-011 Export:** Export a lecture as a PDF with its annotations included.
- **REQ-012 Open data:** Student data is stored in an open, human-readable folder on the device, usable without the app.
- **REQ-009 Design:** Sleek, minimalist, rounded, icon-led UI.

## States, edge cases, and failure behavior

- **Empty states:** First launch, an empty subject, a lecture with no annotations, an empty planner, and an empty board each show a clear prompt for the next action.
- **Lecture date:** Optional. Lectures without a date are still listed and searchable.
- **Import failure:** A corrupt, password-protected, or non-PDF file is rejected with a clear message. Existing content is unaffected.
- **Large PDFs:** Lecture slide decks of typical size (tens of MB, 100+ pages) open and remain usable.
- **Deletion:** Only the student can delete. Deleting a subject or lecture asks for confirmation and states what will be removed.
- **MCP:** Delete requests from an AI are refused with a clear message. An AI request that targets something missing returns an understandable error. Changes made by an AI appear in the app without a restart.
- **Undo:** Edits in the app, including annotations, can be undone during the session.
- **Web vs desktop:** Where the web build cannot provide a capability (for example, a local MCP connection or a plain on-disk folder), it states this rather than failing silently.

## Acceptance criteria

- **AC-001:** A student can create a subject, import a lecture PDF into it, and optionally set a date for the lecture.
- **AC-002:** On a lecture PDF, a student can add, move, edit, and delete a text box, and can draw freehand with a mouse, touch, or stylus. Annotations persist after the app restarts.
- **AC-003:** Each lecture has a notepad that persists and opens from the lecture.
- **AC-004:** From Claude connected over MCP, "Let's talk about Lecture 1 in Digital Systems" lets Claude find that lecture and read its PDF text, notepad, and annotations.
- **AC-005:** Through MCP, Claude can create and edit subjects, lectures, notepads, tasks, and planner cards, and can add a text box and a drawing to a PDF page. All of these changes are visible in the app.
- **AC-006:** Through MCP, every delete attempt is refused.
- **AC-007:** A student can build a weekly timetable by adding subject cards to day/time slots.
- **AC-008:** A student can create tasks and move them between To do, Doing, and Done. A task can link to a subject, a lecture, and a due date.
- **AC-009:** Search returns matches from subject names, lecture titles, notepads, text boxes, and PDF text.
- **AC-010:** Exporting a lecture produces a PDF that shows its annotations in any standard PDF viewer.
- **AC-011:** The student's data is readable in a folder on disk without the app.
- **AC-012:** The same UI runs as a web app and as desktop apps for Windows and macOS. No account or network connection is required for local use.
- **AC-013:** The source is public under AGPL-3.0 at the first release.

## Scope

### In scope

- Folders, PDF annotation, lecture notepad, MCP, planner, task board.

### Out of scope

- In-app AI chat (AI is MCP-only; avoids API key handling).
- Accounts, sign-up, hosting, cross-device sync (MVP).
- Planner features beyond a simple timetable.
- Trash and version history.
- AI deletion through MCP.
- Handwriting recognition and advanced pen polish.
- Native iOS and Android apps.
- Collaboration and sharing.

## Constraints and dependencies

- Fully open source from day one under **AGPL-3.0**.
- Same UI across desktop and web.
- Data model and storage must not block a future hosted, sync-enabled offering.

## Product decisions

- Build instead of adopting Goodnotes: the user wants it free and open.
- AI is exposed only through MCP.
- Planner = timetable of subject cards, calendar-like.
- Two annotation types: text boxes (keyboard-first) and freehand drawing (stylus/touch). Advanced handwriting polish is not an MVP goal.
- MCP can read, create, and edit everything, including PDF annotation and drawing, so Claude can work on the PDF alongside the student. MCP has no delete actions; this replaces a Trash for the MVP.
- No Trash in the MVP.
- License: AGPL-3.0, so hosted forks must publish their changes. This protects the future hosted offering.
- No lock-in: search, annotated PDF export, and open on-disk storage are in the MVP.
- Task board = Kanban (To do / Doing / Done), not per-subject checklists.

## Risks and assumptions

### Risks

- PDF annotation quality (ink, stylus) is the hardest part and decides whether the product works.
- An AI can still overwrite student work through edits (e.g., rewriting a notepad); there is no Trash or version history to recover it.
- Web builds have limited local file and MCP access compared to desktop.

### Assumptions

- Students bring their own MCP-capable AI client (e.g., Claude). BetterNotes provides no AI model or API keys.
- Desktop is the main target for MCP and local storage. The web build may have reduced capability.

## Open questions

None.


## Success measures

- The founder uses BetterNotes for a full semester instead of Goodnotes.
- A new user can go from first launch to an annotated lecture in under 2 minutes.
- Claude completes the journey "talk about Lecture N in Subject X" without manual file handling.

## Handoff

- Ready for plan: yes
- Accepted risks: AI can overwrite work via edits (no Trash or version history); web build has reduced capability
- Deferred questions: none
- Next step: kickoff planning
