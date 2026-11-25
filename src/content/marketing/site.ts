/** Canonical public origin (Render 301 from apex → www; share links already use www). */
export const CANONICAL_ORIGIN = "https://www.karrie.eu";

export const OG_IMAGE = `${CANONICAL_ORIGIN}/og-image.png`;

export const PUBLIC_PATHS = {
  home: "/",
  ontdek: "/ontdek",
  over: "/over",
  tips: "/boodschappen-met-kinderen",
  visualList: "/boodschappenlijstje-met-plaatjes",
  privacy: "/privacy.html",
} as const;

export type PublicPathKey = keyof typeof PUBLIC_PATHS;

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${CANONICAL_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
