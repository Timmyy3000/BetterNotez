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

async function writeSubjectFile(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    async ({ fileName, contents }) => {
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
      const subjectFile = keys.map(String).find((key) => key.endsWith("/subject.json"));
      if (subjectFile === undefined) throw new Error("the subject is not in the library");
      const dir = subjectFile.replace(/\/subject\.json$/, "");
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("files", "readwrite");
        transaction.objectStore("files").put(new TextEncoder().encode(contents), `${dir}/${fileName}`);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    },
    { fileName: name, contents: text },
  );
}

const ALERT =
  "This subject's folders and reading status can't be read. The file is damaged or was made by a newer version of BetterNotez, so it has been left as it is.";

const DAMAGED_FILE = '{"version":1,"folders":[{"id":"01DAMAGEDFOLDER0000000000"';

test("a subject whose organization.json cannot be read still lists its material, and the file stays as it is", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await createSubject(page, "Unreadable");
  await importLecture(page, "Lecture 1.pdf", ["first"]);
  await writeSubjectFile(page, "organization.json", DAMAGED_FILE);
  await page.reload();

  await expect(page.getByRole("link", { name: "Lecture 1", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(ALERT);
  await expect(page.getByRole("heading", { name: "Unfiled", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Mark / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Move Lecture 1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New folder" })).toHaveCount(0);

  await page.getByRole("button", { name: "Actions for Lecture 1" }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit material" });
  await expect(dialog.getByLabel("Title")).toHaveValue("Lecture 1");
  await expect(dialog.getByText("Folder", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  expect(await libraryFileText(page, "organization.json")).toBe(DAMAGED_FILE);
  expect(pageErrors).toEqual([]);
});
