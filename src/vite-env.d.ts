/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Public origin of karrie-api, e.g. https://karrie-api.onrender.com. Empty means same origin (dev proxy). */
  readonly VITE_API_ORIGIN?: string;
  /** Official Nutri-Score logos are on by default; set to "off" to show the text/pill fallback instead. */
  readonly VITE_NUTRISCORE_LOGOS?: string;
}

interface Window {
  /** Umami Cloud tracker; only present on the production site. */
  umami?: { track(name: string, data?: Record<string, string | number>): unknown };
}
