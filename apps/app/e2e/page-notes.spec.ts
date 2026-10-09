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

function notesHeading(page: Page): Locator {
  return notesPanel(page).getByRole("heading", { name: "Notes" });
}

function notesField(page: Page): Locator {
  return page.getByRole("textbox", { name: "Material notes" });
}

function notesStatus(page: Page): Locator {
  return page.getByRole("status");
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
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(notesField(page)).toBeEnabled();
}

async function writeNote(page: Page, text: string): Promise<void> {
  await notesField(page).fill(text);
  await expect(notesStatus(page)).toHaveText("Saved");
}

/** Scrolls the PDF with the mouse wheel until the notes header names the page, as a reader would. */
async function scrollToPage(page: Page, number: number): Promise<void> {
  const column = await page.locator(".desk").boundingBox();
  if (column === null) throw new Error("the PDF column is not on screen");
  await page.mouse.move(column.x + column.width / 2, column.y + column.height / 2);
  await expect
    .poll(
      async () => {
        const current = Number((await notesHeading(page).textContent())?.match(/Page (\d+)/)?.[1] ?? 1);
        if (current !== number) await page.mouse.wheel(0, Math.sign(number - current) * 100);
        return current;
      },
      { timeout: 15_000 },
    )
    .toBe(number);
}

test("each page has its own note, and the panel shows the page in view", async ({ page }) => {
  await createSubject(page, "Algorithms");
  await importLecture(page, "Sorting.pdf", ["Bubble sort", "Merge sort", "Quick sort"]);
  await openLecture(page, "Sorting");
  await openNotes(page);

  await expect(notesHeading(page)).toContainText("Page 1");
  await writeNote(page, "Compare adjacent items");
  await expect(page.locator('[data-page-number="1"] [data-has-note]')).toHaveCount(1);

  await scrollToPage(page, 2);
  await expect(notesHeading(page)).toContainText("Page 2");
  await expect(notesField(page)).toHaveValue("");
  await expect(page.locator('[data-page-number="2"] [data-has-note]')).toHaveCount(0);
  await writeNote(page, "Divide, then merge");

  await scrollToPage(page, 1);
  await expect(notesField(page)).toHaveValue("Compare adjacent items");

  await page.reload();
  await openNotes(page);
  await expect(notesField(page)).toHaveValue("Compare adjacent items");
  await scrollToPage(page, 2);
  await expect(notesField(page)).toHaveValue("Divide, then merge");

  expect(JSON.parse((await libraryFileText(page, "notes.json")) ?? "null")).toEqual({
    version: 1,
    pages: { "1": "Compare adjacent items", "2": "Divide, then merge" },
  });
});

test("turning the page saves the note being typed, before the pause ends", async ({ page }) => {
  await createSubject(page, "Chemistry");
  await importLecture(page, "Bonds.pdf", ["Ionic", "Covalent"]);
  await openLecture(page, "Bonds");
  await openNotes(page);

  await notesField(page).fill("Typed just before turning");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(notesHeading(page)).toContainText("Page 2");
  await expect(notesField(page)).toHaveValue("");

  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(notesField(page)).toHaveValue("Typed just before turning");
  await expect(notesStatus(page)).toHaveText("Saved");

  await page.reload();
  await openNotes(page);
  await expect(notesField(page)).toHaveValue("Typed just before turning");
});

test("a material with a note from before per-page notes shows it on page 1", async ({ page }) => {
  await createSubject(page, "History");
  await importLecture(page, "Empires.pdf", ["Rome", "Byzantium"]);
  await openLecture(page, "Empires");

  // The previous version kept one notes.md for the whole material and had no notes.json.
  await page.evaluate(async () => {
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
    const lectureFile = keys.map(String).find((key) => key.endsWith("/lecture.json"));
    if (lectureFile === undefined) throw new Error("the material is not in the library");
    const dir = lectureFile.replace(/\/lecture\.json$/, "");
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("files", "readwrite");
      transaction.objectStore("files").put(new TextEncoder().encode("Old single note"), `${dir}/notes.md`);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });

  await page.reload();
  await openNotes(page);
  await expect(notesHeading(page)).toContainText("Page 1");
  await expect(notesField(page)).toHaveValue("Old single note");

  await scrollToPage(page, 2);
  await expect(notesField(page)).toHaveValue("");
  await writeNote(page, "Second page note");

  expect(await libraryFileText(page, "notes.md")).toBe("Old single note");
  expect(JSON.parse((await libraryFileText(page, "notes.json")) ?? "null")).toEqual({
    version: 1,
    pages: { "1": "Old single note", "2": "Second page note" },
  });
});

test("a search hit on a page's note opens the material on that page with its note", async ({ page }) => {
  await createSubject(page, "Physics");
  await importLecture(page, "Optics.pdf", ["Lenses", "Mirrors"]);
  await openLecture(page, "Optics");
  await openNotes(page);
  await scrollToPage(page, 2);
  await writeNote(page, "Concave mirrors focus light");

  await page.getByRole("complementary").getByRole("link", { name: "Search" }).click();
  await page.getByRole("searchbox", { name: "Search" }).fill("concave");
  await page.getByRole("link", { name: /Page 2/ }).click();

  await expect(page.getByRole("heading", { name: "Optics", exact: true })).toBeVisible();
  await expect(notesHeading(page)).toContainText("Page 2");
  await expect(notesField(page)).toHaveValue("Concave mirrors focus light");
});
