export type ParsedChunk = {
  raw: string;
  quantity: number;
  query: string;
};

const LEADING_X = /^(\d+)\s*(?:x|×)\s*/i;
const TRAILING_X = /^(.*\D)\s*(?:x|×)\s*(\d+)\s*$/i;
const LEADING_NUMBER = /^(\d+)\s+/;
const AMOUNT = /\b\d+(?:[.,]\d+)?\s*(?:kilogram|kilo|kg|gram|gr|g|liters|liter|ml|l)\b/gi;
const LEADING_UNIT =
  /^(?:pakken|pak|stuks|stuk|bos|blikken|blik|flessen|fles|zakken|zak|liters|liter|kilo|kilogram|kg|gram|gr|ml|l)\s+/i;

function parseChunk(rawPart: string): ParsedChunk | null {
  const raw = rawPart.trim();
  if (!raw) return null;

  let quantity = 1;
  let text = raw;
  const leadX = text.match(LEADING_X);
  if (leadX) {
    quantity = Number(leadX[1]);
    text = text.slice(leadX[0].length);
  } else {
    const trailing = text.match(TRAILING_X);
    if (trailing) {
      quantity = Number(trailing[2]);
      text = trailing[1];
    } else {
      const leadNumber = text.match(LEADING_NUMBER);
      if (leadNumber) {
        quantity = Number(leadNumber[1]);
        text = text.slice(leadNumber[0].length);
      }
    }
  }

  text = text.replace(AMOUNT, " ").replace(LEADING_UNIT, " ").replace(/[:;]+$/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text || !/[a-zA-Zà-ÿ]/.test(text)) return null;

  return { raw, quantity: Math.max(1, Math.min(99, quantity)), query: text };
}

export function parseList(text: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.replace(/^\s*[-*•–]\s*/, "").trim();
    if (!cleaned) continue;
    const parts = cleaned.includes(",") ? cleaned.split(",") : [cleaned];
    for (const part of parts) {
      const parsed = parseChunk(part);
      if (parsed) chunks.push(parsed);
    }
  }
  return chunks;
}
