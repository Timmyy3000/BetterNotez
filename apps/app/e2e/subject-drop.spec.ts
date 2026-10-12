/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
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

test("a PDF dropped on an open subject shows the drop overlay, then opens the import dialog with it listed", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await createSubject(page, "Digital Systems");

  // A drag carries one DataTransfer through every event, so the file made here is the one each event sees.
  const dataTransfer = await page.evaluateHandle(
    ({ name, bytes }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
      return transfer;
    },
    { name: "Lecture 1 - Gates.pdf", bytes: [...(await makePdf(["Boolean algebra"]))] },
  );

  const heading = page.locator("h1");
  await heading.dispatchEvent("dragenter", { dataTransfer });
  await heading.dispatchEvent("dragover", { dataTransfer });
  await expect(page.getByText("Drop PDFs to add them to Digital Systems", { exact: true })).toBeVisible();

  await heading.dispatchEvent("drop", { dataTransfer });
  const dialog = page.getByRole("dialog", { name: "Import PDFs" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Lecture 1 - Gates.pdf", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
