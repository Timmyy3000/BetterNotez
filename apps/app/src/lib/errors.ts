import { NotFoundError } from "@betternotez/core";

/** Turns an error into a sentence for the student. Library lookup errors name internal IDs, so they are replaced. */
export function errorMessage(error: unknown): string {
  if (error instanceof NotFoundError) return "That item is no longer in your library.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
