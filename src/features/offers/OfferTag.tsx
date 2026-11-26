import { motion } from "motion/react";
import { ATTRIBUTION_URL, type Shown } from "../../domain/offers";
import { retailerName, type RetailerId } from "../../domain/retailers";

export function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6a1.5 1.5 0 0 1 1.06.44l6.9 6.9a1.5 1.5 0 0 1 0 2.12l-7.6 7.6a1.5 1.5 0 0 1-2.12 0l-6.9-6.9a1.5 1.5 0 0 1-.44-1.06z"
        fill="currentColor"
      />
      <circle cx="8.2" cy="8.2" r="1.7" fill="#fff" />
    </svg>
  );
}

export function offerBadgeText(shown: Shown): string {
  return shown === "deal" ? "Aanbieding" : "Actie?";
}

/** Full meaning for the accessible name and the tooltip. */
export function offerMeaning(shown: Shown): string {
  return shown === "deal" ? "In de aanbieding" : "Mogelijk in de aanbieding";
}

export function offerLabel(shown: Shown, retailer: RetailerId): string {
  return shown === "deal" ? `In de aanbieding bij ${retailerName(retailer)}` : `Mogelijk in de aanbieding bij ${retailerName(retailer)}`;
}

/**
 * A small tag that pops in once. A possible offer is "Actie?" so it stays one compact badge.
 * Compact tags (on product tiles) show only the icon.
 */
export function OfferTag({ shown, retailer, className, compact = false }: { shown: Shown; retailer: RetailerId; className?: string; compact?: boolean }) {
  const classes = ["offer-tag", shown === "maybe" ? "is-maybe" : "", compact ? "is-compact" : "", className ?? ""].filter(Boolean).join(" ");
  const meaning = shown === "maybe" ? offerMeaning(shown) : offerLabel(shown, retailer);
  return (
    <motion.span
      className={classes}
      role="img"
      aria-label={meaning}
      title={meaning}
      data-testid="offer-tag"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 26 }}
    >
      <TagIcon />
      {!compact && <span aria-hidden="true">{offerBadgeText(shown)}</span>}
    </motion.span>
  );
}

export function Attribution({ className }: { className?: string }) {
  return (
    <small className={["offer-attribution", className ?? ""].filter(Boolean).join(" ")}>
      Aanbiedingen via{" "}
      <a href={ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">
        PrijsProfeet
      </a>
    </small>
  );
}
