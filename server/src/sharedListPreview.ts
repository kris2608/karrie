import type { SharedListPayload } from "./sharedLists.js";

const RETAILER_LABEL: Record<string, string> = {
  albert_heijn: "Albert Heijn",
  jumbo: "Jumbo",
  lidl: "Lidl",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Short Dutch summary for OG / share cards: name · shop · N producten. */
export function sharedListSummary(list: SharedListPayload): { title: string; description: string } {
  const store = list.retailer ? RETAILER_LABEL[list.retailer] ?? list.retailer : undefined;
  const count = list.items.length === 1 ? "1 product" : `${list.items.length} producten`;
  const name = list.name?.trim() || undefined;
  const bits = [name, store, count].filter((part): part is string => Boolean(part));
  return {
    title: name || store || "Boodschappenlijstje",
    description: bits.join(" · ") || "Boodschappenlijstje via Karrie",
  };
}

/** HTML WhatsApp/Facebook can scrape; browsers are sent on to the SPA `/l/{id}` page. */
export function sharedListPreviewHtml(list: SharedListPayload, id: string, appOrigin: string): string {
  const openUrl = `${appOrigin.replace(/\/$/, "")}/l/${id}`;
  const { title, description } = sharedListSummary(list);
  const safeTitle = escapeHtml(`${title} · Karrie`);
  const safeDescription = escapeHtml(description);
  const safeOpen = escapeHtml(openUrl);
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}" />
  <meta name="robots" content="noindex, nofollow" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Karrie" />
  <meta property="og:locale" content="nl_NL" />
  <meta property="og:url" content="${safeOpen}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="https://www.karrie.eu/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="${safeOpen}" />
  <meta http-equiv="refresh" content="0;url=${safeOpen}" />
</head>
<body>
  <p><a href="${safeOpen}">Lijstje openen in Karrie</a></p>
  <script>location.replace(${JSON.stringify(openUrl)});</script>
</body>
</html>`;
}
