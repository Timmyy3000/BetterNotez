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
  const title = fileName.replace(/\.pdf$/, "");
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
}

async function dragTo(page: Page, from: Locator, to: Locator): Promise<void> {
  const source = await from.boundingBox();
  const target = await to.boundingBox();
  if (source === null || target === null) throw new Error("Drag source or target is not on screen");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("a student files a material into a folder, marks another done, and both stay after a reload", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await createSubject(page, "Organized");
  await importLecture(page, "Lecture 1.pdf", ["first"]);
  await importLecture(page, "Lecture 2.pdf", ["second"]);

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Name").fill("Week 1");
  await page.getByRole("button", { name: "Create folder" }).click();
  const week1 = page.getByRole("region", { name: "Week 1" });
  const unfiled = page.getByRole("region", { name: "Unfiled" });
  await expect(week1).toBeVisible();

  await dragTo(page, page.getByRole("button", { name: "Move Lecture 1", exact: true }), week1.getByText("Drop material here."));
  await expect(week1.getByRole("link", { name: "Lecture 1", exact: true })).toBeVisible();
  await expect(unfiled.getByRole("link", { name: "Lecture 1", exact: true })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Mark Lecture 2 as done" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Mark Lecture 2 as done" }).click();
  await expect(page.getByRole("button", { name: "Mark Lecture 2 as done" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("2 materials · 1 done")).toBeVisible();

  await page.getByRole("button", { name: "Done 1", exact: true }).click();
  await expect(page.getByRole("link", { name: "Lecture 2", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lecture 1", exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("region", { name: "Week 1" }).getByRole("link", { name: "Lecture 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Lecture 2 as done" })).toHaveAttribute("aria-pressed", "true");

  expect(pageErrors).toEqual([]);
});
