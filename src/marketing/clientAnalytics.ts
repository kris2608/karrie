import { attributionEventData, captureCampaignFromLocation, hasAttribution } from "../services/campaignAttribution";
import { trackEvent } from "../services/analytics";

/** Wire landing pageviews and CTA clicks on static marketing pages. */
export function initMarketingAnalytics(page: string): void {
  const attrs = captureCampaignFromLocation();
  const data = {
    page,
    ...(attributionEventData(attrs) ?? {}),
  };
  trackEvent({ name: "landing_view", data }, `landing-view:${page}`);

  document.querySelectorAll<HTMLAnchorElement>("[data-mkt-cta]").forEach((link) => {
    link.addEventListener("click", () => {
      const placement = link.getAttribute("data-mkt-cta") || "unknown";
      trackEvent({
        name: "landing_cta_clicked",
        data: {
          page,
          placement,
          ...(attributionEventData() ?? {}),
        },
      });
    });
  });

  if (hasAttribution(attrs)) {
    // Ensure session storage is warm before navigating into the SPA.
    captureCampaignFromLocation();
  }
}
