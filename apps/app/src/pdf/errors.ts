export class UnreadablePdfError extends Error {
  readonly reason: "password" | "corrupt";

  constructor(reason: "password" | "corrupt") {
    super(reason);
    this.name = "UnreadablePdfError";
    this.reason = reason;
  }
}
