import { coverLayout } from "./barcodeGeometry";

export type Size = { width: number; height: number };

export type CropRect = { sx: number; sy: number; sw: number; sh: number };

export type GuideInset = { top: number; right: number; bottom: number; left: number };

/** Must match `.camera-frame .scanner-corners { inset: 7% 8%; }` in styles.css. */
export const CAMERA_GUIDE_INSET: GuideInset = { top: 0.07, right: 0.08, bottom: 0.07, left: 0.08 };

export const PHOTO_RULES = {
  uploadMaxSide: 1024,
  uploadQuality: 0.82,
  savedMaxSide: 512,
  savedQuality: 0.8,
  /** Width / height of the outer camera frame (CSS aspect-ratio). */
  frameAspect: 3 / 4,
  stillTimeoutMs: 3000,
};

/** The centred part of an image with the given aspect, as object-fit: cover shows it. */
export function centerCrop(size: Size, aspect: number): CropRect {
  let sw = size.width;
  let sh = sw / aspect;
  if (sh > size.height) {
    sh = size.height;
    sw = sh * aspect;
  }
  return { sx: (size.width - sw) / 2, sy: (size.height - sh) / 2, sw, sh };
}

/**
 * Source pixels that fill the corner-marker guide inside a cover-fitted preview box.
 * Falls back to a full-frame center crop when the box size is unknown.
 */
export function guideCrop(video: Size, frameBox: Size | null | undefined, inset: GuideInset = CAMERA_GUIDE_INSET): CropRect {
  if (!frameBox?.width || !frameBox.height) {
    const outer = centerCrop(video, PHOTO_RULES.frameAspect);
    return insetCrop(outer, inset);
  }
  const layout = coverLayout(video.width, video.height, frameBox.width, frameBox.height);
  if (!layout) return centerCrop(video, PHOTO_RULES.frameAspect);

  const guideX = frameBox.width * inset.left;
  const guideY = frameBox.height * inset.top;
  const guideW = frameBox.width * (1 - inset.left - inset.right);
  const guideH = frameBox.height * (1 - inset.top - inset.bottom);

  const sx = ((guideX - layout.offsetX) / layout.renderW) * video.width;
  const sy = ((guideY - layout.offsetY) / layout.renderH) * video.height;
  const sw = (guideW / layout.renderW) * video.width;
  const sh = (guideH / layout.renderH) * video.height;

  return clampRect({ sx, sy, sw, sh }, video);
}

/** Scale a video-space crop onto a still that shares the same field of view. */
export function mapCropToStill(videoCrop: CropRect, video: Size, still: Size): CropRect {
  const sx = (videoCrop.sx / video.width) * still.width;
  const sy = (videoCrop.sy / video.height) * still.height;
  const sw = (videoCrop.sw / video.width) * still.width;
  const sh = (videoCrop.sh / video.height) * still.height;
  return clampRect({ sx, sy, sw, sh }, still);
}

/**
 * @deprecated Prefer guideCrop + mapCropToStill. Kept for callers that still pass aspect alone.
 */
export function matchCrop(video: Size, still: Size, aspect: number): CropRect {
  return mapCropToStill(centerCrop(video, aspect), video, still);
}

export function fullRect(size: Size): CropRect {
  return { sx: 0, sy: 0, sw: size.width, sh: size.height };
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
export async function renderCrop(source: CanvasImageSource, rect: CropRect, maxSide: number, quality: number): Promise<Blob> {
  const size = outputSize(rect, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoDecodeError("no canvas");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, size.width, size.height);
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

export async function processPhoto(source: CanvasImageSource, rect: CropRect): Promise<ProcessedPhoto> {
  const [upload, saved] = await Promise.all([
    renderCrop(source, rect, PHOTO_RULES.uploadMaxSide, PHOTO_RULES.uploadQuality),
    renderCrop(source, rect, PHOTO_RULES.savedMaxSide, PHOTO_RULES.savedQuality),
  ]);
  return { upload, saved };
}

type StillCapture = { takePhoto(): Promise<Blob> };
type StillCaptureClass = new (track: MediaStreamTrack) => StillCapture;

async function takeStill(track: MediaStreamTrack | null): Promise<HTMLImageElement | null> {
  const Capture = (globalThis as { ImageCapture?: StillCaptureClass }).ImageCapture;
  if (!track || !Capture || track.readyState !== "live") return null;
  try {
    const blob = await Promise.race([
      new Capture(track).takePhoto(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PHOTO_RULES.stillTimeoutMs)),
    ]);
    return blob ? await decodePhoto(blob) : null;
  } catch {
    return null;
  }
}

function insetCrop(outer: CropRect, inset: GuideInset): CropRect {
  const sx = outer.sx + outer.sw * inset.left;
  const sy = outer.sy + outer.sh * inset.top;
  const sw = outer.sw * (1 - inset.left - inset.right);
  const sh = outer.sh * (1 - inset.top - inset.bottom);
  return { sx, sy, sw, sh };
}

function clampRect(rect: CropRect, size: Size): CropRect {
  const sx = Math.max(0, Math.min(size.width - 1, rect.sx));
  const sy = Math.max(0, Math.min(size.height - 1, rect.sy));
  const sw = Math.max(1, Math.min(size.width - sx, rect.sw));
  const sh = Math.max(1, Math.min(size.height - sy, rect.sh));
  return { sx, sy, sw, sh };
}

/**
 * Crop to the corner-marker guide. Uses a sharper ImageCapture still when the
 * browser offers one with matching orientation; otherwise the live video frame.
 */
export async function capturePhoto(
  video: HTMLVideoElement,
  track: MediaStreamTrack | null,
  frameEl?: HTMLElement | null,
): Promise<ProcessedPhoto> {
  const frame = { width: video.videoWidth, height: video.videoHeight };
  if (!frame.width || !frame.height) throw new PhotoDecodeError("no frame");
  const box = frameEl?.getBoundingClientRect();
  const frameBox = box && box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : null;
  const videoCrop = guideCrop(frame, frameBox);

  const still = await takeStill(track);
  if (still) {
    const size = { width: still.naturalWidth, height: still.naturalHeight };
    const sameOrientation = size.width > size.height === frame.width > frame.height;
    try {
      if (sameOrientation) return await processPhoto(still, mapCropToStill(videoCrop, frame, size));
    } finally {
      releasePhoto(still);
    }
  }
  return processPhoto(video, videoCrop);
}
