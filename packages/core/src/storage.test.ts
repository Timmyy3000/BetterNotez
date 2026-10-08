import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidError } from "./errors.js";
import { storageBackends, type StorageEnv } from "./test/backends.js";

describe.each(storageBackends)("Storage on $name", ({ create }) => {
  let env: StorageEnv;

  beforeEach(async () => {
    env = await create();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it("returns undefined for files that do not exist", async () => {
    const storage = env.open();
    expect(await storage.readText("missing.json")).toBeUndefined();
    expect(await storage.readBytes("missing.pdf")).toBeUndefined();
    expect(await storage.exists("missing.json")).toBe(false);
  });

  it("round-trips text and bytes in nested folders", async () => {
    const storage = env.open();
    await storage.writeText("notes/2026/week one.md", "Ünïcode notes");
    await storage.writeBytes("files/blob.bin", new Uint8Array([0, 1, 254, 255]));
    expect(await storage.readText("notes/2026/week one.md")).toBe("Ünïcode notes");
    expect(await storage.readBytes("files/blob.bin")).toEqual(new Uint8Array([0, 1, 254, 255]));
  });

  it("replaces the content on overwrite", async () => {
    const storage = env.open();
    await storage.writeText("a.txt", "first");
    await storage.writeText("a.txt", "second");
    expect(await storage.readText("a.txt")).toBe("second");
  });

  it("lists only direct children, sorted by name", async () => {
    const storage = env.open();
    await storage.writeText("a/b/c.txt", "1");
    await storage.writeText("a/z.txt", "2");
    await storage.writeText("a/m/n.txt", "3");
    expect(await storage.list("a")).toEqual(["b", "m", "z.txt"]);
  });

  it("lists a missing folder as empty", async () => {
    expect(await env.open().list("nowhere")).toEqual([]);
  });

  it("removes a folder with everything inside it", async () => {
    const storage = env.open();
    await storage.writeText("a/b/c.txt", "1");
    await storage.writeText("a/keep.txt", "2");
    await storage.remove("a/b");
    expect(await storage.list("a")).toEqual(["keep.txt"]);
    expect(await storage.exists("a/b/c.txt")).toBe(false);
  });

  it("treats removing a missing path as a no-op", async () => {
    await expect(env.open().remove("never/existed")).resolves.toBeUndefined();
  });

  it("reports folders as existing when they hold files", async () => {
    const storage = env.open();
    await storage.writeText("folder/file.txt", "x");
    expect(await storage.exists("folder")).toBe(true);
    expect(await storage.exists("folder/file.txt")).toBe(true);
  });

  it("leaves no temporary files behind after a write", async () => {
    const storage = env.open();
    await storage.writeText("dir/file.txt", "content");
    expect(await storage.list("dir")).toEqual(["file.txt"]);
  });

  it.each(["../outside.txt", "/etc/passwd", "a\\b.txt", "", "a/../../b"])(
    "rejects the unsafe path %j",
    async (path) => {
      await expect(env.open().writeText(path, "x")).rejects.toBeInstanceOf(InvalidError);
    },
  );
});
