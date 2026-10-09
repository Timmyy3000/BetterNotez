import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, StandardFonts } from "pdf-lib";

const SHOTS = "/tmp/bn-shots";

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
  // The list shows the title with an en dash. The file name keeps its hyphen.
  const shown = fileName.replace(/\.pdf$/, "").replace(" - ", " – ");
  await expect(page.getByRole("link", { name: shown, exact: true })).toBeVisible();
}

async function openLecture(page: Page, title: string): Promise<void> {
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

/** Drags the mouse through points given as fractions of the page, so the stroke lands the same on any size. */
async function drag(page: Page, pageLocator: Locator, points: readonly (readonly [number, number])[]): Promise<void> {
  await pageLocator.scrollIntoViewIfNeeded();
  const box = await pageLocator.boundingBox();
  if (box === null) throw new Error("page is not on screen");
  const at = ([u, v]: readonly [number, number]) => ({ x: box.x + u * box.width, y: box.y + v * box.height });
  const [start, ...rest] = points.map(at);
  if (start === undefined) throw new Error("no points");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of rest) {
    await page.mouse.move(point.x, point.y, { steps: 8 });
  }
  await page.mouse.up();
}

test("text box, pen stroke, notes, and export survive a reload, and undo works", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await createSubject(page, "Digital Systems");
  await importLecture(page, "Lecture 1 - Logic gates.pdf", ["Boolean algebra", "Karnaugh maps", "Timing diagrams"]);
  await openLecture(page, "Lecture 1 – Logic gates");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await expect(page.locator('[data-page-number="1"] canvas')).toBeAttached();

  const pageOne = page.locator('[data-page-number="1"]');
  const pageTwo = page.locator('[data-page-number="2"]');

  await page.getByRole("button", { name: "Text box", exact: true }).click();
  const box = await pageOne.boundingBox();
  if (box === null) throw new Error("page 1 is not on screen");
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await expect(page.getByRole("textbox", { name: "Text box" })).toBeFocused();
  await page.keyboard.type("Hello lecture");

  await page.getByRole("button", { name: "Pen" }).click();
  await drag(page, pageTwo, [
    [0.2, 0.2],
    [0.5, 0.25],
    [0.7, 0.5],
  ]);
  await expect(pageTwo.locator('[data-kind="ink"]')).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/lecture-annotated.png`, animations: "disabled" });

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveValue("Hello lecture");
  await expect(page.locator('[data-page-number="2"] [data-kind="ink"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Pen" }).click();
  await drag(page, page.locator('[data-page-number="2"]'), [
    [0.1, 0.8],
    [0.9, 0.8],
  ]);
  await expect(page.locator('[data-page-number="2"] [data-kind="ink"]')).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-page-number="2"] [data-kind="ink"]')).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator('[data-page-number="2"] [data-kind="ink"]')).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-page-number="2"] [data-kind="ink"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Notes" }).click();
  await page.getByRole("textbox", { name: "Lecture notes" }).fill("Remember the truth table");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByRole("textbox", { name: "Lecture notes" })).toHaveValue("Remember the truth table");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Lecture 1 - Logic gates.pdf");
  const exported = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(await download.path())) }).promise;
  expect(exported.numPages).toBe(3);
  const pageOneText = (await (await exported.getPage(1)).getTextContent()).items.map((item) =>
    "str" in item ? item.str : "",
  );
  expect(pageOneText.join("")).toContain("Hello lecture");

  await page.screenshot({ path: `${SHOTS}/lecture-notes.png`, animations: "disabled" });
  expect(pageErrors).toEqual([]);
});

test("the eraser removes a whole stroke, delete removes a text box, and undo brings them back", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await createSubject(page, "Physics");
  await importLecture(page, "Waves.pdf", ["Wavelength", "Frequency"]);
  await openLecture(page, "Waves");

  await page.getByRole("button", { name: "Pen" }).click();
  await drag(page, page.locator('[data-page-number="1"]'), [
    [0.2, 0.2],
    [0.8, 0.2],
  ]);
  await expect(page.locator('[data-page-number="1"] [data-kind="ink"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Eraser" }).click();
  await drag(page, page.locator('[data-page-number="1"]'), [
    [0.4, 0.15],
    [0.6, 0.25],
  ]);
  await expect(page.locator('[data-page-number="1"] [data-kind="ink"]')).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-page-number="1"] [data-kind="ink"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Text box", exact: true }).click();
  const pageBox = await page.locator('[data-page-number="1"]').boundingBox();
  if (pageBox === null) throw new Error("page 1 is not on screen");
  await page.mouse.click(pageBox.x + pageBox.width * 0.3, pageBox.y + pageBox.height * 0.6);
  await page.keyboard.type("Delete me");
  await page.getByRole("button", { name: "Select and move" }).click();
  await page.locator('[data-page-number="1"] [data-kind="text"]').click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveValue("Delete me");
});

test("a 120-page lecture draws only the pages near the view and jumps to ?page", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const texts = Array.from({ length: 120 }, (_, index) => `Slide ${index + 1}`);
  await createSubject(page, "Large");
  await importLecture(page, "Long deck.pdf", texts);
  await openLecture(page, "Long deck");

  await expect(page.getByText("Page 1 of 120")).toBeVisible();
  await expect(page.locator('[data-page-number="1"] canvas')).toBeAttached();
  const drawn = await page.locator("canvas").count();
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(10);

  const url = page.url();
  await page.goto(`${url}?page=100`);
  await expect(page.getByText("Page 100 of 120")).toBeVisible();
  await expect(page.locator('[data-page-number="100"]')).toBeInViewport();
  await page.screenshot({ path: `${SHOTS}/lecture-large.png`, animations: "disabled" });
});

test("the lecture viewer renders in dark mode", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await createSubject(page, "Chemistry");
  await importLecture(page, "Bonds.pdf", ["Ionic", "Covalent"]);
  await openLecture(page, "Bonds");
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByRole("textbox", { name: "Lecture notes" })).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/lecture-dark.png`, animations: "disabled" });
});

test("a text box moves and resizes by dragging, and undo returns it to where it was", async ({ page }) => {
  await createSubject(page, "Maths");
  await importLecture(page, "Limits.pdf", ["Limits"]);
  await openLecture(page, "Limits");

  await page.getByRole("button", { name: "Text box", exact: true }).click();
  const pageBox = await page.locator('[data-page-number="1"]').boundingBox();
  if (pageBox === null) throw new Error("page 1 is not on screen");
  await page.mouse.click(pageBox.x + pageBox.width * 0.2, pageBox.y + pageBox.height * 0.2);
  await page.keyboard.type("Move me");
  await page.getByRole("button", { name: "Select and move" }).click();

  const container = page.locator('[data-kind="text"]');
  const start = await container.boundingBox();
  if (start === null) throw new Error("text box is not on screen");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 120, start.y + start.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const moved = await container.boundingBox();
  expect(moved?.x ?? 0).toBeCloseTo(start.x + 120, 0);
  expect(moved?.y ?? 0).toBeCloseTo(start.y + 40, 0);

  const handle = await page.locator('[data-handle="resize"]').boundingBox();
  if (handle === null) throw new Error("resize handle is not on screen");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  const resized = await container.boundingBox();
  expect(resized?.width ?? 0).toBeCloseTo(start.width + 60, 0);

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await container.boundingBox())?.width ?? 0).toBeCloseTo(start.width, 0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await container.boundingBox())?.x ?? 0).toBeCloseTo(start.x, 0);
});

test("a change made in another window appears here without a reload", async ({ page }) => {
  await createSubject(page, "Biology");
  await importLecture(page, "Cells.pdf", ["Cells", "Membranes"]);
  await openLecture(page, "Cells");
  const lectureUrl = page.url();

  const other = await page.context().newPage();
  await other.goto(lectureUrl);
  await expect(other.getByRole("heading", { name: "Cells", exact: true })).toBeVisible();
  await other.getByRole("button", { name: "Text box", exact: true }).click();
  const pageBox = await other.locator('[data-page-number="1"]').boundingBox();
  if (pageBox === null) throw new Error("page 1 is not on screen");
  await other.mouse.click(pageBox.x + pageBox.width * 0.3, pageBox.y + pageBox.height * 0.4);
  await other.keyboard.type("Written elsewhere");
  await other.getByRole("button", { name: "Select and move" }).click();

  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveValue("Written elsewhere", { timeout: 10_000 });
  await other.close();
});

function notesPanel(page: Page): Locator {
  return page.getByRole("complementary", { name: "Notes" });
}

function notesEdge(page: Page): Locator {
  return page.getByRole("separator", { name: "Resize notes" });
}

async function notesWidth(page: Page): Promise<number> {
  const box = await notesPanel(page).boundingBox();
  if (box === null) throw new Error("notes panel is not on screen");
  return box.width;
}

/** Drags the notes edge by a number of pixels. Negative is left, which widens the notes. */
async function dragNotesEdge(page: Page, dx: number): Promise<void> {
  const box = await notesEdge(page).boundingBox();
  if (box === null) throw new Error("notes edge is not on screen");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

test("the notes edge drags wider and narrower, the PDF refits, and the width survives a reload", async ({ page }) => {
  await createSubject(page, "Markets");
  await importLecture(page, "Supply curves.pdf", ["Supply", "Demand"]);
  await openLecture(page, "Supply curves");
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(notesEdge(page)).toBeVisible();
  const before = await notesWidth(page);
  expect(before).toBeCloseTo(340, 0);

  const pdfPage = page.locator('[data-page-number="1"]');
  const pageBefore = (await pdfPage.boundingBox())?.width ?? 0;

  await dragNotesEdge(page, -120);
  expect(await notesWidth(page)).toBeCloseTo(before + 120, 0);
  await expect.poll(async () => (await pdfPage.boundingBox())?.width ?? 0).toBeCloseTo(pageBefore - 120, 0);

  await dragNotesEdge(page, 60);
  expect(await notesWidth(page)).toBeCloseTo(before + 60, 0);

  expect(await page.evaluate(() => localStorage.getItem("betternotez.notesWidth"))).toBe(String(before + 60));
  await page.reload();
  await page.getByRole("button", { name: "Notes" }).click();
  expect(await notesWidth(page)).toBeCloseTo(before + 60, 0);
});

test("the keyboard moves the notes edge in steps and to its limits, and a double click resets it", async ({ page }) => {
  await createSubject(page, "Statistics");
  await importLecture(page, "Sampling.pdf", ["Sampling"]);
  await openLecture(page, "Sampling");
  await page.getByRole("button", { name: "Notes" }).click();

  const edge = notesEdge(page);
  await expect(edge).toHaveAttribute("aria-orientation", "vertical");
  await expect(edge).toHaveAttribute("aria-valuemin", "280");
  await expect(edge).toHaveAttribute("aria-valuenow", "340");
  await edge.focus();

  // Left moves the edge left, which gives the notes more room, as dragging does.
  await page.keyboard.press("ArrowLeft");
  await expect(edge).toHaveAttribute("aria-valuenow", "356");
  expect(await notesWidth(page)).toBeCloseTo(356, 0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(edge).toHaveAttribute("aria-valuenow", "324");

  // 60% of the 1216px lecture area at the 1280px desktop viewport, less the rail.
  await page.keyboard.press("End");
  await expect(edge).toHaveAttribute("aria-valuenow", "729");
  expect(await notesWidth(page)).toBeCloseTo(729, 0);
  await page.keyboard.press("Home");
  await expect(edge).toHaveAttribute("aria-valuenow", "280");
  expect(await notesWidth(page)).toBeCloseTo(280, 0);

  await edge.dblclick();
  await expect(edge).toHaveAttribute("aria-valuenow", "340");
  expect(await notesWidth(page)).toBeCloseTo(340, 0);
});

test("the notes edge is not offered in a window too narrow for both panels, and the chosen width returns when it fits", async ({
  page,
}) => {
  await createSubject(page, "Geometry");
  await importLecture(page, "Triangles.pdf", ["Triangles"]);
  await openLecture(page, "Triangles");
  await page.getByRole("button", { name: "Notes" }).click();
  await dragNotesEdge(page, -120);
  expect(await notesWidth(page)).toBeCloseTo(460, 0);

  await page.setViewportSize({ width: 600, height: 800 });
  await expect(notesEdge(page)).toHaveCount(0);
  expect(await notesWidth(page)).toBeCloseTo(340, 0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(notesEdge(page)).toBeVisible();
  await expect.poll(() => notesWidth(page)).toBeCloseTo(460, 0);
});
