export class NotFoundError extends Error {
  readonly entity: string;
  readonly id: string;

  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
    this.entity = entity;
    this.id = id;
  }
}

export class InvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidError";
  }
}

/**
 * A material's notes.json is damaged, or was written by a newer version. It is not read as empty, and nothing is
 * written over it, so the notes stay on disk for the version that can read them.
 */
export class UnreadableNotesError extends Error {
  constructor() {
    super(
      "This material's notes can't be read. Its notes.json is damaged or was written by a newer version of BetterNotez, so it was left as it is.",
    );
    this.name = "UnreadableNotesError";
  }
}
