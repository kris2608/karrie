import type { MissionBadge } from "../../domain/discovery";

const LABEL: Record<MissionBadge, string> = {
  hundred: "100%",
  grain: "volkoren",
  "no-sugar": "zonder toegevoegde suiker",
  "no-salt": "zonder toegevoegd zout",
  "less-fat": "minder verzadigd vet",
};

/** One small cue on the example drawing; it marks what to look for, not what is wrong. */
export function AttributeBadge({ kind }: { kind: MissionBadge }) {
  return (
    <span className={`attr-badge attr-${kind}`} role="img" aria-label={LABEL[kind]} data-testid="attribute-badge">
      {kind === "hundred" ? (
        <b>100%</b>
      ) : (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          {kind === "grain" && (
            <g fill="currentColor">
              <path d="M16 29V10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <ellipse cx="12.5" cy="12" rx="3" ry="4.6" transform="rotate(-28 12.5 12)" />
              <ellipse cx="19.5" cy="12" rx="3" ry="4.6" transform="rotate(28 19.5 12)" />
              <ellipse cx="12.5" cy="19" rx="3" ry="4.6" transform="rotate(-28 12.5 19)" />
              <ellipse cx="19.5" cy="19" rx="3" ry="4.6" transform="rotate(28 19.5 19)" />
              <ellipse cx="16" cy="6" rx="2.8" ry="4.2" />
            </g>
          )}
          {kind === "no-sugar" && (
            <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
              <path d="M9 12l7-4 7 4v9l-7 4-7-4z" />
              <path d="M9 12l7 4 7-4M16 16v9" />
              <path d="M6 26L26 6" strokeLinecap="round" />
            </g>
          )}
          {kind === "no-salt" && (
            <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M11 13h10l-1.5 14h-7z" strokeLinejoin="round" />
              <path d="M12 13c0-4 1.8-6 4-6s4 2 4 6" />
              <circle cx="14.5" cy="10" r="0.6" fill="currentColor" />
              <circle cx="17.5" cy="10" r="0.6" fill="currentColor" />
              <path d="M6 26L26 6" />
            </g>
          )}
          {kind === "less-fat" && (
            <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 6c4 6 7 9.5 7 13a7 7 0 0 1-14 0c0-3.5 3-7 7-13z" />
              <path d="M12 27l4 3 4-3" />
            </g>
          )}
        </svg>
      )}
    </span>
  );
}
