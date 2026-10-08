import { InvalidError } from "./errors.js";

/**
 * Byte and text storage addressed by POSIX paths relative to the library root.
 * Read methods return `undefined` for a missing file. `list` returns the names
 * of direct children, and `[]` for a missing directory.
 */
export interface Storage {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, text: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array | undefined>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  list(dir: string): Promise<string[]>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/** Returns the canonical relative form of `path`, or throws if it could escape the root. */
export function normalizeStoragePath(path: string): string {
  if (path.startsWith("/") || path.includes("\\")) {
    throw new InvalidError(`Invalid storage path: ${path}`);
  }
  const segments = path.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.length === 0 || segments.includes("..")) {
    throw new InvalidError(`Invalid storage path: ${path}`);
  }
  return segments.join("/");
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function firstSegment(rest: string): string {
  const slash = rest.indexOf("/");
  return slash === -1 ? rest : rest.slice(0, slash);
}

export class MemoryStorage implements Storage {
  private readonly files = new Map<string, Uint8Array>();

  async readText(path: string): Promise<string | undefined> {
    const bytes = await this.readBytes(path);
    return bytes === undefined ? undefined : decoder.decode(bytes);
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeBytes(path, encoder.encode(text));
  }

  async readBytes(path: string): Promise<Uint8Array | undefined> {
    return this.files.get(normalizeStoragePath(path))?.slice();
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(normalizeStoragePath(path), bytes.slice());
  }

  async list(dir: string): Promise<string[]> {
    const prefix = `${normalizeStoragePath(dir)}/`;
    const names = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        names.add(firstSegment(key.slice(prefix.length)));
      }
    }
    return [...names].sort();
  }

  async remove(path: string): Promise<void> {
    const target = normalizeStoragePath(path);
    this.files.delete(target);
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(`${target}/`)) {
        this.files.delete(key);
      }
    }
  }

  async exists(path: string): Promise<boolean> {
    const target = normalizeStoragePath(path);
    if (this.files.has(target)) {
      return true;
    }
    for (const key of this.files.keys()) {
      if (key.startsWith(`${target}/`)) {
        return true;
      }
    }
    return false;
  }
}
