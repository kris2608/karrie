export type Size = { width: number; height: number };

/** Image centre offset from the frame centre, in frame pixels, plus zoom on top of "cover". */
export type CropView = { zoom: number; x: number; y: number };

export type CropRect = { sx: number; sy: number; sw: number; sh: number };

export const PHOTO_RULES = {
  uploadMaxSide: 1024,
  uploadQuality: 0.82,
  savedMaxSide: 512,
  savedQuality: 0.8,
  maxZoom: 4,
};

export const ASPECTS = { square: 1, portrait: 3 / 4 } as const;
export type AspectId = keyof typeof ASPECTS;

export function coverScale(image: Size, frame: Size): number {
  return Math.max(frame.width / image.width, frame.height / image.height);
}

export function clampView(view: CropView, image: Size, frame: Size): CropView {
  const zoom = Math.min(PHOTO_RULES.maxZoom, Math.max(1, view.zoom));
  const scale = coverScale(image, frame) * zoom;
  const maxX = Math.max(0, (image.width * scale - frame.width) / 2);
  const maxY = Math.max(0, (image.height * scale - frame.height) / 2);
  return { zoom, x: Math.min(maxX, Math.max(-maxX, view.x)), y: Math.min(maxY, Math.max(-maxY, view.y)) };
}

/** The part of the source image visible in the frame, in source pixels. */
export function cropRect(view: CropView, image: Size, frame: Size): CropRect {
  const { zoom, x, y } = clampView(view, image, frame);
  const scale = coverScale(image, frame) * zoom;
  const sw = Math.min(image.width, frame.width / scale);
  const sh = Math.min(image.height, frame.height / scale);
  const sx = Math.min(image.width - sw, Math.max(0, image.width / 2 - (frame.width / 2 + x) / scale));
  const sy = Math.min(image.height - sh, Math.max(0, image.height / 2 - (frame.height / 2 + y) / scale));
  return { sx, sy, sw, sh };
}

/** Output size that fits maxSide and never upscales the crop. */
export function outputSize(rect: CropRect, maxSide: number): Size {
  const factor = Math.min(1, maxSide / Math.max(rect.sw, rect.sh));
  return { width: Math.max(1, Math.round(rect.sw * factor)), height: Math.max(1, Math.round(rect.sh * factor)) };
}

export class PhotoDecodeError extends Error {}

/** Browsers apply the EXIF orientation when decoding into an img element. */
export async function decodePhoto(file: Blob): Promise<HTMLImageElement> {
  if (file.type && !file.type.startsWith("image/")) throw new PhotoDecodeError("not an image");
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new PhotoDecodeError("empty image");
    return image;
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoDecodeError("cannot decode");
  }
}

export function releasePhoto(image: HTMLImageElement) {
  if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
}

/** Redrawing on a canvas keeps only pixels: EXIF, GPS and other metadata are gone. */
export async function renderCrop(image: HTMLImageElement, rect: CropRect, maxSide: number, quality: number): Promise<Blob> {
  const size = outputSize(rect, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoDecodeError("no canvas");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new PhotoDecodeError("encode failed");
  return blob;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export type ProcessedPhoto = { upload: Blob; saved: Blob };

export async function processCrop(image: HTMLImageElement, rect: CropRect): Promise<ProcessedPhoto> {
  const [upload, saved] = await Promise.all([
    renderCrop(image, rect, PHOTO_RULES.uploadMaxSide, PHOTO_RULES.uploadQuality),
    renderCrop(image, rect, PHOTO_RULES.savedMaxSide, PHOTO_RULES.savedQuality),
  ]);
  return { upload, saved };
}
