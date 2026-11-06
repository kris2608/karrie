import type { DecodeHintType as Hint } from "@zxing/library";
import { canonicalEan, type EanFormat } from "../../domain/ean";

export type Decoded = { code: string; format: EanFormat };
type Decode = (canvas: HTMLCanvasElement) => Promise<Decoded | null>;
export type BarcodeReader = { live: Decode; still: Decode };

export const READER_RULES = {
  intervalMs: 300,
  /** Barcodes are wide: a wide centre band, scaled down, is enough and keeps each decode cheap. */
  cropWidth: 0.85,
  cropHeight: 0.5,
  liveWidth: 960,
  stillSide: 1600,
};

const NATIVE: Record<string, EanFormat> = { ean_13: "ean-13", ean_8: "ean-8", upc_a: "upc-a", upc_e: "upc-e" };

type NativeDetector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string; format: string }[]> };
type NativeDetectorClass = { new (options: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> };

/** Android Chrome has a built-in detector; it is faster and lighter than decoding in JavaScript. */
async function nativeReader(): Promise<BarcodeReader | null> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Native) return null;
  try {
    const supported = (await Native.getSupportedFormats?.()) ?? [];
    const formats = Object.keys(NATIVE).filter((format) => supported.includes(format));
    if (!formats.includes("ean_13")) return null;
    const detector = new Native({ formats });
    const decode: Decode = async (canvas) => {
      const hit = (await detector.detect(canvas)).find((entry) => NATIVE[entry.format]);
      return hit ? { code: hit.rawValue, format: NATIVE[hit.format] } : null;
    };
    return { live: decode, still: decode };
  } catch {
    return null;
  }
}

/** iOS Safari and others: ZXing, loaded only when the camera opens. */
async function zxingReader(): Promise<BarcodeReader> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const formats: Partial<Record<number, EanFormat>> = {
    [BarcodeFormat.EAN_13]: "ean-13",
    [BarcodeFormat.EAN_8]: "ean-8",
    [BarcodeFormat.UPC_A]: "upc-a",
    [BarcodeFormat.UPC_E]: "upc-e",
  };
  const reader = (tryHarder: boolean) => {
    const hints = new Map<Hint, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
      [DecodeHintType.TRY_HARDER, tryHarder],
    ]);
    const zxing = new BrowserMultiFormatReader(hints);
    return async (canvas: HTMLCanvasElement): Promise<Decoded | null> => {
      try {
        const result = zxing.decodeFromCanvas(canvas);
        const format = formats[result.getBarcodeFormat()];
        return format ? { code: result.getText(), format } : null;
      } catch {
        return null;
      }
    };
  };
  return { live: reader(false), still: reader(true) };
}

let shared: Promise<BarcodeReader | null> | null = null;

/** One reader for the whole app; null when neither the native detector nor ZXing can load. */
export function barcodeReader(): Promise<BarcodeReader | null> {
  shared ??= nativeReader()
    .then((native) => native ?? zxingReader())
    .catch(() => {
      shared = null;
      return null;
    });
  return shared;
}

/**
 * Accepts a code once it was read twice without another code in between, and reports each code
 * only once per camera session. A misread digit rarely repeats, so this keeps false codes out.
 */
export function createConfirmation() {
  let last: string | null = null;
  const reported = new Set<string>();
  return (hit: Decoded | null): string | null => {
    if (!hit) return null;
    const ean = canonicalEan(hit.code, hit.format);
    if (!ean || ean !== last) {
      last = ean;
      return null;
    }
    if (reported.has(ean)) return null;
    reported.add(ean);
    return ean;
  };
}

/** Draws the wide centre band of the source, scaled down, into the canvas. */
export function drawBand(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement, maxWidth: number): boolean {
  if (!width || !height) return false;
  const cropW = Math.round(width * READER_RULES.cropWidth);
  const cropH = Math.round(height * READER_RULES.cropHeight);
  const scale = Math.min(1, maxWidth / cropW);
  canvas.width = Math.round(cropW * scale);
  canvas.height = Math.round(cropH * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(source, (width - cropW) / 2, (height - cropH) / 2, cropW, cropH, 0, 0, canvas.width, canvas.height);
  return true;
}

/** A barcode in a gallery picture: the whole picture first, scaled down, then the centre band. */
export async function decodeStill(image: HTMLImageElement): Promise<string | null> {
  const reader = await barcodeReader();
  if (!reader) return null;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, READER_RULES.stillSide / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const attempt of [() => true, () => drawBand(image, width, height, canvas, READER_RULES.stillSide)]) {
    if (!attempt()) continue;
    const hit = await reader.still(canvas).catch(() => null);
    const ean = hit && canonicalEan(hit.code, hit.format);
    if (ean) return ean;
  }
  return null;
}
