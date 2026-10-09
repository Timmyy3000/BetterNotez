import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOTS = "/tmp/bn-shots";

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

/** Drags from the middle of `from` to the middle of `to` with the mouse, as a student would. */
async function dragBetween(page: Page, from: Locator, to: Locator, { keepHeight = false } = {}): Promise<void> {
  const source = await from.boundingBox();
  const target = await to.boundingBox();
  if (source === null || target === null) throw new Error("Drag source or target is not on screen");
  const startY = source.y + source.height / 2;
  const endY = keepHeight ? startY : target.y + target.height / 2;
  await page.mouse.move(source.x + source.width / 2, startY);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, endY, { steps: 12 });
  await page.mouse.up();
}

test("planner: add classes, drag one to another day, and keep the timetable after reload", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await createSubject(page, "Digital Systems");
  await createSubject(page, "Linear Algebra");
  await page.getByRole("complementary").getByRole("link", { name: "Planner" }).click();
  await expect(page.getByRole("heading", { name: "Add your first class" })).toBeVisible();

  await page.getByRole("button", { name: "Add your first class" }).click();
  const addClass = page.getByRole("dialog", { name: "Add class" });
  await expect(addClass).toBeVisible();
  await addClass.getByLabel("Start").fill("09:00");
  await addClass.getByLabel("End").fill("10:30");
  await addClass.getByLabel("Location").fill("Room B2");
  await addClass.getByRole("button", { name: "Add class" }).click();

  const monday = page.getByRole("group", { name: "Monday" });
  const tuesday = page.getByRole("group", { name: "Tuesday" });
  const digital = (column: Locator) => column.getByRole("button", { name: /Digital Systems, 09:00/ });
  await expect(digital(monday)).toBeVisible();

  await dragBetween(page, digital(monday), tuesday, { keepHeight: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(digital(tuesday)).toBeVisible();
  await expect(digital(monday)).toHaveCount(0);

  await page.getByRole("button", { name: "Add class" }).click();
  const overlapping = page.getByRole("dialog", { name: "Add class" });
  await overlapping.getByLabel("Subject").selectOption("Linear Algebra");
  await overlapping.getByLabel("Day").selectOption("Tuesday");
  await overlapping.getByLabel("Start").fill("10:00");
  await overlapping.getByLabel("End").fill("11:30");
  await overlapping.getByRole("button", { name: "Add class" }).click();
  await expect(tuesday.getByRole("button", { name: /Linear Algebra, 10:00/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/planner.png`, animations: "disabled" });

  await page.reload();
  await expect(digital(tuesday)).toBeVisible();
  await expect(tuesday.getByRole("button", { name: /Linear Algebra, 10:00/ })).toBeVisible();
  await expect(digital(monday)).toHaveCount(0);

  await digital(tuesday).click();
  const editClass = page.getByRole("dialog", { name: "Edit class" });
  await expect(editClass.getByLabel("Location")).toHaveValue("Room B2");
  await editClass.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("dialog", { name: "Remove Digital Systems?" }).getByRole("button", { name: "Remove class" }).click();
  await expect(digital(tuesday)).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test("planner: arrow keys move and resize a focused class", async ({ page }) => {
  await createSubject(page, "Keyboard class");
  await page.getByRole("complementary").getByRole("link", { name: "Planner" }).click();
  await addTuesdayClass(page, "Keyboard class", "09:00", "10:00");

  const block = page.locator("[data-block-id]").first();
  await block.focus();
  await page.keyboard.press("ArrowDown");
  await expect(block).toHaveAttribute("aria-label", /09:15–10:15/);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(block).toHaveAttribute("aria-label", /09:15–10:30/);
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("group", { name: "Monday" }).locator("[data-block-id]")).toHaveCount(1);
  await expect(block).toBeFocused();
});

/** Adds a class on Tuesday through the dialog. */
async function addTuesdayClass(page: Page, subject: string, start: string, end: string, location?: string): Promise<void> {
  await page.getByRole("button", { name: /^Add (your first )?class$/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add class" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Subject").selectOption(subject);
  await dialog.getByLabel("Day").selectOption("Tuesday");
  await dialog.getByLabel("Start").fill(start);
  await dialog.getByLabel("End").fill(end);
  if (location !== undefined) await dialog.getByLabel("Location").fill(location);
  await dialog.getByRole("button", { name: "Add class" }).click();
  await expect(dialog).toHaveCount(0);
}

async function boxOf(locator: Locator): Promise<{ x: number; width: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Element is not on screen");
  return box;
}

test("planner: overlapping classes stay inside their day and keep their details in a tooltip", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await createSubject(page, "Digital Systems");
  await createSubject(page, "Linear Algebra");
  await createSubject(page, "Physics Lab");
  await page.getByRole("complementary").getByRole("link", { name: "Planner" }).click();

  await addTuesdayClass(page, "Digital Systems", "09:00", "11:00", "Room B2");
  await addTuesdayClass(page, "Linear Algebra", "09:30", "10:30");
  await addTuesdayClass(page, "Physics Lab", "10:00", "12:00", "Lab 4");

  const tuesday = page.getByRole("group", { name: "Tuesday" });
  const cards = [
    tuesday.getByRole("button", { name: /^Digital Systems, 09:00/ }),
    tuesday.getByRole("button", { name: /^Linear Algebra, 09:30/ }),
  ];
  const physics = tuesday.getByRole("button", { name: /^Physics Lab, 10:00/ });
  const column = await boxOf(tuesday);
  for (const card of [...cards, physics]) {
    const box = await boxOf(card);
    expect(box.x).toBeGreaterThanOrEqual(column.x);
    expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width);
    expect(box.width).toBeGreaterThanOrEqual(80);
  }
  await expect(physics).toHaveAttribute("title", "Physics Lab\n10:00–12:00\nLab 4");
  await page.screenshot({ path: `${SHOTS}/planner-overlap.png`, animations: "disabled" });

  expect(pageErrors).toEqual([]);
});

test("tasks: add tasks, move one to Doing, keep it after reload, and edit its due date", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("complementary").getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();

  const todoInput = page.getByRole("textbox", { name: "Add a task to To do" });
  await todoInput.fill("Read chapter 3");
  await todoInput.press("Enter");
  await todoInput.fill("Problem set 2");
  await todoInput.press("Enter");

  const todo = page.getByRole("region", { name: "To do" });
  const doing = page.getByRole("region", { name: "Doing" });
  const done = page.getByRole("region", { name: "Done" });
  const problemSet = todo.getByText("Problem set 2", { exact: true });
  await expect(problemSet).toBeVisible();
  await expect(todo.getByText("Read chapter 3", { exact: true })).toBeVisible();

  await dragBetween(page, problemSet, doing);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(doing.getByText("Problem set 2", { exact: true })).toBeVisible();
  await expect(todo.getByText("Problem set 2", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(doing.getByText("Problem set 2", { exact: true })).toBeVisible();
  await expect(todo.getByText("Read chapter 3", { exact: true })).toBeVisible();
  await expect(done.getByText("Problem set 2", { exact: true })).toHaveCount(0);

  await todo.getByText("Read chapter 3", { exact: true }).click();
  const editTask = page.getByRole("dialog", { name: "Edit task" });
  await editTask.getByLabel("Due date").fill("2026-10-12");
  await editTask.getByRole("button", { name: "Save changes" }).click();
  await expect(todo.getByText("Oct 12, 2026")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tasks.png`, animations: "disabled" });

  await page.reload();
  await expect(todo.getByText("Oct 12, 2026")).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("tasks: move a card with the keyboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("complementary").getByRole("link", { name: "Tasks" }).click();

  const todoInput = page.getByRole("textbox", { name: "Add a task to To do" });
  await todoInput.fill("Keyboard task");
  await todoInput.press("Enter");

  const doing = page.getByRole("region", { name: "Doing" });
  const card = page.locator('[aria-roledescription="sortable"]').filter({ hasText: "Keyboard task" });
  await card.focus();
  await page.keyboard.press("Space");
  // The keyboard sensor picks the card up asynchronously. Arrow keys sent before that are lost.
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText("Keyboard task was moved over Doing.");
  await page.keyboard.press("Space");

  await expect(doing.getByText("Keyboard task", { exact: true })).toBeVisible();
  await page.reload();
  await expect(doing.getByText("Keyboard task", { exact: true })).toBeVisible();
});

test("tasks: Enter opens a card, and Space picks it up", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("complementary").getByRole("link", { name: "Tasks" }).click();

  const todoInput = page.getByRole("textbox", { name: "Add a task to To do" });
  await todoInput.fill("Enter task");
  await todoInput.press("Enter");

  const card = page.locator('[aria-roledescription="sortable"]').filter({ hasText: "Enter task" });
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Edit task" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toBeFocused();

  await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("tasks: filter by subject and mark overdue dates", async ({ page }) => {
  await createSubject(page, "Chemistry");
  await page.getByRole("complementary").getByRole("link", { name: "Tasks" }).click();

  const todoInput = page.getByRole("textbox", { name: "Add a task to To do" });
  await todoInput.fill("Lab report");
  await todoInput.press("Enter");
  await todoInput.fill("Errands");
  await todoInput.press("Enter");

  const todo = page.getByRole("region", { name: "To do" });
  await todo.getByText("Lab report", { exact: true }).click();
  const editTask = page.getByRole("dialog", { name: "Edit task" });
  await editTask.getByLabel("Subject").selectOption("Chemistry");
  await editTask.getByLabel("Due date").fill("2000-01-01");
  await editTask.getByRole("button", { name: "Save changes" }).click();
  // Overdue is set in the ink colour, so red stays for errors. The spine on the card marks it.
  await expect(todo.getByText("Jan 1, 2000")).toHaveCSS("color", "rgb(241, 234, 219)");

  const filter = page.getByRole("combobox", { name: "Filter by subject" });
  await filter.selectOption("Chemistry");
  await expect(todo.getByText("Lab report", { exact: true })).toBeVisible();
  await expect(todo.getByText("Errands", { exact: true })).toHaveCount(0);

  await filter.selectOption("No subject");
  await expect(todo.getByText("Errands", { exact: true })).toBeVisible();
  await expect(todo.getByText("Lab report", { exact: true })).toHaveCount(0);
});
