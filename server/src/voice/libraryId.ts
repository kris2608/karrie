/** Filename salt includes the instruction version so an old marin URL cannot be reused. */
export function libraryFileId(text: string, version: string): string {
  let hash = 2166136261;
  const normalized = `${version}|${text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()}`;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
