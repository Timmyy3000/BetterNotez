import { describe, expect, it, vi } from "vitest";
import { fromItem, handleChoice, toItem } from "./select";

describe("the empty option", () => {
  it("hands onValueChange an empty value when the student chooses No subject", () => {
    const onValueChange = vi.fn();

    handleChoice(onValueChange)(toItem(""));

    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("gives Radix a non-empty item for the empty value", () => {
    expect(toItem("")).not.toBe("");
    expect(fromItem(toItem(""))).toBe("");
  });

  it("passes every other choice through unchanged", () => {
    const onValueChange = vi.fn();

    handleChoice(onValueChange)(toItem("subject-1"));

    expect(onValueChange).toHaveBeenCalledWith("subject-1");
  });
});
