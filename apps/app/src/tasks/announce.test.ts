import { describe, expect, it } from "vitest";
import { announce } from "./announce";

describe("drag announcements", () => {
  it("names the task and the column it moves over", () => {
    expect(announce.movedOver("Read chapter 3", "Doing")).toBe("Read chapter 3 was moved over Doing.");
  });

  it("says when the card is over no column", () => {
    expect(announce.movedOver("Read chapter 3", undefined)).toBe("Read chapter 3 is not over a column.");
  });

  it("names the column a card is dropped in", () => {
    expect(announce.droppedIn("Read chapter 3", "Done")).toBe("Read chapter 3 was dropped in Done.");
  });

  it("names a card when it is picked up and when a drag is cancelled", () => {
    expect(announce.pickedUp("Read chapter 3")).toBe("Picked up Read chapter 3.");
    expect(announce.cancelled("Read chapter 3")).toBe("Dragging Read chapter 3 was cancelled.");
  });
});
