export const STICKERS = [
  { id: "ster", label: "Ster" },
  { id: "appel", label: "Appel" },
  { id: "banaan", label: "Banaan" },
  { id: "brood", label: "Brood" },
  { id: "melk", label: "Melk" },
  { id: "kar", label: "Karrie" },
] as const;

export type StickerId = (typeof STICKERS)[number]["id"];

export function nextSticker(earned: string[]): StickerId {
  return STICKERS.find((sticker) => !earned.includes(sticker.id))?.id ?? STICKERS[0].id;
}

export function stickerLabel(id: string): string {
  return STICKERS.find((sticker) => sticker.id === id)?.label ?? "Sticker";
}

/** The home preview: how many different stickers there are, the newest few first, and how many more are in the book. */
export function stickerPreview(earned: string[], max = 5) {
  const unique = [...new Set(earned)];
  return { count: unique.length, shown: unique.slice(-max).reverse(), more: Math.max(0, unique.length - max) };
}
