import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteText } from "./NoteText";

function render(text: string): string {
  return renderToStaticMarkup(createElement(NoteText, { text }));
}

/** The web app has no Tauri internals on window. */
function onWeb(): void {
  vi.stubGlobal("window", {});
}

function onDesktop(): void {
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NoteText", () => {
  it("renders headings, lists, bold text, and tables from Markdown", () => {
    onWeb();
    expect(render("# Sorting")).toBe('<div class="notes-markdown"><h1>Sorting</h1></div>');
    expect(render("- one\n- two")).toBe('<div class="notes-markdown"><ul>\n<li>one</li>\n<li>two</li>\n</ul></div>');
    expect(render("1. first\n2. second")).toBe(
      '<div class="notes-markdown"><ol>\n<li>first</li>\n<li>second</li>\n</ol></div>',
    );
    expect(render("**bold**")).toBe('<div class="notes-markdown"><p><strong>bold</strong></p></div>');
    expect(render("| a | b |\n| - | - |\n| 1 | 2 |")).toBe(
      '<div class="notes-markdown"><div class="overflow-x-auto"><table><thead><tr><th>a</th><th>b</th></tr></thead>' +
        "<tbody><tr><td>1</td><td>2</td></tr></tbody></table></div></div>",
    );
  });

  it("keeps a single line break inside a paragraph", () => {
    onWeb();
    expect(render("Two lines\nin one paragraph")).toBe(
      '<div class="notes-markdown"><p>Two lines\nin one paragraph</p></div>',
    );
  });

  it("opens a web link in a new tab without giving it the app window", () => {
    onWeb();
    expect(render("[docs](https://example.com/a)")).toBe(
      '<div class="notes-markdown"><p><a href="https://example.com/a" target="_blank" rel="noopener noreferrer">docs</a></p></div>',
    );
  });

  it("shows a link as its text on the desktop, where the window must not navigate", () => {
    onDesktop();
    expect(render("[docs](https://example.com/a)")).toBe('<div class="notes-markdown"><p><span>docs</span></p></div>');
  });

  it("shows a link with an unsafe address as its text, with no address", () => {
    onWeb();
    expect(render("[bad](javascript:alert(1))")).toBe('<div class="notes-markdown"><p><span>bad</span></p></div>');
  });

  it("shows an image as its alt text, or as 'image' without alt text, and never as an img element", () => {
    onWeb();
    expect(render("![x](https://example.invalid/p.png)")).toBe('<div class="notes-markdown"><p><span>x</span></p></div>');
    expect(render("![](https://example.invalid/p.png)")).toBe(
      '<div class="notes-markdown"><p><span>image</span></p></div>',
    );
  });

  it("shows raw HTML as text, not as elements", () => {
    onWeb();
    expect(render("<script>alert(1)</script>")).toBe('<div class="notes-markdown">&lt;script&gt;alert(1)&lt;/script&gt;</div>');
    expect(render('say <img src="x" onerror="alert(1)"> now')).toBe(
      '<div class="notes-markdown"><p>say &lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt; now</p></div>',
    );
  });

  it("renders task-list checkboxes disabled, so they cannot rewrite the note", () => {
    onWeb();
    expect(render("- [x] done\n- [ ] open")).toBe(
      '<div class="notes-markdown"><ul class="contains-task-list">\n' +
        '<li class="task-list-item"><input type="checkbox" disabled="" checked=""/> done</li>\n' +
        '<li class="task-list-item"><input type="checkbox" disabled=""/> open</li>\n' +
        "</ul></div>",
    );
  });
});
