/// <reference lib="dom" />
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { INK_COLORS } from "../src/lecture/inks";

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

async function importLecture(
  page: Page,
  fileName: string,
  pageTexts: readonly string[],
  bytes?: Buffer,
): Promise<void> {
  await page.getByRole("button", { name: "Import PDF" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: bytes ?? (await makePdf(pageTexts)),
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

  // Notes belong to a page. The pen work above left the view on page 2, so this note goes on page 1, which a reload opens.
  await page.getByRole("button", { name: "Previous page" }).click();
  await page.getByRole("button", { name: "Notes" }).click();
  await page.getByRole("textbox", { name: /^Notes for page \d+$/ }).fill("Remember the truth table");
  await expect(page.getByRole("complementary", { name: "Notes" }).getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByRole("textbox", { name: /^Notes for page \d+$/ })).toHaveValue("Remember the truth table");

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
  await expect(page.getByRole("textbox", { name: /^Notes for page \d+$/ })).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/lecture-dark.png`, animations: "disabled" });
});

/** The `rgb(...)` string the browser reports for a `#rrggbb` colour. */
function rgbOf(hex: string): string {
  const [red, green, blue] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return `rgb(${red}, ${green}, ${blue})`;
}

/** WCAG 2.x contrast ratio of two `rgb(...)` colours, as the browser reports computed styles. */
function contrastOf(first: string, second: string): number {
  const luminanceOf = (css: string): number => {
    const [red, green, blue] = (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((channel) => {
      const value = Number(channel) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  };
  const [lighter, darker] = [luminanceOf(first), luminanceOf(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

for (const theme of ["warm", "dark", "light"] as const) {
  test(`a text box sits on the paper and every pen ink stays readable in ${theme}`, async ({ page }) => {
    await page.addInitScript((stored) => localStorage.setItem("betternotez.theme", stored), theme);
    await createSubject(page, "Labs");
    await importLecture(page, "Circuits.pdf", ["Resistors"]);
    await openLecture(page, "Circuits");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const pageOne = page.locator('[data-page-number="1"]');
    const paper = await pageOne.evaluate((element) => getComputedStyle(element).backgroundColor);

    // Boxes are stored in the order they are made, so the nth box on the page is the one just added.
    for (const [index, swatch] of INK_COLORS.entries()) {
      const word = `Readable ${swatch.name}`;
      const swatchButton = page.getByRole("button", { name: `Color ${swatch.name}` });
      await swatchButton.click();
      await expect(swatchButton).toHaveAttribute("aria-pressed", "true");

      await page.getByRole("button", { name: "Text box", exact: true }).click();
      const pageBox = await pageOne.boundingBox();
      if (pageBox === null) throw new Error("page 1 is not on screen");
      await page.mouse.click(pageBox.x + pageBox.width * 0.2, pageBox.y + pageBox.height * (0.15 + index * 0.12));
      await page.keyboard.type(word);

      const box = page.locator('[data-kind="text"]').nth(index);
      const field = box.getByRole("textbox", { name: "Text box" });
      await expect(field).toBeFocused();
      await expect(box).toHaveCSS("background-color", paper);
      await expect(field).toHaveCSS("color", rgbOf(swatch.value));
      const ink = await field.evaluate((element) => getComputedStyle(element).color);
      expect(contrastOf(ink, paper), `${swatch.name} on the ${theme} paper`).toBeGreaterThanOrEqual(4.5);

      await page.getByRole("button", { name: "Select and move" }).click();
      await expect(box).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(field).toHaveValue(word);
    }
  });
}

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

/** The width the page-1 canvas was drawn at, in device pixels. */
async function drawnWidth(page: Page): Promise<number> {
  return Number(await page.locator('[data-page-number="1"] canvas').getAttribute("width"));
}

/** The width page 1 is shown at, in device pixels. */
async function pageDeviceWidth(page: Page): Promise<number> {
  const box = await page.locator('[data-page-number="1"]').boundingBox();
  if (box === null) throw new Error("page 1 is not on screen");
  // The canvas is drawn at the device pixel ratio, so the shown width is scaled to match.
  return box.width * (await page.evaluate<number>("window.devicePixelRatio"));
}

/** How far the page-1 bitmap is from the width page 1 is shown at. A stretched or stale bitmap is far off. */
async function redrawGap(page: Page): Promise<number> {
  return Math.abs((await drawnWidth(page)) - (await pageDeviceWidth(page)));
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
  await expect.poll(() => notesWidth(page)).toBeCloseTo(before + 120, 0);
  await expect.poll(async () => (await pdfPage.boundingBox())?.width ?? 0).toBeCloseTo(pageBefore - 120, 0);

  await dragNotesEdge(page, 60);
  await expect.poll(() => notesWidth(page)).toBeCloseTo(before + 60, 0);

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("betternotez.notesWidth")))
    .toBe(String(before + 60));
  await page.reload();
  await page.getByRole("button", { name: "Notes" }).click();
  await expect.poll(() => notesWidth(page)).toBeCloseTo(before + 60, 0);
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
  await expect(edge).toHaveAttribute("aria-valuetext", "Notes 340 pixels wide");
  const controls = await edge.getAttribute("aria-controls");
  expect(controls).toBeTruthy();
  await expect(page.locator(`[id="${controls}"]`)).toHaveAccessibleName("Notes");
  // At rest the edge is only the panel's hairline, so its accent line and grip are hidden.
  await expect(edge.locator("span").first()).toHaveCSS("opacity", "0");

  // Left moves the edge left, which gives the notes more room, as dragging does. Pressing a key also focuses it
  // from the keyboard, which is when the accent line shows.
  await edge.press("ArrowLeft");
  await expect(edge).toHaveAttribute("aria-valuenow", "356");
  await expect(edge).toHaveAttribute("aria-valuetext", "Notes 356 pixels wide");
  await expect(edge.locator("span").first()).toHaveCSS("opacity", "1");
  await expect.poll(() => notesWidth(page)).toBeCloseTo(356, 0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(edge).toHaveAttribute("aria-valuenow", "324");

  // The PDF keeps 620px, which is the floating toolbar's width, so the notes stop at 596px in a 1216px lecture area.
  await page.keyboard.press("End");
  await expect(edge).toHaveAttribute("aria-valuenow", "596");
  await expect.poll(() => notesWidth(page)).toBeCloseTo(596, 0);
  await page.keyboard.press("Home");
  await expect(edge).toHaveAttribute("aria-valuenow", "280");
  await expect.poll(() => notesWidth(page)).toBeCloseTo(280, 0);

  await edge.dblclick();
  await expect(edge).toHaveAttribute("aria-valuenow", "340");
  await expect.poll(() => notesWidth(page)).toBeCloseTo(340, 0);
});

test("hovering the notes edge shows a grip, and the accent appears only while the edge is held", async ({ page }) => {
  await createSubject(page, "Thermo");
  await importLecture(page, "Entropy.pdf", ["Entropy"]);
  await openLecture(page, "Entropy");
  await page.getByRole("button", { name: "Notes" }).click();

  const edge = notesEdge(page);
  const line = edge.locator("span").nth(0);
  const grip = edge.locator("span").nth(1);
  await expect(line).toHaveCSS("opacity", "0");
  await expect(grip).toHaveCSS("opacity", "0");

  const box = await edge.boundingBox();
  if (box === null) throw new Error("notes edge is not on screen");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await expect(grip).toHaveCSS("opacity", "1");
  await expect(line).toHaveCSS("opacity", "0");

  await page.mouse.down();
  await expect(line).toHaveCSS("opacity", "1");
  await page.mouse.up();
  await expect(line).toHaveCSS("opacity", "0");
});

test("the PDF redraws at its new width once a notes drag settles, and at once after a zoom", async ({ page }) => {
  await createSubject(page, "Optics");
  await importLecture(page, "Lenses.pdf", ["Convex", "Concave"]);
  await openLecture(page, "Lenses");
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(notesEdge(page)).toBeVisible();

  // The bitmap matches the width page 1 is shown at, to within a device pixel.
  await expect.poll(() => redrawGap(page)).toBeLessThanOrEqual(1);
  const shownBefore = await pageDeviceWidth(page);

  await dragNotesEdge(page, -120);
  await expect.poll(() => notesWidth(page)).toBeCloseTo(460, 0);
  await expect.poll(() => pageDeviceWidth(page)).toBeLessThan(shownBefore);
  await expect.poll(() => redrawGap(page)).toBeLessThanOrEqual(1);

  const shownAtFit = await pageDeviceWidth(page);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => pageDeviceWidth(page)).toBeGreaterThan(shownAtFit);
  await expect.poll(() => redrawGap(page)).toBeLessThanOrEqual(1);
});

test("the notes edge is not offered in a window too narrow for both panels, and the chosen width returns when it fits", async ({
  page,
}) => {
  await createSubject(page, "Geometry");
  await importLecture(page, "Triangles.pdf", ["Triangles"]);
  await openLecture(page, "Triangles");
  await page.getByRole("button", { name: "Notes" }).click();
  await dragNotesEdge(page, -120);
  await expect.poll(() => notesWidth(page)).toBeCloseTo(460, 0);

  await page.setViewportSize({ width: 600, height: 800 });
  await expect(notesEdge(page)).toHaveCount(0);
  await expect.poll(() => notesWidth(page)).toBeCloseTo(340, 0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(notesEdge(page)).toBeVisible();
  await expect.poll(() => notesWidth(page)).toBeCloseTo(460, 0);
});

test("the annotation toolbar stays whole when the notes are as wide as they go", async ({ page }) => {
  await createSubject(page, "Lighting");
  await importLecture(page, "Refraction.pdf", ["Refraction"]);
  await openLecture(page, "Refraction");
  await page.getByRole("button", { name: "Notes" }).click();

  // Dragged well past the limit, so the notes stop at their widest: 596px at the 1280px desktop viewport.
  await dragNotesEdge(page, -600);
  await expect.poll(() => notesWidth(page)).toBeCloseTo(596, 0);

  const toolbar = await page.getByRole("toolbar", { name: "Annotate" }).boundingBox();
  const pdfColumn = await page.locator(".desk").boundingBox();
  if (toolbar === null || pdfColumn === null) throw new Error("the toolbar or the PDF is not on screen");
  expect(toolbar.x).toBeGreaterThanOrEqual(pdfColumn.x);
  expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(pdfColumn.x + pdfColumn.width);
});

test("selected text becomes a highlight that survives a reload, and can be recoloured, removed, and undone", async ({
  page,
}) => {
  mkdirSync(SHOTS, { recursive: true });
  await createSubject(page, "Highlights");
  await importLecture(page, "Marking.pdf", ["Boolean algebra and Karnaugh maps", "Timing diagrams"]);
  await openLecture(page, "Marking");
  const pageOne = page.locator('[data-page-number="1"]');
  await pageOne.locator(".textLayer span").first().waitFor({ state: "attached" });
  const popover = page.getByRole("toolbar", { name: "Highlight color" });
  const highlights = pageOne.locator('[data-kind="highlight"]');

  // Drag across "algebra and Karnaugh", which starts and ends inside one run of text.
  const selected = await runCharacters(page, 8, 30);
  await page.mouse.move(selected.startX, selected.y);
  await page.mouse.down();
  await page.mouse.move(selected.endX, selected.y, { steps: 12 });
  await page.mouse.up();
  await expect(popover).toBeVisible();
  await page.getByRole("button", { name: "Highlight in Pink" }).click();
  await expect(popover).toBeHidden();
  await expect(highlights).toHaveCount(1);
  await expect(highlights).toHaveCSS("background-color", "rgb(255, 95, 160)");

  await page.reload();
  await expect(highlights).toHaveCount(1);

  // A click on the highlighted words opens the popover for that highlight, with its colour pressed.
  const word = await runCharacters(page, 18, 22);
  await page.mouse.click(word.startX, word.y);
  await expect(popover).toBeVisible();
  await expect(page.getByRole("button", { name: "Highlight in Pink" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Highlight in Green" }).click();
  await expect(highlights).toHaveCSS("background-color", "rgb(92, 207, 110)");

  await page.reload();
  await expect(highlights).toHaveCSS("background-color", "rgb(92, 207, 110)");

  await page.mouse.click(word.startX, word.y);
  await page.getByRole("button", { name: "Delete highlight" }).click();
  await expect(highlights).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(highlights).toHaveCount(1);
});

test("the popover closes on Escape and the colour choice is announced, with focus kept on the page", async ({ page }) => {
  await createSubject(page, "Keyboard");
  await importLecture(page, "Popover.pdf", ["Boolean algebra and Karnaugh maps"]);
  await openLecture(page, "Popover");
  const pageOne = page.locator('[data-page-number="1"]');
  await pageOne.locator(".textLayer span").first().waitFor({ state: "attached" });
  const popover = page.getByRole("toolbar", { name: "Highlight color" });
  const announced = page.locator('[aria-live="polite"].sr-only');
  const selectFirstRun = () =>
    selectAcrossPages(page, '[data-page-number="1"] .textLayer span', '[data-page-number="1"] .textLayer span');

  // A keyboard user reaches a swatch and presses Escape: the popover closes and focus stays on the page.
  await selectFirstRun();
  await expect(popover).toBeVisible();
  await page.getByRole("button", { name: "Highlight in Pink" }).focus();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(pageOne).toBeFocused();

  // Choosing a colour announces it, and leaves the focus on the page rather than on nothing.
  await selectFirstRun();
  await page.getByRole("button", { name: "Highlight in Pink" }).click();
  await expect(announced).toHaveText("Highlighted");
  await expect(pageOne).toBeFocused();
  await expect(pageOne.locator('[data-kind="highlight"]')).toHaveCount(1);

  // A different tool leaves nothing selected, so the popover for a highlight closes with it.
  const word = await runCharacters(page, 2, 6);
  await page.mouse.click(word.startX, word.y);
  await expect(popover).toBeVisible();
  await page.getByRole("button", { name: "Pen" }).click();
  await expect(popover).toBeHidden();
  await page.getByRole("button", { name: "Select and move" }).click();

  // Deleting a highlight announces its removal and keeps the focus on the page.
  await page.mouse.click(word.startX, word.y);
  await page.getByRole("button", { name: "Delete highlight" }).click();
  await expect(announced).toHaveText("Highlight removed");
  await expect(pageOne).toBeFocused();
  await expect(pageOne.locator('[data-kind="highlight"]')).toHaveCount(0);
});

test("a text selection survives a zoom, because the text is laid out again in place", async ({ page }) => {
  await createSubject(page, "Zooming");
  await importLecture(page, "Zoom.pdf", ["Boolean algebra and Karnaugh maps"]);
  await openLecture(page, "Zoom");
  await page.locator('[data-page-number="1"] .textLayer span').first().waitFor({ state: "attached" });

  await selectAcrossPages(page, '[data-page-number="1"] .textLayer span', '[data-page-number="1"] .textLayer span');
  await expect(page.getByRole("toolbar", { name: "Highlight color" })).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByRole("button", { name: "125%" })).toBeVisible();

  // The spans were moved, not rebuilt, so the selection made in them is still there.
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("Karnaugh");
});

test("a selection across two pages highlights each page, and one undo takes both back", async ({ page }) => {
  await createSubject(page, "Karnaugh");
  await importLecture(page, "Two pages.pdf", ["Karnaugh maps group adjacent cells", "Timing diagrams show signal changes"]);
  await openLecture(page, "Two pages");
  await page.locator('[data-page-number="2"] .textLayer span').first().waitFor({ state: "attached" });

  await selectAcrossPages(page, '[data-page-number="1"] .textLayer span', '[data-page-number="2"] .textLayer span');
  await expect(page.getByRole("toolbar", { name: "Highlight color" })).toBeVisible();
  await page.getByRole("button", { name: "Highlight in Green" }).click();

  await expect(page.locator('[data-page-number="1"] [data-kind="highlight"]')).toHaveCount(1);
  await expect(page.locator('[data-page-number="2"] [data-kind="highlight"]')).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-kind="highlight"]')).toHaveCount(0);
});

test("a selection that reaches a page whose text is not laid out is refused, and stores nothing", async ({ page }) => {
  await createSubject(page, "Long reading");
  await importLecture(page, "Three pages.pdf", ["First page text", "Second page text", "Third page text"]);
  await openLecture(page, "Three pages");
  await page.locator('[data-page-number="1"] .textLayer span').first().waitFor({ state: "attached" });

  // Page 3 lies beyond the viewport's margin, so its text is not laid out and the selection cannot include it.
  await selectAcrossPages(page, '[data-page-number="1"] .textLayer span', '[data-page-number="3"] .textLayer');
  await expect(page.getByText("Scroll so the whole selection is loaded, then try again")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Highlight color" })).toHaveCount(0);
  await expect(page.locator('[data-kind="highlight"]')).toHaveCount(0);
});

/**
 * A page whose first line is two runs with a word space between them, and whose second line is two runs that
 * touch, as a word split across two draws does.
 */
async function makeSpacedPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = 18;
  const page = pdf.addPage([420, 300]);
  page.drawText("Karnaugh", { x: 40, y: 200, size, font });
  page.drawText("maps", { x: 40 + font.widthOfTextAtSize("Karnaugh", size) + 8, y: 200, size, font });
  page.drawText("Gray", { x: 40, y: 150, size, font });
  page.drawText("code", { x: 40 + font.widthOfTextAtSize("Gray", size), y: 150, size, font });
  return Buffer.from(await pdf.save());
}

/** The highlights stored in the library, read from the browser's IndexedDB as the app wrote them. */
async function storedHighlights(page: Page): Promise<Array<{ page: number; text: string }>> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("betternotez");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const files = await new Promise<Array<[IDBValidKey, unknown]>>((resolve, reject) => {
      const found: Array<[IDBValidKey, unknown]> = [];
      const cursor = database.transaction("files").objectStore("files").openCursor();
      cursor.onsuccess = () => {
        const next = cursor.result;
        if (next === null) {
          resolve(found);
          return;
        }
        found.push([next.key, next.value]);
        next.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
    database.close();

    const highlights: Array<{ page: number; text: string }> = [];
    for (const [key, value] of files) {
      if (typeof key !== "string" || !key.endsWith("/annotations.json") || !(value instanceof Uint8Array)) continue;
      const stored = JSON.parse(new TextDecoder().decode(value)) as Array<{ kind: string; page: number; text?: string }>;
      for (const annotation of stored) {
        if (annotation.kind === "highlight") highlights.push({ page: annotation.page, text: annotation.text ?? "" });
      }
    }
    return highlights;
  });
}

test("a highlight reads as the page does: a word space where the page has one, and none where two runs touch", async ({
  page,
}) => {
  await createSubject(page, "Typesetting");
  await importLecture(page, "Word spacing.pdf", [], await makeSpacedPdf());
  await openLecture(page, "Word spacing");
  await page.locator('[data-page-number="1"] .textLayer span').first().waitFor({ state: "attached" });

  // From the start of "Karnaugh" to the end of "code": every run on both lines, as a drag over them would take.
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll<HTMLElement>('[data-page-number="1"] .textLayer span'));
    const first = spans[0]?.firstChild;
    const last = spans.at(-1)?.firstChild;
    if (!(first instanceof Text) || !(last instanceof Text)) throw new Error("the page has no text runs");
    window.getSelection()?.setBaseAndExtent(first, 0, last, last.length);
  });
  await page.getByRole("button", { name: "Highlight in Yellow" }).click();

  await expect.poll(() => storedHighlights(page)).toEqual([{ page: 1, text: "Karnaugh maps Graycode" }]);
});

/** Selects from the start of the first run to the end of the second, as a drag across pages would. */
async function selectAcrossPages(page: Page, from: string, to: string): Promise<void> {
  await page.evaluate(
    ({ fromSelector, toSelector }) => {
      const start = document.querySelector(fromSelector)?.firstChild;
      if (!(start instanceof Text)) throw new Error("no text at the start of the selection");
      const end = document.querySelector(toSelector);
      if (end === null) throw new Error("no place at the end of the selection");
      const endNode = end.firstChild instanceof Text ? end.firstChild : end;
      const endOffset = endNode instanceof Text ? endNode.length : 0;
      window.getSelection()?.setBaseAndExtent(start, 0, endNode, endOffset);
    },
    { fromSelector: from, toSelector: to },
  );
}

/** Where the characters from `from` to `to` of the page's first text run sit on screen, for a mouse drag over them. */
async function runCharacters(page: Page, from: number, to: number): Promise<{ startX: number; endX: number; y: number }> {
  return page.evaluate(
    (bounds) => {
      const node = document.querySelector('[data-page-number="1"] .textLayer span')?.firstChild;
      if (!(node instanceof Text)) throw new Error("page 1 has no text run");
      const range = document.createRange();
      range.setStart(node, bounds.from);
      range.setEnd(node, bounds.to);
      const box = range.getBoundingClientRect();
      return { startX: box.left + 1, endX: box.right - 1, y: box.top + box.height / 2 };
    },
    { from, to },
  );
}

/** A computed style of a locator, as the browser reports it. */
async function computedStyle(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

/** The text box's font size in CSS pixels. A 420-point page is drawn at the width of its section, so points scale by it. */
async function fontPixels(field: Locator): Promise<number> {
  return parseFloat(await computedStyle(field, "font-size"));
}

const TOOLBAR_BUTTONS = [
  "Select and move",
  "Text box",
  "Pen",
  "Highlighter",
  "Eraser",
  "Color Black",
  "Color Red",
  "Color Green",
  "Color Blue",
  "Color Ochre",
  "Thin",
  "Medium",
  "Thick",
  "Undo",
  "Redo",
  "Delete selected",
];

/** The labels of the floating toolbar's buttons, in order. A change to the palette shows up here. */
async function toolbarLabels(page: Page): Promise<string[]> {
  return page
    .getByRole("toolbar", { name: "Annotate" })
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
}

/** Starts a text box on page 1 at the given fraction of the page, and types into it. */
async function typeBoxOnPageOne(page: Page, at: { x: number; y: number }, text: string): Promise<void> {
  await page.getByRole("button", { name: "Text box", exact: true }).click();
  const pageBox = await page.locator('[data-page-number="1"]').boundingBox();
  if (pageBox === null) throw new Error("page 1 is not on screen");
  await page.mouse.click(pageBox.x + pageBox.width * at.x, pageBox.y + pageBox.height * at.y);
  await page.keyboard.type(text);
}

test("the format bar sets a box's size, style, and color, and the choices survive a reload", async ({ page }) => {
  await createSubject(page, "Formatting");
  await importLecture(page, "Styles.pdf", ["Styles"]);
  await openLecture(page, "Styles");

  await typeBoxOnPageOne(page, { x: 0.2, y: 0.3 }, "Key result");
  const field = page.getByRole("textbox", { name: "Text box" });
  const pageWidth = (await page.locator('[data-page-number="1"]').boundingBox())?.width ?? 0;
  const scale = pageWidth / 420;

  await page.getByRole("button", { name: "Large text", exact: true }).click();
  await expect.poll(() => fontPixels(field)).toBeCloseTo(18 * scale, 1);
  await expect(page.getByRole("button", { name: "Large text", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Boxes are italic until they are set otherwise, so Italic starts pressed and a click takes it off.
  await expect(page.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Italic" }).click();
  await expect(field).toHaveCSS("font-style", "normal");

  await page.getByRole("button", { name: "Bold" }).click();
  await expect(field).toHaveCSS("font-weight", "700");
  await page.getByRole("button", { name: "Underline" }).click();
  await expect.poll(() => computedStyle(field, "text-decoration-line")).toContain("underline");
  await page.getByRole("button", { name: "Red ink" }).click();
  await expect(field).toHaveCSS("color", rgbOf(INK_COLORS[1].value));

  // The first Escape leaves the text, and the box stays selected. The second clears the selection.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Format text box" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Format text box" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveValue("Key result");

  await page.locator('[data-kind="text"]').click();
  await expect(page.getByRole("button", { name: "Large text", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Underline" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Red ink" })).toHaveAttribute("aria-pressed", "true");
});

test("Ctrl+B, Ctrl+I, and Ctrl+U style the text as it is typed, and Tab and Escape move between the box and its bar", async ({
  page,
}) => {
  await createSubject(page, "Shortcuts");
  await importLecture(page, "Keys.pdf", ["Keys"]);
  await openLecture(page, "Keys");

  await typeBoxOnPageOne(page, { x: 0.2, y: 0.3 }, "Shortcut");
  const field = page.getByRole("textbox", { name: "Text box" });

  await page.keyboard.press("Control+b");
  await expect(field).toHaveCSS("font-weight", "700");
  await page.keyboard.press("Control+i");
  await expect(field).toHaveCSS("font-style", "normal");
  await page.keyboard.press("Control+u");
  await expect.poll(() => computedStyle(field, "text-decoration-line")).toContain("underline");
  await page.keyboard.type(" more");
  await expect(field).toHaveValue("Shortcut more");
  await expect(field).toHaveCSS("font-weight", "700");

  // Tab leaves the text for the bar, where the first control is the S size.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Small text" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Small text" })).toHaveAttribute("aria-pressed", "true");

  // Escape returns focus to the box, which opens for typing again.
  await page.keyboard.press("Escape");
  await expect(field).toBeFocused();
  await page.keyboard.type("!");
  await expect(field).toHaveValue("Shortcut more!");
});

test("each formatting change is one undo step, and redo brings it back", async ({ page }) => {
  await createSubject(page, "Undo");
  await importLecture(page, "History.pdf", ["History"]);
  await openLecture(page, "History");

  await typeBoxOnPageOne(page, { x: 0.2, y: 0.3 }, "Undo style");
  await page.getByRole("button", { name: "Select and move" }).click();
  await expect(page.getByRole("group", { name: "Format text box" })).toBeVisible();

  await page.getByRole("button", { name: "Large text", exact: true }).click();
  await page.getByRole("button", { name: "Bold" }).click();
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Large text", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: "Medium text" })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByRole("button", { name: "Large text", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a text box is recoloured after the fact, and the palette and the bar stay apart", async ({ page }) => {
  await createSubject(page, "Palette");
  await importLecture(page, "Colours.pdf", ["Colours"]);
  await openLecture(page, "Colours");

  await expect(page.getByRole("group", { name: "Format text box" })).toHaveCount(0);
  expect(await toolbarLabels(page)).toEqual(TOOLBAR_BUTTONS);

  // New boxes take the palette's ink, which is Blue, so the recolour goes to Ochre.
  await typeBoxOnPageOne(page, { x: 0.2, y: 0.3 }, "Recolour me");
  await page.getByRole("button", { name: "Select and move" }).click();
  await page.locator('[data-page-number="1"] [data-kind="text"]').click();
  await expect(page.getByRole("button", { name: "Blue ink" })).toHaveAttribute("aria-pressed", "true");
  // The toolbar's own swatches are still the only "Color" buttons, and the bar has none of its own.
  expect(await toolbarLabels(page)).toEqual(TOOLBAR_BUTTONS);
  expect(await page.getByRole("toolbar", { name: "Annotate" }).getByRole("button", { name: "Bold" }).count()).toBe(0);

  await page.getByRole("button", { name: "Ochre ink" }).click();
  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveCSS("color", rgbOf(INK_COLORS[4].value));
  await expect(page.getByRole("button", { name: "Ochre ink" })).toHaveAttribute("aria-pressed", "true");

  // Undo takes the box back to Blue, and redo puts Ochre back. The bar belongs to the selected box, so it stays.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Format text box" })).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-page-number="1"] [data-kind="text"] textarea')).toHaveCSS(
    "color",
    rgbOf(INK_COLORS[3].value),
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator('[data-page-number="1"] [data-kind="text"] textarea')).toHaveCSS(
    "color",
    rgbOf(INK_COLORS[4].value),
  );

  await page.reload();
  await page.locator('[data-page-number="1"] [data-kind="text"]').click();
  await expect(page.getByRole("button", { name: "Ochre ink" })).toHaveAttribute("aria-pressed", "true");
});

test("the format bar sits above a box in the page and moves below it near the top", async ({ page }) => {
  await createSubject(page, "Placement");
  await importLecture(page, "Margins.pdf", ["Margins"]);
  await openLecture(page, "Margins");

  const bar = page.getByRole("group", { name: "Format text box" });

  await typeBoxOnPageOne(page, { x: 0.2, y: 0.005 }, "At the top");
  await expect(bar).toBeVisible();
  const top = await page.locator('[data-kind="text"]').boundingBox();
  const topBar = await bar.boundingBox();
  if (top === null || topBar === null) throw new Error("the box or its bar is not on screen");
  expect(topBar.y).toBeGreaterThanOrEqual(top.y + top.height);

  const pageBox = await page.locator('[data-page-number="1"]').boundingBox();
  if (pageBox === null) throw new Error("page 1 is not on screen");
  await page.mouse.click(pageBox.x + pageBox.width * 0.2, pageBox.y + pageBox.height * 0.6);
  await page.keyboard.type("Lower down");
  await expect(bar).toBeVisible();
  const lower = await page.locator('[data-kind="text"]').nth(1).boundingBox();
  const lowerBar = await bar.boundingBox();
  if (lower === null || lowerBar === null) throw new Error("the lower box or its bar is not on screen");
  expect(lowerBar.y + lowerBar.height).toBeLessThanOrEqual(lower.y);
});
