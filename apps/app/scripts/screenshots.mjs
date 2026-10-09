// Usage: (cd apps/app && npm run build && npx vite preview --port 4180 --host 127.0.0.1 --strictPort), then from the repo root: node apps/app/scripts/screenshots.mjs <outDir> (SHOTS_URL overrides the URL).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const outDir = process.argv[2];
if (outDir === undefined) {
  console.error("usage: node apps/app/scripts/screenshots.mjs <outDir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const BASE_URL = (process.env.SHOTS_URL ?? "http://127.0.0.1:4180").replace(/\/$/, "");
const VIEWPORT = { width: 1440, height: 900 };
// Each appearance: its file name, the preference stored for it, and the operating-system scheme it is shown under.
// Warm is a dark appearance, so it runs under a dark system scheme.
const APPEARANCES = [
  { name: "light", stored: "light", media: "light" },
  { name: "dark", stored: "dark", media: "dark" },
  { name: "warm", stored: "warm", media: "dark" },
];
// Written before each capture. Builds without a theme setting ignore it.
const THEME_KEY = "betternotez.theme";
const SEARCH_QUERY = "eigenvalue";

const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;
const PDF_MARGIN = 56;

const SUBJECTS = [
  { name: "Linear Algebra", color: "Blue" },
  { name: "Organic Chemistry", color: "Green" },
  { name: "Modern History", color: "Amber" },
];

const LECTURES = [
  {
    subject: "Linear Algebra",
    title: "Lecture 1 - Vectors and spans",
    date: "2026-09-28",
    pages: [
      {
        heading: "Vectors in R^2 and R^3",
        body: [
          "A vector is an ordered list of numbers. In R^2 it has two entries, one for each axis. Draw it as an arrow from the origin to the point it names.",
          "Vectors add entry by entry and scale by a number. Adding joins arrows tip to tail. Scaling stretches the arrow, or flips it when the number is negative.",
        ],
      },
      {
        heading: "Linear combinations",
        body: [
          "A linear combination of v1 and v2 is any sum c1 v1 + c2 v2, where c1 and c2 are real numbers. Changing the coefficients moves the result around the plane.",
          "Example: with v1 = (1, 0) and v2 = (0, 1), every point (a, b) equals a v1 + b v2.",
        ],
      },
      {
        heading: "Span",
        body: [
          "The span of a set of vectors is every linear combination of them. The span of one nonzero vector in R^2 is a line through the origin.",
          "Two vectors that do not lie on the same line span all of R^2.",
        ],
      },
      {
        heading: "Independence and bases",
        body: [
          "A set is linearly independent when no vector in it is a combination of the others. The only way to make the zero vector is with every coefficient equal to zero.",
          "A basis is a set that is both independent and spanning. Each vector in the space has exactly one representation in a basis.",
        ],
      },
    ],
  },
  {
    subject: "Linear Algebra",
    title: "Lecture 2 - Matrix multiplication",
    date: "2026-10-01",
    pages: [
      {
        heading: "A matrix as a machine",
        body: [
          "An m by n matrix takes a vector in R^n and returns a vector in R^m. Each column of the matrix says where one standard basis vector lands.",
          "Applying a matrix to x is written Ax. The result is a linear combination of the columns, weighted by the entries of x.",
        ],
      },
      {
        heading: "The product AB",
        body: [
          "The entry in row i and column j of AB is the dot product of row i of A with column j of B. The inner sizes must match: A is m by n and B is n by p.",
          "The product has size m by p. Check the sizes before you multiply.",
        ],
      },
      {
        heading: "Order matters",
        body: [
          "AB is usually not equal to BA. Multiplication is associative, so A(BC) = (AB)C, but it does not commute.",
          "Transposes reverse the order: (AB) transposed equals B transposed times A transposed.",
        ],
      },
      {
        heading: "Inverses",
        body: [
          "A square matrix A is invertible when some matrix B satisfies AB = BA = I. The identity I has ones on the diagonal and zeros elsewhere.",
          "A is invertible exactly when its columns are independent. If not, the system Ax = b can fail to have a unique solution.",
        ],
      },
    ],
  },
  {
    subject: "Linear Algebra",
    title: "Lecture 3 - Eigenvalues",
    date: "2026-10-05",
    pages: [
      {
        heading: "Eigenvectors",
        body: [
          "An eigenvector of a square matrix A is a nonzero vector v whose direction does not change under A. It satisfies Av = lambda v for some scalar lambda.",
          "The scalar lambda is the eigenvalue that goes with v.",
        ],
      },
      {
        heading: "Finding eigenvalues",
        body: [
          "Rewrite Av = lambda v as (A - lambda I) v = 0. A nonzero solution exists only when det(A - lambda I) = 0.",
          "That equation is the characteristic equation. Its roots are the eigenvalues of A.",
        ],
      },
      {
        heading: "Worked example",
        body: [
          "For A = [[2, 1], [1, 2]], the characteristic polynomial is (2 - lambda) squared minus 1. The roots are 1 and 3.",
          "For lambda = 3, solving (A - 3I) v = 0 gives the eigenvector (1, 1).",
        ],
      },
      {
        heading: "Why it matters",
        body: [
          "Eigenvalues explain repeated multiplication. Powers of A grow fastest in the directions whose eigenvalues are largest in size.",
          "If A has a full set of eigenvectors, it can be diagonalized, and A^k becomes a simple calculation.",
        ],
      },
    ],
  },
  {
    subject: "Organic Chemistry",
    title: "Lecture 4 - SN1 and SN2 reactions",
    date: "2026-10-02",
    pages: [
      {
        heading: "Nucleophilic substitution",
        body: [
          "In a substitution reaction, a nucleophile replaces a leaving group on a saturated carbon. Two mechanisms compete: SN1 and SN2.",
          "The leaving group, the nucleophile, and the solvent all affect which mechanism wins.",
        ],
      },
      {
        heading: "The SN2 mechanism",
        body: [
          "SN2 is a single concerted step. The nucleophile attacks from the back side while the leaving group departs, so the carbon inverts.",
          "The rate depends on both the nucleophile and the substrate, so the rate law is second order.",
        ],
      },
      {
        heading: "The SN1 mechanism",
        body: [
          "SN1 has two steps. The leaving group departs first and forms a carbocation. Then the nucleophile adds to the cation.",
          "The rate depends only on the substrate. The product is often a racemic mixture.",
        ],
      },
      {
        heading: "Choosing a pathway",
        body: [
          "Methyl and primary substrates favor SN2. Tertiary substrates favor SN1, because the carbocation is stabilized by the alkyl groups around it.",
          "Polar protic solvents favor SN1. Polar aprotic solvents favor SN2.",
        ],
      },
    ],
  },
  {
    subject: "Modern History",
    title: "Week 3 - The Industrial Revolution",
    date: "2026-10-01",
    pages: [
      {
        heading: "Causes",
        body: [
          "Britain began industrializing in the late 1700s. Coal, a growing market overseas, access to capital, and a reliable legal system all helped factories grow.",
          "Historians still debate which cause mattered most.",
        ],
      },
      {
        heading: "Technology",
        body: [
          "The spinning jenny and the water frame changed textile production. The steam engine then freed factories from rivers.",
          "Steam power made it possible to build a factory almost anywhere near coal.",
        ],
      },
      {
        heading: "Labor and cities",
        body: [
          "Factory towns such as Manchester grew very fast. Long hours, child labor, and poor housing were common.",
          "Reform acts in the 1830s and 1840s began to limit child labor and working hours.",
        ],
      },
      {
        heading: "Reading the evidence",
        body: [
          "Older accounts describe a sudden transformation. Newer work shows gradual change over several generations.",
          "When you read a claim about speed, check it against a primary source such as a factory inspector's report.",
        ],
      },
    ],
  },
];

const CLASSES = [
  { subject: "Linear Algebra", day: "Monday", start: "09:00", end: "10:30", location: "Room B2" },
  { subject: "Organic Chemistry", day: "Monday", start: "13:00", end: "15:00", location: "Lab 4" },
  { subject: "Modern History", day: "Tuesday", start: "11:00", end: "12:30", location: "Room 1.12" },
  { subject: "Linear Algebra", day: "Wednesday", start: "09:00", end: "10:30", location: "Room B2" },
  { subject: "Organic Chemistry", day: "Thursday", start: "14:00", end: "16:00", location: "Lab 4" },
  { subject: "Modern History", day: "Friday", start: "10:00", end: "11:30", location: "Room 1.12" },
];

const COLUMNS = ["To do", "Doing", "Done"];
const TASKS = [
  { title: "Read chapter 3 on eigenvalues", subject: "Linear Algebra", due: "2026-10-12", column: "To do" },
  { title: "Organic lab report", subject: "Organic Chemistry", due: "2026-10-14", column: "To do" },
  { title: "Essay outline on the Industrial Revolution", subject: "Modern History", due: "2026-10-06", column: "To do" },
  { title: "Problem set 4", subject: "Linear Algebra", due: "2026-10-10", column: "Doing" },
  { title: "Review Lecture 2 notes", subject: "Linear Algebra", column: "Doing" },
  { title: "Book the library study room", column: "Done" },
];

const TEXT_BOX = "Basis check: are v1 and v2 independent?";
// Page 1 is taller than the 900px viewport, so annotations sit in its upper half, under the body text.
const TEXT_BOX_AT = [0.2, 0.3];
const STROKE = [
  [0.2, 0.46],
  [0.35, 0.44],
  [0.5, 0.5],
  [0.65, 0.45],
  [0.8, 0.5],
];
const NOTES = [
  "Span = every linear combination of the set.",
  "Basis = independent and spanning, one representation per vector.",
  "Next: eigenvalues. Solve det(A - lambda I) = 0.",
  "Exam is Thursday. Bring the formula sheet.",
].join("\n");

const seeding = [];
const pageErrors = new Set();

async function step(name, action) {
  try {
    await action();
    seeding.push({ step: name, ok: true });
  } catch (error) {
    seeding.push({ step: name, ok: false, error: firstLine(error) });
    console.warn(`seed step failed: ${name}\n${error instanceof Error ? error.message : error}`);
  }
}

function firstLine(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0];
}

function routeOf(page) {
  return new URL(page.url()).hash.replace(/^#\//, "");
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function boxOf(locator) {
  // A page can be scrolled out of view, and a box measured there would put the mouse off screen.
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box === null) throw new Error("element is not on screen");
  return box;
}

function wrap(text, font, size, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

async function makeLecturePdf({ subject, title, pages }) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(title);
  const width = PDF_WIDTH - 2 * PDF_MARGIN;
  for (const { heading, body } of pages) {
    const page = doc.addPage([PDF_WIDTH, PDF_HEIGHT]);
    page.drawText(`${subject}  |  ${title}`, {
      x: PDF_MARGIN,
      y: PDF_HEIGHT - PDF_MARGIN,
      size: 9,
      font: regular,
      color: rgb(0.45, 0.45, 0.45),
    });
    let y = PDF_HEIGHT - PDF_MARGIN - 40;
    page.drawText(heading, { x: PDF_MARGIN, y, size: 22, font: bold });
    y -= 12;
    page.drawLine({
      start: { x: PDF_MARGIN, y },
      end: { x: PDF_WIDTH - PDF_MARGIN, y },
      thickness: 0.8,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 28;
    for (const paragraph of body) {
      for (const line of wrap(paragraph, regular, 12, width)) {
        page.drawText(line, { x: PDF_MARGIN, y, size: 12, font: regular });
        y -= 17;
      }
      y -= 10;
    }
  }
  return Buffer.from(await doc.save());
}

async function createSubject(page, { name, color }) {
  await page.goto(`${BASE_URL}/`);
  await page.getByRole("button", { name: "New subject" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: color, exact: true }).click();
  await page.getByRole("button", { name: "Create subject", exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
}

async function importLecture(page, subjectName, lecture) {
  await page.getByRole("heading", { name: subjectName, exact: true }).waitFor();
  await page.getByRole("button", { name: "Import PDF", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: `${lecture.title}.pdf`,
    mimeType: "application/pdf",
    buffer: await makeLecturePdf(lecture),
  });
  await page.getByLabel("Lecture date").fill(lecture.date);
  await page.getByRole("button", { name: "Import 1 PDF", exact: true }).click();
  await page.getByRole("link", { name: lecture.title, exact: true }).waitFor();
}

async function openSection(page, name) {
  await page.getByRole("complementary").getByRole("link", { name, exact: true }).click();
}

async function openLecture(page, title) {
  await page.getByRole("link", { name: title, exact: true }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
}

async function addTextBox(page, text) {
  await page.getByRole("button", { name: "Text box", exact: true }).click();
  const box = await boxOf(page.locator('[data-page-number="1"]'));
  await page.mouse.click(box.x + box.width * TEXT_BOX_AT[0], box.y + box.height * TEXT_BOX_AT[1]);
  await page.keyboard.type(text);
  await page.getByRole("button", { name: "Select and move", exact: true }).click();
  await page.locator('[data-kind="text"]').first().waitFor({ state: "attached" });
}

async function drawStroke(page, pageNumber, points) {
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.locator('button[aria-label="Pen"][aria-pressed="true"]').waitFor();
  const box = await boxOf(page.locator(`[data-page-number="${pageNumber}"]`));
  const [start, ...rest] = points.map(([u, v]) => ({ x: box.x + u * box.width, y: box.y + v * box.height }));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of rest) {
    await page.mouse.move(point.x, point.y, { steps: 8 });
  }
  await page.mouse.up();
  await page.locator(`[data-page-number="${pageNumber}"] [data-kind="ink"]`).first().waitFor({ state: "attached" });
}

async function ensureNotesOpen(page) {
  const notes = page.getByRole("button", { name: "Notes", exact: true });
  if ((await notes.getAttribute("aria-pressed")) !== "true") await notes.click();
}

async function writeNotes(page, text) {
  await ensureNotesOpen(page);
  await page.getByRole("textbox", { name: "Lecture notes" }).fill(text);
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
}

async function openNotes(page) {
  await ensureNotesOpen(page);
  await page.waitForFunction(() => {
    const field = document.querySelector('textarea[aria-label="Lecture notes"]');
    return field instanceof HTMLTextAreaElement && !field.disabled;
  });
}

async function addClass(page, cls) {
  await page.getByRole("button", { name: /^Add (your first )?class$/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add class" });
  await dialog.getByLabel("Subject").selectOption(cls.subject);
  await dialog.getByLabel("Day").selectOption(cls.day);
  await dialog.getByLabel("Start").fill(cls.start);
  await dialog.getByLabel("End").fill(cls.end);
  await dialog.getByLabel("Location").fill(cls.location);
  await dialog.getByRole("button", { name: "Add class", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
}

async function addTask(page, task) {
  const input = page.getByRole("textbox", { name: "Add a task to To do" });
  await input.fill(task.title);
  await input.press("Enter");
  await page.getByRole("region", { name: "To do" }).getByText(task.title, { exact: true }).waitFor();
}

async function editTask(page, task) {
  const column = page.getByRole("region", { name: task.column ?? "To do" });
  await column.getByText(task.title, { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  if (task.subject !== undefined) await dialog.getByLabel("Subject").selectOption(task.subject);
  if (task.due !== undefined) await dialog.getByLabel("Due date").fill(task.due);
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
}

async function moveTask(page, task) {
  if (COLUMNS.indexOf(task.column) <= 0) return;
  // A mouse drag, as the e2e suite does it. A drop occasionally misses, so each attempt measures again and retries.
  const card = page.locator('[aria-roledescription="sortable"]').filter({ hasText: task.title }).first();
  const target = page.getByRole("region", { name: task.column });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const from = await boxOf(card);
    const to = await boxOf(target);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    try {
      await target.getByText(task.title, { exact: true }).waitFor({ timeout: 3000 });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

async function arrangeTask(page, task) {
  // Move first, then edit the card where it now sits. Editing first left the next drag without a target.
  await moveTask(page, task);
  if (task.subject !== undefined || task.due !== undefined) await editTask(page, task);
}

async function seed(page, routes) {
  for (const subject of SUBJECTS) {
    await step(`create subject ${subject.name}`, async () => {
      await createSubject(page, subject);
      routes.subjects[subject.name] = routeOf(page);
    });
    for (const lecture of LECTURES.filter((item) => item.subject === subject.name)) {
      await step(`import ${lecture.title}`, () => importLecture(page, subject.name, lecture));
    }
  }

  const [first] = LECTURES;
  await step(`open ${first.title}`, async () => {
    await page.goto(`${BASE_URL}/#/${routes.subjects[first.subject]}`);
    await openLecture(page, first.title);
    routes.lecture = routeOf(page);
  });
  await step("text box on page 1", () => addTextBox(page, TEXT_BOX));
  await step("pen stroke on page 1", () => drawStroke(page, 1, STROKE));
  await step("notes", () => writeNotes(page, NOTES));

  await step("open Planner", () => openSection(page, "Planner"));
  for (const cls of CLASSES) {
    await step(`class ${cls.subject} ${cls.day}`, () => addClass(page, cls));
  }

  await step("open Tasks", () => openSection(page, "Tasks"));
  for (const task of TASKS) {
    await step(`task ${task.title}`, () => addTask(page, task));
  }
  for (const task of TASKS) {
    await step(`arrange ${task.title}`, () => arrangeTask(page, task));
  }
}

async function applyAppearance(page, appearance) {
  await page.emulateMedia({ colorScheme: appearance.media });
  await page.goto(`${BASE_URL}/`);
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [THEME_KEY, appearance.stored]);
  await page.reload();
  await settle(page);
}

function screensFor(routes) {
  const waitForMain = (page) => page.getByRole("heading", { level: 1 }).first().waitFor();
  return [
    { name: "home", route: "", ready: waitForMain },
    { name: "subject", route: routes.subjects[SUBJECTS[0].name], ready: waitForMain },
    {
      name: "lecture",
      route: routes.lecture,
      ready: (page) => page.locator('[data-page-number="1"] canvas').waitFor({ state: "attached", timeout: 30_000 }),
      arrange: openNotes,
    },
    { name: "planner", route: "planner", ready: (page) => page.getByRole("group", { name: "Monday" }).waitFor() },
    { name: "tasks", route: "tasks", ready: (page) => page.getByRole("region", { name: "To do" }).waitFor() },
    {
      name: "search",
      route: `search?q=${SEARCH_QUERY}`,
      ready: (page) => page.getByRole("searchbox", { name: "Search" }).waitFor(),
    },
    { name: "settings", route: "settings", ready: waitForMain },
  ];
}

async function shoot(page, scheme, screen, captured, skipped) {
  const file = `${scheme}-${screen.name}.png`;
  if (screen.route === undefined) {
    skipped.push({ file, reason: "not seeded" });
    return;
  }
  try {
    await page.goto(`${BASE_URL}/#/${screen.route}`);
    await settle(page);
    if (await page.getByText("Page not found", { exact: true }).isVisible()) {
      skipped.push({ file, reason: "route renders NotFound" });
      return;
    }
    await screen.ready(page);
    if (screen.arrange !== undefined) await screen.arrange(page);
    await settle(page);
    await page.screenshot({ path: join(outDir, file), animations: "disabled", caret: "hide" });
    captured.push({ file, scheme, screen: screen.name, route: `#/${screen.route}` });
  } catch (error) {
    skipped.push({ file, reason: firstLine(error) });
  }
}

/** Defines the Tauri bridge the app checks for, with only the two path calls the Settings page makes. */
function stubDesktopShell() {
  window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
      if (command === "plugin:path|resolve_directory") return "/home/student";
      if (command === "plugin:path|join") return args.paths.join("/");
      throw new Error(`not available in the screenshot stub: ${command}`);
    },
  };
}

/** The New subject dialog, opened from the sidebar. */
async function shootDialog(page, scheme, captured, skipped) {
  const file = `${scheme}-dialog-new-subject.png`;
  try {
    await page.goto(`${BASE_URL}/#/`);
    await settle(page);
    await page.getByRole("button", { name: "New subject", exact: true }).click();
    await page.getByRole("dialog", { name: "New subject", exact: true }).waitFor();
    await settle(page);
    await page.screenshot({ path: join(outDir, file), animations: "disabled", caret: "hide" });
    captured.push({ file, scheme, screen: "dialog-new-subject", route: "#/" });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
  } catch (error) {
    skipped.push({ file, reason: firstLine(error) });
  }
}

/**
 * The Settings page as the desktop app shows it, then the toast from copying the library folder.
 * The stub only changes the page's own platform check. Storage was chosen at startup and stays in the browser.
 */
async function shootDesktopSettings(page, scheme, captured, skipped) {
  const file = `${scheme}-settings-desktop.png`;
  const toastFile = `${scheme}-toast-copied.png`;
  const copyFolder = page.getByRole("button", { name: "Copy Library folder", exact: true });
  try {
    await page.evaluate(stubDesktopShell);
    await page.goto(`${BASE_URL}/#/settings`);
    await settle(page);
    await copyFolder.waitFor();
    await page.screenshot({ path: join(outDir, file), animations: "disabled", caret: "hide" });
    captured.push({ file, scheme, screen: "settings-desktop", route: "#/settings" });
    await copyFolder.click();
    await page.getByText("Library folder copied", { exact: true }).waitFor();
    await settle(page);
    await page.screenshot({ path: join(outDir, toastFile), animations: "disabled", caret: "hide" });
    captured.push({ file: toastFile, scheme, screen: "toast-copied", route: "#/settings" });
  } catch (error) {
    skipped.push({ file, reason: firstLine(error) });
  }
}

const captured = [];
const skipped = [];
const routes = { subjects: {}, lecture: undefined };
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  // The copy button needs clipboard access to show its success toast.
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE_URL });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => pageErrors.add(error.message));

  await seed(page, routes);
  for (const appearance of APPEARANCES) {
    const scheme = appearance.name;
    await applyAppearance(page, appearance);
    for (const screen of screensFor(routes)) {
      await shoot(page, scheme, screen, captured, skipped);
    }
    await shootDialog(page, scheme, captured, skipped);
    await shootDesktopSettings(page, scheme, captured, skipped);
  }
} finally {
  await browser.close();
}

const index = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  viewport: VIEWPORT,
  captured,
  skipped,
  seeding,
  pageErrors: [...pageErrors],
};
writeFileSync(join(outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);

const failed = seeding.filter((item) => !item.ok);
console.log(`captured ${captured.length} screenshots into ${outDir}`);
console.log(`seeding: ${seeding.length - failed.length}/${seeding.length} steps ok`);
for (const item of skipped) console.log(`skipped ${item.file}: ${item.reason}`);
if (captured.length === 0) process.exitCode = 1;
