/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Public origin of karrie-api, e.g. https://karrie-api.onrender.com. Empty means same origin (dev proxy). */
  readonly VITE_API_ORIGIN?: string;
}
