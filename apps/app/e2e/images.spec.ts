/// <reference lib="dom" />
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { INK_COLORS } from "../src/lecture/inks";

async function makePdf(pageTexts: readonly string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    pdf.addPage([420, 300]).drawText(text, { x: 40, y: 150, size: 18, font });
  }
  return Buffer.from(await pdf.save());
}

async function openNewLecture(page: Page, subject: string, title: string): Promise<void> {
  await page.goto("/");
  const createFirst = page.getByRole("button", { name: "Create your first subject" });
  if (await createFirst.isVisible()) await createFirst.click();
  else await page.getByRole("button", { name: "New subject" }).click();
  await page.getByLabel("Name").fill(subject);
  await page.getByRole("button", { name: "Blue" }).click();
  await page.getByRole("button", { name: "Create subject" }).click();
  await page.getByRole("button", { name: "Import PDF" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: `${title}.pdf`,
    mimeType: "application/pdf",
    buffer: await makePdf(["First page", "Second page"]),
  });
  await page.getByRole("button", { name: "Import 1 PDF" }).click();
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator('[data-page-number="1"] canvas')).toBeVisible();
}

/** A 200 by 100 PNG in solid red, drawn by the browser. */
async function redPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no 2d context");
    context.fillStyle = "#c0392b";
    context.fillRect(0, 0, 200, 100);
    return canvas.toDataURL("image/png").split(",")[1] ?? "";
  });
  return Buffer.from(base64, "base64");
}

function rgbOf(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

test("a new text box is one line of upright black text, and grows as its text wraps", async ({ page }) => {
  await openNewLecture(page, "Typing", "Defaults");
  const sheet = page.locator('[data-page-number="1"]');
  const sheetBox = await sheet.boundingBox();
  if (sheetBox === null) throw new Error("page 1 is not on screen");

  await page.getByRole("button", { name: "Text box", exact: true }).click();
  await expect(page.getByRole("button", { name: "Color Black" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(sheetBox.x + sheetBox.width * 0.2, sheetBox.y + sheetBox.height * 0.3);
  const field = page.getByRole("textbox", { name: "Text box" });
  await expect(field).toBeFocused();
  await expect(field).toHaveCSS("font-style", "normal");
  await expect(field).toHaveCSS("color", rgbOf(INK_COLORS[0].value));

  const box = page.locator('[data-page-number="1"] [data-kind="text"]');
  const fontSize = parseFloat(await field.evaluate((element) => getComputedStyle(element).fontSize));
  const oneLine = (await box.boundingBox())?.height ?? 0;
  expect(oneLine).toBeLessThan(fontSize * 2.5);

  await page.keyboard.type("Line one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line two");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line three");
  await expect.poll(async () => (await box.boundingBox())?.height ?? 0).toBeGreaterThan(oneLine * 2);
  await expect.poll(() => field.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);

  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveValue("Line one\nLine two\nLine three");
  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveCSS("font-style", "normal");
});

test("a picture is added, moved, deleted and brought back, and it stays after a reload and in the export", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openNewLecture(page, "Pictures", "Diagrams");
  const png = await redPng(page);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Add image" }).click(),
  ]);
  await chooser.setFiles({ name: "diagram.png", mimeType: "image/png", buffer: png });

  const picture = page.locator('[data-page-number="1"] [data-kind="image"]');
  await expect(picture).toHaveCount(1);
  await expect.poll(() => picture.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(200);
  await expect(page.getByRole("button", { name: "Select and move" })).toHaveAttribute("aria-pressed", "true");
  const placed = await picture.boundingBox();
  if (placed === null) throw new Error("the picture is not on screen");
  expect(placed.width / placed.height).toBeCloseTo(2, 1);

  await page.mouse.move(placed.x + placed.width / 2, placed.y + placed.height / 2);
  await page.mouse.down();
  await page.mouse.move(placed.x + placed.width / 2 + 60, placed.y + placed.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.round(((await picture.boundingBox())?.x ?? 0) - placed.x)).toBe(60);

  const handle = picture.locator('[data-handle="resize"]');
  const corner = await handle.boundingBox();
  if (corner === null) throw new Error("the resize handle is not on screen");
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 - 50, corner.y + corner.height / 2 + 80, { steps: 8 });
  await page.mouse.up();
  const resized = await picture.boundingBox();
  expect(resized?.width ?? 0).toBeCloseTo(placed.width - 50, -1);
  expect((resized?.width ?? 0) / (resized?.height ?? 1)).toBeCloseTo(2, 1);

  await page.keyboard.press("Delete");
  await expect(picture).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(picture).toHaveCount(1);
  await expect.poll(() => picture.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(200);

  await page.reload();
  await expect(picture).toHaveCount(1);
  await expect.poll(() => picture.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(200);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  const exported = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(await download.path())) }).promise;
  const operators = await (await exported.getPage(1)).getOperatorList();
  expect(operators.fnArray.filter((fn) => fn === pdfjs.OPS.paintImageXObject)).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("a pasted picture lands on the page in view", async ({ page }) => {
  await openNewLecture(page, "Pasting", "Clipboard");
  const base64 = (await redPng(page)).toString("base64");

  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));
  }, base64);

  await expect(page.locator('[data-page-number="1"] [data-kind="image"]')).toHaveCount(1);
});
