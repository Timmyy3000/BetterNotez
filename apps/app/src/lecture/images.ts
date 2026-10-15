import type { ImageType, Library } from "@betternotez/core";

/** The longest side a picture is stored at. A phone photo shrinks to this, which keeps the library small. */
const MAX_SIDE_PX = 2400;

export interface PreparedImage {
  readonly bytes: Uint8Array;
  readonly type: ImageType;
  /** The stored picture's size in pixels, for its shape on the page. */
  readonly width: number;
  readonly height: number;
}

/**
 * Turns a picture file into one the library stores: a PNG or a JPEG, at most MAX_SIDE_PX on its longest side.
 * A PNG or JPEG already that size is kept byte for byte. Anything else the browser can decode is redrawn as a PNG.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const fits = Math.max(width, height) <= MAX_SIDE_PX;
    if (fits && (file.type === "image/png" || file.type === "image/jpeg")) {
      return { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type, width, height };
    }
    const ratio = Math.min(1, MAX_SIDE_PX / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type: ImageType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    if (blob === null) throw new Error("The picture could not be read.");
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

/** The first picture in a paste or a drop, if there is one. */
export function imageFileIn(data: DataTransfer | null): File | undefined {
  return [...(data?.files ?? [])].find((file) => file.type.startsWith("image/"));
}

export interface ImageCache {
  /** An object URL for a stored picture. Each picture is read from the library once. */
  readonly url: (name: string) => Promise<string>;
  readonly dispose: () => void;
}

export function createImageCache(library: Library, lectureId: string): ImageCache {
  const urls = new Map<string, Promise<string>>();
  return {
    url(name) {
      let url = urls.get(name);
      if (url === undefined) {
        url = library
          .getImage(lectureId, name)
          .then((bytes) => URL.createObjectURL(new Blob([bytes.slice()], { type: name.endsWith(".png") ? "image/png" : "image/jpeg" })));
        // A failed read is retried the next time the picture is drawn.
        url.catch(() => urls.delete(name));
        urls.set(name, url);
      }
      return url;
    },
    dispose() {
      for (const url of urls.values()) void url.then(URL.revokeObjectURL, () => undefined);
      urls.clear();
    },
  };
}
