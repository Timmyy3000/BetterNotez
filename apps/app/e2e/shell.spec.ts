import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const SHOTS = "/tmp/bn-shots";
/** Encrypted with the user password "secret". */
const PASSWORD_PDF = new URL("./fixtures/password-protected.pdf", import.meta.url);

/** One page per entry, each holding that text. */
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

test("subject, lecture, date, persistence, search, and delete", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to BetterNotez" })).toBeVisible();

  await createSubject(page, "Digital Systems");
  await expect(page.getByText("No lectures yet")).toBeVisible();

  await page.getByRole("button", { name: "Import PDF" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "Lecture 1 - Logic gates.pdf",
    mimeType: "application/pdf",
    buffer: await makePdf(["Boolean algebra basics", "Karnaugh maps reduce expressions"]),
  });
  await expect(page.getByRole("dialog").getByText("Lecture 1 - Logic gates.pdf")).toBeVisible();
  await page.getByLabel("Lecture date").fill("2026-10-12");
  await page.getByRole("button", { name: "Import 1 PDF" }).click();

  const lectureLink = page.getByRole("link", { name: "Lecture 1 - Logic gates", exact: true });
  await expect(lectureLink).toBeVisible();
  await expect(page.getByText("Oct 12, 2026 · 2 pages")).toBeVisible();

  await page.reload();
  await expect(lectureLink).toBeVisible();
  await expect(page.getByText("Oct 12, 2026 · 2 pages")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/subject-page.png`, animations: "disabled" });

  await page.getByRole("complementary").getByRole("link", { name: "Search" }).click();
  await page.getByRole("searchbox", { name: "Search" }).fill("karnaugh");
  await expect(page.getByRole("heading", { name: /PDF text/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Karnaugh maps reduce expressions/ })).toContainText("Page 2");
  await page.screenshot({ path: `${SHOTS}/search-dark.png`, animations: "disabled" });

  await page.getByRole("link", { name: /Karnaugh maps reduce expressions/ }).click();
  await expect(page.getByRole("heading", { name: "Lecture 1 - Logic gates", exact: true })).toBeVisible();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();

  await page.getByRole("complementary").getByRole("link", { name: "Digital Systems" }).click();
  await page.getByRole("button", { name: "Actions for Lecture 1 - Logic gates" }).click();
  await page.getByRole("menuitem", { name: "Delete lecture" }).click();
  const deleteLecture = page.getByRole("dialog", { name: "Delete Lecture 1 - Logic gates?" });
  await expect(deleteLecture).toBeVisible();
  await deleteLecture.getByRole("button", { name: "Delete lecture" }).click();
  await expect(lectureLink).toHaveCount(0);
  await expect(page.getByText("No lectures yet")).toBeVisible();

  await page.getByRole("button", { name: "Subject actions" }).click();
  await page.getByRole("menuitem", { name: "Delete subject" }).click();
  const deleteSubject = page.getByRole("dialog", { name: "Delete Digital Systems?" });
  await expect(deleteSubject).toBeVisible();
  await deleteSubject.getByRole("button", { name: "Delete subject" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to BetterNotez" })).toBeVisible();
  await expect(page.getByText("No subjects yet", { exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("settings says the AI connection needs the desktop app on the web", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("complementary").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText(/needs the desktop app/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Download the desktop app" })).toHaveAttribute(
    "href",
    "https://github.com/Timmyy3000/BetterNotez/releases",
  );
});

test("the old about address opens settings", async ({ page }) => {
  await page.goto("/#/about");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/settings$/);
});

test("the appearance setting switches the theme and is remembered", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "warm");

  await page.getByRole("complementary").getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Light", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Warm", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "warm");

  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("explains why a file cannot be imported and keeps the subject usable", async ({ page }) => {
  await createSubject(page, "Physics");

  await page.getByRole("button", { name: "Import PDF" }).click();
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a pdf") });
  await expect(page.getByText("Only PDF files can be imported")).toBeVisible();

  await input.setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 this is not a real document"),
  });
  await page.getByRole("button", { name: "Import 1 PDF" }).click();
  await expect(page.getByText('"broken.pdf" could not be read')).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 1 PDF" })).toBeVisible();

  await page.getByRole("button", { name: "Remove broken.pdf" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("No lectures yet")).toBeVisible();
});

test("names a password-protected PDF instead of failing silently", async ({ page }) => {
  await createSubject(page, "Chemistry");

  await page.getByRole("button", { name: "Import PDF" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "locked.pdf",
    mimeType: "application/pdf",
    buffer: readFileSync(PASSWORD_PDF),
  });
  await page.getByRole("button", { name: "Import 1 PDF" }).click();

  await expect(page.getByText('"locked.pdf" is password-protected')).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 1 PDF" })).toBeVisible();
  await expect(page.getByText("No lectures yet")).toBeVisible();
});
