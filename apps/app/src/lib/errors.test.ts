import { NotFoundError } from "@betternotez/core";
import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("hides the internal ID of a missing item", () => {
    expect(errorMessage(new NotFoundError("Subject", "subject-42"))).toBe("That item no longer exists.");
  });

  it("passes other error messages through", () => {
    expect(errorMessage(new Error("The file is not a PDF."))).toBe("The file is not a PDF.");
  });

  it("gives a general sentence for anything that is not an error", () => {
    expect(errorMessage("disk full")).toBe("Something went wrong. Please try again.");
  });
});
