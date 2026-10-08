import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLibraryPath } from "./config.js";

describe("resolveLibraryPath", () => {
  it("uses the --library flag before the environment", () => {
    expect(resolveLibraryPath(["--library", "/data/bn"], { BETTERNOTEZ_LIBRARY: "/env/bn" }, "/home/ana")).toBe(
      resolve("/data/bn"),
    );
  });

  it("falls back to BETTERNOTEZ_LIBRARY when no flag is given", () => {
    expect(resolveLibraryPath([], { BETTERNOTEZ_LIBRARY: "/env/bn" }, "/home/ana")).toBe(resolve("/env/bn"));
  });

  it("defaults to a BetterNotez Library folder in the home directory", () => {
    expect(resolveLibraryPath([], {}, "/home/ana")).toBe(join("/home/ana", "BetterNotez Library"));
  });

  it("rejects a --library flag with no path", () => {
    expect(() => resolveLibraryPath(["--library", "--verbose"], {}, "/home/ana")).toThrow(
      "--library needs a folder path.",
    );
  });
});
