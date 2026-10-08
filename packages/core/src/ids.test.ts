import { describe, expect, it } from "vitest";
import { newId, SubjectId } from "./ids.js";

describe("newId", () => {
  it("creates 26 character Crockford base32 ids", () => {
    expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("encodes the timestamp in the leading characters", () => {
    expect(newId(0).slice(0, 10)).toBe("0000000000");
    expect(newId(31).slice(0, 10)).toBe("000000000Z");
    expect(newId(32).slice(0, 10)).toBe("0000000010");
  });

  it("sorts later times after earlier times", () => {
    expect(newId(2000) > newId(1000)).toBe(true);
  });

  it("keeps creation order for ids made in the same millisecond", () => {
    const first = newId(5000);
    const second = newId(5000);
    const third = newId(5000);
    expect(first < second && second < third).toBe(true);
  });

  it("produces unique ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
  });

  it("produces ids that the branded id schema accepts", () => {
    expect(SubjectId.safeParse(newId()).success).toBe(true);
  });
});
