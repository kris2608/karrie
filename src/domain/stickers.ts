export const STICKERS = [
  { id: "ster", label: "Ster" },
  { id: "appel", label: "Appel" },
  { id: "banaan", label: "Banaan" },
  { id: "brood", label: "Brood" },
  { id: "melk", label: "Melk" },
  { id: "kar", label: "Karrrie" },
] as const;

export type StickerId = (typeof STICKERS)[number]["id"];

export function nextSticker(earned: string[]): StickerId {
  return STICKERS.find((sticker) => !earned.includes(sticker.id))?.id ?? STICKERS[0].id;
}

export function stickerLabel(id: string): string {
  return STICKERS.find((sticker) => sticker.id === id)?.label ?? "Sticker";
}
