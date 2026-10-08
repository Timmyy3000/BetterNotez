import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFsStorage } from "../node.js";
import { MemoryStorage, type Storage } from "../storage.js";

export interface StorageEnv {
  /** Opens storage over the same data. For the disk backend each call is a new instance over the same folder. */
  readonly open: () => Storage;
  readonly cleanup: () => Promise<void>;
}

export interface StorageBackend {
  readonly name: string;
  readonly create: () => Promise<StorageEnv>;
}

export const storageBackends: StorageBackend[] = [
  {
    name: "MemoryStorage",
    create: async () => {
      const storage = new MemoryStorage();
      return { open: () => storage, cleanup: async () => {} };
    },
  },
  {
    name: "NodeFsStorage",
    create: async () => {
      const root = await mkdtemp(join(tmpdir(), "betternotes-core-"));
      return {
        open: () => new NodeFsStorage(root),
        cleanup: () => rm(root, { recursive: true, force: true }),
      };
    },
  },
];

export const CLOCK = new Date("2026-10-08T09:00:00.000Z");

export function pdfBytes(body: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`);
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
