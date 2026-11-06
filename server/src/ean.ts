/** Mirrors src/domain/ean.ts for the codes the app sends: EAN-13, EAN-8 and UPC-A, digits only. */
function checksumOk(code: string): boolean {
  let sum = 0;
  for (let index = 1; index < code.length; index += 1) {
    const digit = Number(code[code.length - 1 - index]);
    sum += index % 2 === 1 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10 === Number(code.at(-1));
}

/** The 13- or 8-digit form Open Food Facts uses, or null for anything that is not a valid barcode. */
export function canonicalEan(value: unknown): string | null {
  if (typeof value !== "string" || !/^(\d{8}|\d{12}|\d{13})$/.test(value) || !checksumOk(value)) return null;
  return value.length === 12 ? `0${value}` : value;
}

/** The forms a shop page may print the same code in: with and without the leading zero of a UPC. */
export function eanForms(ean: string): string[] {
  return ean.length === 13 && ean.startsWith("0") ? [ean, ean.slice(1)] : [ean];
}
