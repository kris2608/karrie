/** Paths that must not fall back to the SPA shell via the service worker. */
export const MARKETING_NAV_FALLBACK_DENYLIST = [
  /^\/api\//,
  /^\/privacy\.html$/,
  /^\/ontdek(?:\.html)?\/?$/,
  /^\/over(?:\.html)?\/?$/,
  /^\/boodschappen-met-kinderen(?:\.html)?\/?$/,
  /^\/boodschappenlijstje-met-plaatjes(?:\.html)?\/?$/,
  /^\/robots\.txt$/,
  /^\/sitemap(?:\.xml)?\/?$/,
] as const;

/** Clean public URLs rewritten to static HTML on Render (before SPA catch-all). */
export const MARKETING_RENDER_REWRITES = [
  { source: "/ontdek", destination: "/ontdek.html" },
  { source: "/over", destination: "/over.html" },
  { source: "/boodschappen-met-kinderen", destination: "/boodschappen-met-kinderen.html" },
  { source: "/boodschappenlijstje-met-plaatjes", destination: "/boodschappenlijstje-met-plaatjes.html" },
  { source: "/sitemap", destination: "/sitemap.xml" },
] as const;
