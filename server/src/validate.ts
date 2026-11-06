export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1_500_000;
export const MIN_IMAGE_BYTES = 1_000;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export type ImageCheck =
  | { ok: true; dataUrl: string; type: ImageType; bytes: number }
  | { ok: false; status: 400 | 413 | 415; code: "bad-request" | "too-large" | "unsupported-type" };

const DATA_URL = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

function matchesMagic(type: ImageType, head: Buffer): boolean {
  if (type === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (type === "image/png") return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP";
}

/** Accepts only a base64 data URL whose bytes really are a JPEG, PNG or WebP. */
export function checkImage(body: unknown): ImageCheck {
  if (!body || typeof body !== "object" || typeof (body as { image?: unknown }).image !== "string") {
    return { ok: false, status: 400, code: "bad-request" };
  }
  const dataUrl = (body as { image: string }).image;
  const match = DATA_URL.exec(dataUrl);
  if (!match) return { ok: false, status: 400, code: "bad-request" };
  const type = match[1];
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") {
    return { ok: false, status: 415, code: "unsupported-type" };
  }
  const bytes = Math.floor((match[2].length * 3) / 4) - (match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, status: 413, code: "too-large" };
  if (bytes < MIN_IMAGE_BYTES) return { ok: false, status: 400, code: "bad-request" };
  const head = Buffer.from(match[2].slice(0, 24), "base64");
  if (!matchesMagic(type, head)) return { ok: false, status: 415, code: "unsupported-type" };
  return { ok: true, dataUrl, type, bytes };
}
