import { motion } from "motion/react";
import { ItemArt } from "../../components/ItemArt";
import { AttributeBadge } from "../../components/ui/AttributeBadge";
import { PressButton } from "../../components/ui/PressButton";
import { StarIcon } from "../../components/ui/StarIcon";
import { badgeFor } from "../../domain/discovery";
import { SCORING } from "../../domain/scoring";
import type { AdventureItem } from "../../domain/types";
import { productById } from "../../data/catalog";
import { fadeOnly, missionCard, missionChip, popIn } from "../../motion/variants";

type MissionCardProps = {
  item: AdventureItem;
  reduced: boolean;
  onGo: () => void;
  onSkip: () => void;
};

export function MissionCard({ item, reduced, onGo, onSkip }: MissionCardProps) {
  const assessment = item.alternative;
  const target = assessment?.targetType;
  if (!assessment || !target) return null;
  const card = reduced ? fadeOnly : missionCard;

  return (
    <motion.div className="mission-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
      <motion.section
        className="mission"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-title"
        data-testid="mission-card"
        variants={reduced ? fadeOnly : popIn}
        initial="hidden"
        animate="shown"
        exit="gone"
      >
        <h2 id="mission-title">Ik heb een bonusmissie!</h2>
        <div className="mission-pair">
          <motion.figure className="mission-side" custom={-1} variants={card} initial="hidden" animate="shown">
            <span className="mission-art">
              <ItemArt item={item} />
            </span>
            <figcaption>{item.name}</figcaption>
          </motion.figure>
          <span className="mission-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <motion.figure className="mission-side is-target" custom={1} variants={card} initial="hidden" animate="shown">
            <span className="mission-art">
              <ItemArt item={{ icon: target, name: productById(target)?.name ?? "" }} />
              <AttributeBadge kind={badgeFor(assessment)} />
              <em className="mission-tag">voorbeeld</em>
            </span>
            <figcaption>{assessment.alternativeType}</figcaption>
          </motion.figure>
        </div>
        {assessment.childPrompt && <p className="mission-prompt">{assessment.childPrompt}</p>}
        <motion.span className="mission-chip" variants={reduced ? fadeOnly : missionChip} initial="hidden" animate="shown" aria-label={`${SCORING.discoveryBonus} extra sterren`}>
          <StarIcon />+{SCORING.discoveryBonus}
        </motion.span>
        <div className="mission-actions">
          <PressButton autoFocus variant="go" size="l" wide data-testid="mission-go" onClick={onGo}>
            Op zoek!
          </PressButton>
          <PressButton variant="quiet" wide data-testid="mission-skip" onClick={onSkip}>
            Nu niet
          </PressButton>
        </div>
      </motion.section>
    </motion.div>
  );
}

type ParentCheckProps = {
  item: AdventureItem;
  onAlternative: () => void;
  onOriginal: () => void;
  onNotYet: () => void;
};

/** The parent decides; the child gets the bonus either way. */
export function ParentCheck({ item, onAlternative, onOriginal, onNotYet }: ParentCheckProps) {
  const assessment = item.alternative;
  return (
    <>
      <h2>Voor de ouder</h2>
      <p className="sheet-note">
        Bonusmissie: {assessment?.alternativeType ?? "een vergelijkbaar product"}. Kijk samen op het etiket. Jullie kind krijgt de bonussterren in elk geval.
      </p>
      {assessment?.parentExplanation && <p className="sheet-note mission-why">{assessment.parentExplanation}</p>}
      <PressButton variant="primary" wide data-testid="mission-take" onClick={onAlternative}>
        Gevonden, deze nemen we
      </PressButton>
      <PressButton variant="secondary" wide data-testid="mission-keep" onClick={onOriginal}>
        Gevonden, we houden de oude
      </PressButton>
      <PressButton variant="quiet" wide data-testid="mission-not-yet" onClick={onNotYet}>
        Nog niet
      </PressButton>
    </>
  );
}
