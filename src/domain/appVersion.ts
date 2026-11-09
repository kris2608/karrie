/** Shown under Voor ouders so parents (and support) can see which build is running. */
export function appVersionLabel(
  version = import.meta.env.VITE_APP_VERSION,
  build = import.meta.env.VITE_APP_BUILD,
): string {
  const ver = version?.trim() || "0.0.0";
  const stamp = build?.trim();
  return stamp ? `Versie ${ver} · ${stamp}` : `Versie ${ver}`;
}
