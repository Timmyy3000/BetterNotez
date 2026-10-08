import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { normalizeStoragePath, type Storage } from "./storage.js";

const MISSING_CODES = new Set(["ENOENT", "ENOTDIR"]);

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && MISSING_CODES.has(String(error.code));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Storage backed by a folder on the local disk. Writes go to a temp file, then rename over the target. */
export class NodeFsStorage implements Storage {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async readText(path: string): Promise<string | undefined> {
    const bytes = await this.readBytes(path);
    return bytes === undefined ? undefined : decoder.decode(bytes);
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeBytes(path, encoder.encode(text));
  }

  async readBytes(path: string): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(this.resolve(path)));
    } catch (error) {
      if (isMissing(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    const target = this.resolve(path);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    const handle = await open(temp, "w");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, target);
  }

  async list(dir: string): Promise<string[]> {
    try {
      return (await readdir(this.resolve(dir))).sort();
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }
  }

  async remove(path: string): Promise<void> {
    await rm(this.resolve(path), { recursive: true, force: true });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(this.resolve(path));
      return true;
    } catch (error) {
      if (isMissing(error)) {
        return false;
      }
      throw error;
    }
  }

  private resolve(path: string): string {
    return join(this.root, ...normalizeStoragePath(path).split("/"));
  }
}
