/** Allowlisted campaign query params — never arbitrary URL search. */
export const CAMPAIGN_PARAMS = ["utm_source", "utm_medium", "utm_campaign"] as const;

export type CampaignParam = (typeof CAMPAIGN_PARAMS)[number];
export type CampaignAttribution = Partial<Record<CampaignParam, string>>;

const STORAGE_KEY = "karrie.campaign";
/** Session-scoped attribution; cleared when the tab session ends. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Stored = { at: number; attrs: CampaignAttribution };

const SAFE = /^[a-zA-Z0-9._-]{1,64}$/;

export function parseCampaignParams(search: string): CampaignAttribution {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const attrs: CampaignAttribution = {};
  for (const key of CAMPAIGN_PARAMS) {
    const raw = params.get(key)?.trim() ?? "";
    if (SAFE.test(raw)) attrs[key] = raw;
  }
  return attrs;
}

export function hasAttribution(attrs: CampaignAttribution): boolean {
  return CAMPAIGN_PARAMS.some((key) => Boolean(attrs[key]));
}

function defaultStorage(): Storage | undefined {
  try {
    if (typeof sessionStorage === "undefined") return undefined;
    return sessionStorage;
  } catch {
    return undefined;
  }
}

export function readStoredAttribution(storage: Storage | undefined = defaultStorage()): CampaignAttribution {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || typeof parsed.at !== "number" || typeof parsed.attrs !== "object" || !parsed.attrs) return {};
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      storage.removeItem(STORAGE_KEY);
      return {};
    }
    return parseCampaignParams(
      CAMPAIGN_PARAMS.map((key) => (parsed.attrs[key] ? `${key}=${parsed.attrs[key]}` : "")).filter(Boolean).join("&"),
    );
  } catch {
    return {};
  }
}

export function storeAttribution(attrs: CampaignAttribution, storage: Storage | undefined = defaultStorage()): void {
  if (!storage || !hasAttribution(attrs)) return;
  try {
    const existing = readStoredAttribution(storage);
    const merged: CampaignAttribution = { ...existing, ...attrs };
    storage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), attrs: merged } satisfies Stored));
  } catch {
    // Storage may be unavailable; attribution is best-effort.
  }
}

/** Capture allowlisted UTMs from the current URL into sessionStorage. */
export function captureCampaignFromLocation(
  search: string = typeof window !== "undefined" ? window.location.search : "",
  storage: Storage | undefined = defaultStorage(),
): CampaignAttribution {
  const attrs = parseCampaignParams(search);
  if (hasAttribution(attrs)) storeAttribution(attrs, storage);
  return readStoredAttribution(storage);
}

export function attributionEventData(attrs?: CampaignAttribution): Record<string, string> | undefined {
  const resolved = attrs ?? readStoredAttribution();
  if (!hasAttribution(resolved)) return undefined;
  const data: Record<string, string> = {};
  for (const key of CAMPAIGN_PARAMS) {
    if (resolved[key]) data[key] = resolved[key]!;
  }
  return data;
}
