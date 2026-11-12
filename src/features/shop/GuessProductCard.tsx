import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { ItemArt } from "../../components/ItemArt";
import { PressButton } from "../../components/ui/PressButton";
import { productHeading } from "../../domain/productHeading";
import type { AdventureItem } from "../../domain/types";
import { fadeOnly, popIn } from "../../motion/variants";

type GuessProductCardProps = {
  item: AdventureItem;
  distractor: AdventureItem;
  reduced: boolean;
  onCorrect: () => void;
  onSkip: () => void;
};

/** Offline "Raad het product": hide the name, pick the matching pack photo. */
export function GuessProductCard({ item, distractor, reduced, onCorrect, onSkip }: GuessProductCardProps) {
  const [wrong, setWrong] = useState(false);
  const title = productHeading({ name: item.name, brand: item.brand, packageSize: item.packageSize }).title;
  const choices = useMemo(() => {
    const pair = [
      { item, correct: true },
      { item: distractor, correct: false },
    ];
    // Stable left/right from item id so reload does not flip the answer.
    let hash = 0;
    for (let i = 0; i < item.id.length; i += 1) hash = (hash + item.id.charCodeAt(i) * (i + 1)) % 2;
    return hash === 0 ? pair : pair.reverse();
  }, [item, distractor]);

  return (
    <motion.div className="mission-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
      <motion.section
        className="mission guess-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guess-title"
        data-testid="guess-card"
        variants={reduced ? fadeOnly : popIn}
        initial="hidden"
        animate="shown"
        exit="gone"
      >
        <h2 id="guess-title">Raad het product!</h2>
        <p className="mission-prompt">
          Waar is de <strong>{title}</strong>?
        </p>
        <div className="guess-choices" role="group" aria-label={`Tik op ${title}`}>
          {choices.map((choice) => (
            <button
              key={choice.item.id}
              type="button"
              className="guess-choice"
              data-testid={choice.correct ? "guess-correct" : "guess-wrong"}
              aria-label={productHeading({ name: choice.item.name, brand: choice.item.brand, packageSize: choice.item.packageSize }).title}
              onClick={() => {
                if (choice.correct) {
                  setWrong(false);
                  onCorrect();
                  return;
                }
                setWrong(true);
              }}
            >
              <ItemArt item={choice.item} />
            </button>
          ))}
        </div>
        {wrong && (
          <p className="guess-retry" data-testid="guess-retry" role="status">
            Bijna! Probeer het andere plaatje.
          </p>
        )}
        <div className="mission-actions">
          <PressButton variant="quiet" wide data-testid="guess-skip" onClick={onSkip}>
            Nu niet
          </PressButton>
        </div>
      </motion.section>
    </motion.div>
  );
}
