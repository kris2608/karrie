export type Size = { width: number; height: number };

export type CropRect = { sx: number; sy: number; sw: number; sh: number };

export const PHOTO_RULES = {
  uploadMaxSide: 1024,
  uploadQuality: 0.82,
  savedMaxSide: 512,
  savedQuality: 0.8,
  /** Width / height of the camera frame the parent sees. */
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
 * A full-resolution still usually has the video's horizontal field of view with
 * more height. Cropping the same width fraction keeps what the parent saw.
 */
export function matchCrop(video: Size, still: Size, aspect: number): CropRect {
  const fraction = centerCrop(video, aspect).sw / video.width;
  let sw = still.width * fraction;
  let sh = sw / aspect;
  if (sh > still.height) {
    sh = still.height;
    sw = sh * aspect;
  }
  return { sx: (still.width - sw) / 2, sy: (still.height - sh) / 2, sw, sh };
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

/** Sharper full-resolution still where the browser offers it, otherwise the current video frame. */
export async function capturePhoto(video: HTMLVideoElement, track: MediaStreamTrack | null): Promise<ProcessedPhoto> {
  const frame = { width: video.videoWidth, height: video.videoHeight };
  if (!frame.width || !frame.height) throw new PhotoDecodeError("no frame");
  const still = await takeStill(track);
  if (still) {
    const size = { width: still.naturalWidth, height: still.naturalHeight };
    const sameOrientation = size.width > size.height === frame.width > frame.height;
    try {
      if (sameOrientation) return await processPhoto(still, matchCrop(frame, size, PHOTO_RULES.frameAspect));
    } finally {
      releasePhoto(still);
    }
  }
  return processPhoto(video, centerCrop(frame, PHOTO_RULES.frameAspect));
}
