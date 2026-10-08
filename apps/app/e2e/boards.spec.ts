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
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");

  await expect(doing.getByText("Keyboard task", { exact: true })).toBeVisible();
  await page.reload();
  await expect(doing.getByText("Keyboard task", { exact: true })).toBeVisible();
});

test("tasks: filter by subject and show overdue dates in red", async ({ page }) => {
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
  await expect(todo.getByText("Jan 1, 2000")).toHaveCSS("color", "rgb(220, 38, 38)");

  const filter = page.getByRole("combobox", { name: "Filter by subject" });
  await filter.selectOption("Chemistry");
  await expect(todo.getByText("Lab report", { exact: true })).toBeVisible();
  await expect(todo.getByText("Errands", { exact: true })).toHaveCount(0);

  await filter.selectOption("No subject");
  await expect(todo.getByText("Errands", { exact: true })).toBeVisible();
  await expect(todo.getByText("Lab report", { exact: true })).toHaveCount(0);
});
