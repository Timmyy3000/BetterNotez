import { normalizeStoragePath, type Storage } from "@betternotez/core";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface LibrarySchema extends DBSchema {
  files: { key: string; value: Uint8Array };
}

const STORE = "files";
const DEFAULT_DB_NAME = "betternotez";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Every key under `dir/`. "0" sorts right after "/", so the range holds that subtree and nothing else. */
function subtree(dir: string): IDBKeyRange {
  return IDBKeyRange.bound(`${dir}/`, `${dir}0`, false, true);
}

function firstSegment(rest: string): string {
  const slash = rest.indexOf("/");
  return slash === -1 ? rest : rest.slice(0, slash);
}

/**
 * Each file is one record keyed by its library path. Folders have no record of their own.
 * They exist only as shared key prefixes.
 */
export class IndexedDbStorage implements Storage {
  private readonly dbName: string;
  private database?: Promise<IDBPDatabase<LibrarySchema>>;

  constructor(dbName: string = DEFAULT_DB_NAME) {
    this.dbName = dbName;
  }

  async readText(path: string): Promise<string | undefined> {
    const bytes = await this.readBytes(path);
    return bytes === undefined ? undefined : decoder.decode(bytes);
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeBytes(path, encoder.encode(text));
  }

  async readBytes(path: string): Promise<Uint8Array | undefined> {
    const bytes = await (await this.open()).get(STORE, normalizeStoragePath(path));
    return bytes?.slice();
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    await (await this.open()).put(STORE, bytes.slice(), normalizeStoragePath(path));
  }

  async list(dir: string): Promise<string[]> {
    const base = normalizeStoragePath(dir);
    const keys = await (await this.open()).getAllKeys(STORE, subtree(base));
    const names = new Set(keys.map((key) => firstSegment(key.slice(base.length + 1))));
    return [...names].sort();
  }

  async remove(path: string): Promise<void> {
    const target = normalizeStoragePath(path);
    const tx = (await this.open()).transaction(STORE, "readwrite");
    await tx.store.delete(target);
    await tx.store.delete(subtree(target));
    await tx.done;
  }

  async exists(path: string): Promise<boolean> {
    const target = normalizeStoragePath(path);
    const db = await this.open();
    if ((await db.getKey(STORE, target)) !== undefined) {
      return true;
    }
    return (await db.count(STORE, subtree(target))) > 0;
  }

  private open(): Promise<IDBPDatabase<LibrarySchema>> {
    this.database ??= openDB<LibrarySchema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore(STORE);
      },
    });
    return this.database;
  }
}
