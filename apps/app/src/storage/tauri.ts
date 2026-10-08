import { normalizeStoragePath, type Storage } from "@betternotez/core";
import { dirname, join } from "@tauri-apps/api/path";
import {
  exists as fileExists,
  mkdir,
  readDir,
  readFile,
  remove as removePath,
  rename,
  writeFile,
} from "@tauri-apps/plugin-fs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TEMP_SUFFIX = ".tmp";

/** A library folder on the local disk. Writes go to a temp file that is then renamed over the target. */
export class TauriFsStorage implements Storage {
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
    const target = await this.resolve(path);
    return (await fileExists(target)) ? readFile(target) : undefined;
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    const target = await this.resolve(path);
    await mkdir(await dirname(target), { recursive: true });
    const temp = `${target}.${crypto.randomUUID()}${TEMP_SUFFIX}`;
    await writeFile(temp, bytes);
    await rename(temp, target);
  }

  async list(dir: string): Promise<string[]> {
    const target = await this.resolve(dir);
    if (!(await fileExists(target))) {
      return [];
    }
    const entries = await readDir(target);
    return entries
      .map((entry) => entry.name)
      .filter((name) => !name.endsWith(TEMP_SUFFIX))
      .sort();
  }

  async remove(path: string): Promise<void> {
    const target = await this.resolve(path);
    if (await fileExists(target)) {
      await removePath(target, { recursive: true });
    }
  }

  async exists(path: string): Promise<boolean> {
    return fileExists(await this.resolve(path));
  }

  private resolve(path: string): Promise<string> {
    return join(this.root, ...normalizeStoragePath(path).split("/"));
  }
}
