export type EanFormat = "ean-13" | "ean-8" | "upc-a" | "upc-e";

export function cleanEan(value: string): string {
  return value.replace(/\D/g, "");
}

function checkDigit(body: string): number {
  let sum = 0;
  for (let index = 0; index < body.length; index += 1) {
    const digit = Number(body[body.length - 1 - index]);
    sum += index % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

function checksumOk(code: string): boolean {
  return checkDigit(code.slice(0, -1)) === Number(code.at(-1));
}

export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [system, d1, d2, d3, d4, d5, d6, check] = code;
  let body: string;
  if (d6 === "0" || d6 === "1" || d6 === "2") body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === "3") body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === "4") body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${system}${body}${check}`;
}

export function eanFormat(value: string, hint?: EanFormat): EanFormat | null {
  const code = cleanEan(value);
  if (code !== value.trim()) return null;
  if (code.length === 13 && checksumOk(code)) return "ean-13";
  if (code.length === 12 && checksumOk(code)) return "upc-a";
  if (code.length === 8) {
    if (hint === "upc-e") {
      const expanded = expandUpcE(code);
      return expanded && checksumOk(expanded) ? "upc-e" : null;
    }
    if (checksumOk(code)) return "ean-8";
  }
  return null;
}

export function isValidEan(value: string, hint?: EanFormat): boolean {
  return eanFormat(value, hint) !== null;
}

/** Brings a valid code into the 13- or 8-digit form Open Food Facts uses. */
export function canonicalEan(value: string, hint?: EanFormat): string | null {
  const code = cleanEan(value);
  const format = eanFormat(code, hint);
  if (format === "ean-13" || format === "ean-8") return code;
  if (format === "upc-a") return `0${code}`;
  if (format === "upc-e") return `0${expandUpcE(code)}`;
  return null;
}

export function sameEan(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const a = canonicalEan(left) ?? cleanEan(left);
  const b = canonicalEan(right) ?? cleanEan(right);
  return a.length > 0 && a === b;
}
