import { parseCampaignParams, type CampaignAttribution } from "./campaignAttribution";

/** Query string for the Instagram bio link. The visible URL keeps these params. */
export const IG_BIO_SEARCH = "?utm_source=instagram&utm_medium=social&utm_campaign=bio";

export function igBioDestination(): string {
  return `/${IG_BIO_SEARCH}`;
}

/** `/ig` and `/ig/` only. Longer paths stay on their own routes. */
export function isIgBioPath(pathname: string): boolean {
  return pathname === "/ig" || pathname === "/ig/";
}

/**
 * Campagne funnel event for a visit that already carries the bio params.
 * Returns null for every other query, including a bare Instagram source.
 */
export function igBioLandingEvent(search: string): {
  name: "landing_view";
  data: { page: "ig" } & CampaignAttribution;
} | null {
  const attrs = parseCampaignParams(search);
  if (attrs.utm_source !== "instagram" || attrs.utm_medium !== "social" || attrs.utm_campaign !== "bio") return null;
  return { name: "landing_view", data: { page: "ig", ...attrs } };
}
