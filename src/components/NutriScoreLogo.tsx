/** Official Nutri-Score horizontal logos (Santé publique France via Open Food Facts). */

export type NutriScoreLetter = "A" | "B" | "C" | "D" | "E";

/** True unless the build explicitly disables trademark artwork. */
export function nutriScoreLogosEnabled(): boolean {
  return import.meta.env.VITE_NUTRISCORE_LOGOS !== "off";
}

export function nutriScoreGrade(value?: string | null): NutriScoreLetter | null {
  if (typeof value !== "string") return null;
  const letter = value.trim().toUpperCase();
  return /^[A-E]$/.test(letter) ? (letter as NutriScoreLetter) : null;
}

export function nutriScoreSrc(grade: NutriScoreLetter): string {
  return `/nutriscore/nutriscore-${grade.toLowerCase()}.svg`;
}

type NutriScoreLogoProps = {
  grade?: string | null;
  className?: string;
};

/**
 * Official Nutri-Score mark. Returns null when the grade is missing/invalid or logos are disabled.
 */
export function NutriScoreLogo({ grade, className }: NutriScoreLogoProps) {
  const letter = nutriScoreGrade(grade);
  if (!letter || !nutriScoreLogosEnabled()) return null;
  return (
    <img
      className={["nutri-score-logo", className].filter(Boolean).join(" ")}
      src={nutriScoreSrc(letter)}
      width={160}
      height={87}
      alt=""
      role="img"
      aria-label={`Nutri-Score ${letter}`}
      data-testid="nutri-score"
      draggable={false}
    />
  );
}

/** Parent-only: official logo when enabled, otherwise the compact text label. */
export function NutriScoreMark({ grade, className }: NutriScoreLogoProps) {
  const letter = nutriScoreGrade(grade);
  if (!letter) return null;
  if (nutriScoreLogosEnabled()) return <NutriScoreLogo grade={letter} className={className} />;
  return (
    <small className={className} data-testid="nutri-score" aria-label={`Nutri-Score ${letter}`}>
      Nutri-Score {letter}
    </small>
  );
}
