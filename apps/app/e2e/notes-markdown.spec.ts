/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function makePdf(pageTexts: readonly string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    pdf.addPage([420, 300]).drawText(text, { x: 40, y: 150, size: 18, font });
  }
  return Buffer.from(await pdf.save());
}

async function createSubject(page: Page, name: string): Promise<void> {
  await page.goto("/");
  const createFirst = page.getByRole("button", { name: "Create your first subject" });
  if (await createFirst.isVisible()) {
    await createFirst.click();
  } else {
    await page.getByRole("button", { name: "New subject" }).click();
  }
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Blue" }).click();
  await page.getByRole("button", { name: "Create subject" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function importLecture(page: Page, fileName: string, pageTexts: readonly string[]): Promise<void> {
  await page.getByRole("button", { name: "Import PDF" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: await makePdf(pageTexts),
  });
  await page.getByRole("button", { name: "Import 1 PDF" }).click();
  const shown = fileName.replace(/\.pdf$/, "");
  await expect(page.getByRole("link", { name: shown, exact: true })).toBeVisible();
}

async function openLecture(page: Page, title: string): Promise<void> {
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

function notesPanel(page: Page): Locator {
  return page.getByRole("complementary", { name: "Notes" });
}

function notesField(page: Page): Locator {
  return page.getByRole("textbox", { name: /^Notes for page \d+$/ });
}

/** The rendered note of the page in view. It is shown when the page has text and the source is not open. */
function renderedNote(page: Page): Locator {
  return notesPanel(page).locator("[data-rendered-note]");
}

function editButton(page: Page): Locator {
  return notesPanel(page).getByRole("button", { name: /^Edit notes for page \d+$/ });
}

/** The text of a file in the web library, found by its name. The test library holds one material. */
async function libraryFileText(page: Page, name: string): Promise<string | undefined> {
  return page.evaluate(async (fileName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("betternotez");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const key = keys.map(String).find((candidate) => candidate.endsWith(`/${fileName}`));
    const bytes = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      if (key === undefined) return resolve(undefined);
      const request = db.transaction("files").objectStore("files").get(key);
      request.onsuccess = () => resolve(request.result as Uint8Array | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
  }, name);
}

async function openNotes(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(notesField(page).or(renderedNote(page))).toBeVisible();
}

/** Leaves the field, which returns a page with text to its rendered note. */
async function leaveField(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function waitForSaved(page: Page): Promise<void> {
  await expect(notesPanel(page).getByText("Saved", { exact: true })).toBeVisible();
}

const SOURCE = [
  "# Sorting",
  "## Steps",
  "- compare",
  "  - by key",
  "- swap",
  "",
  "1. divide",
  "2. merge",
  "",
  "**Stable** sorts keep [the docs](https://example.com/sorting)",
  "equal items in order",
].join("\n");

test("headings, lists, bold, a link, and a line break in a paragraph render from Markdown", async ({ page }) => {
  await createSubject(page, "Algorithms");
  await importLecture(page, "Merge.pdf", ["Merge sort"]);
  await openLecture(page, "Merge");
  await openNotes(page);

  await notesField(page).fill(SOURCE);
  await waitForSaved(page);
  await leaveField(page);

  await expect(renderedNote(page).locator("h1")).toHaveText("Sorting");
  await expect(renderedNote(page).locator("h2")).toHaveText("Steps");
  await expect(renderedNote(page).locator("ul").first().locator("xpath=./li")).toHaveText(["compare by key", "swap"]);
  await expect(renderedNote(page).locator("ol li")).toHaveText(["divide", "merge"]);
  // A nested item starts one 28px line below its parent, with no empty line between them.
  const parent = await renderedNote(page).locator("ul > li").first().boundingBox();
  const nested = await renderedNote(page).locator("ul ul > li").first().boundingBox();
  expect((nested?.y ?? 0) - (parent?.y ?? 0)).toBe(28);
  await expect(renderedNote(page).locator("strong")).toHaveText("Stable");
  const link = renderedNote(page).getByRole("link", { name: "the docs" });
  await expect(link).toHaveAttribute("href", "https://example.com/sorting");
  await expect(link).toHaveAttribute("target", "_blank");

  // Two source lines in one paragraph sit on two 28px ruled lines.
  const paragraph = renderedNote(page).locator("p", { hasText: "equal items in order" });
  await expect.poll(() => paragraph.textContent()).toBe("Stable sorts keep the docs\nequal items in order");
  expect((await paragraph.boundingBox())?.height).toBe(56);
  // The paragraph follows the list after one 28px line, the same gap as between any two blocks.
  const list = await renderedNote(page).locator("ol").boundingBox();
  const after = await paragraph.boundingBox();
  expect((after?.y ?? 0) - ((list?.y ?? 0) + (list?.height ?? 0))).toBe(28);
});

test("a script tag and an image's onerror attribute show as text and never run", async ({ page }) => {
  await createSubject(page, "Security");
  await importLecture(page, "Tags.pdf", ["Tags"]);
  await openLecture(page, "Tags");
  await openNotes(page);

  await notesField(page).fill(
    '<script>alert(1)</script>\n\nInline <img src="x" onerror="window.__pwned = true"> here',
  );
  await waitForSaved(page);
  await leaveField(page);

  await expect(renderedNote(page)).toContainText('<script>alert(1)</script>');
  await expect(renderedNote(page)).toContainText('Inline <img src="x" onerror="window.__pwned = true"> here');
  expect(await notesPanel(page).locator("script, img").count()).toBe(0);
  expect(await page.evaluate(() => "__pwned" in window)).toBe(false);
});

test("an image in a note shows its alt text and fetches nothing, and an unsafe link shows no address", async ({
  page,
  baseURL,
}) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(`${baseURL}/`) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    external.push(url);
    return route.abort();
  });

  await createSubject(page, "Images");
  await importLecture(page, "Pictures.pdf", ["Picture"]);
  await openLecture(page, "Pictures");
  await openNotes(page);

  await notesField(page).fill(
    "![A diagram](https://example.invalid/p.png)\n\n![](https://example.invalid/q.png)\n\n[bad](javascript:alert(1))",
  );
  await waitForSaved(page);
  await leaveField(page);

  await expect(renderedNote(page).locator("span", { hasText: /^A diagram$/ })).toBeVisible();
  await expect(renderedNote(page).locator("span", { hasText: /^image$/ })).toBeVisible();
  await expect(renderedNote(page).locator("span", { hasText: /^bad$/ })).toBeVisible();
  expect(await notesPanel(page).locator("img, a").count()).toBe(0);
  expect(external.filter((url) => url.includes("example.invalid"))).toEqual([]);
});

test("a note is typed as Markdown, read rendered, edited again, and saved as its source", async ({ page }) => {
  await createSubject(page, "Round trip");
  await importLecture(page, "Trip.pdf", ["Trip"]);
  await openLecture(page, "Trip");
  await openNotes(page);

  await notesField(page).fill(SOURCE);
  await waitForSaved(page);
  await leaveField(page);
  await expect(renderedNote(page).locator("h1")).toHaveText("Sorting");

  await editButton(page).click();
  await expect(notesField(page)).toHaveValue(SOURCE);
  // The caret starts at the end, so typing continues the note.
  await page.keyboard.type("\n\nWritten after Edit");
  await waitForSaved(page);
  await leaveField(page);
  await expect(renderedNote(page)).toContainText("Written after Edit");

  expect(JSON.parse((await libraryFileText(page, "notes.json")) ?? "null")).toEqual({
    version: 1,
    pages: { "1": `${SOURCE}\n\nWritten after Edit` },
  });
});

test("Enter on the Edit button opens the source and types no line break", async ({ page }) => {
  await createSubject(page, "Keyboard");
  await importLecture(page, "Keys.pdf", ["Keys"]);
  await openLecture(page, "Keys");
  await openNotes(page);

  await notesField(page).fill("One line");
  await waitForSaved(page);
  await leaveField(page);

  await editButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(notesField(page)).toBeFocused();
  await expect(notesField(page)).toHaveValue("One line");
});

test("Backspace after a click on a rendered note leaves the selected text box alone", async ({ page }) => {
  await createSubject(page, "Annotated");
  await importLecture(page, "Boxes.pdf", ["Boxes"]);
  await openLecture(page, "Boxes");

  await page.getByRole("button", { name: "Text box", exact: true }).click();
  const pageBox = await page.locator('[data-page-number="1"]').boundingBox();
  if (pageBox === null) throw new Error("page 1 is not on screen");
  await page.mouse.click(pageBox.x + pageBox.width * 0.3, pageBox.y + pageBox.height * 0.6);
  await page.keyboard.type("Keep me");
  await page.getByRole("button", { name: "Select and move" }).click();
  await page.locator('[data-page-number="1"] [data-kind="text"]').click();
  await page.keyboard.press("Escape");

  await openNotes(page);
  await notesField(page).fill("Read me");
  await waitForSaved(page);
  await leaveField(page);
  await renderedNote(page).locator("p").click();
  await page.keyboard.press("Backspace");

  await expect(page.locator('[data-page-number="1"] [data-kind="text"]')).toHaveCount(1);
});
