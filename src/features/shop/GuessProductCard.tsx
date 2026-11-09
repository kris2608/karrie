import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { ItemArt } from "../../components/ItemArt";
import { PressButton } from "../../components/ui/PressButton";
import type { AdventureItem } from "../../domain/types";
import { productById } from "../../data/catalog";
import { fadeOnly, popIn } from "../../motion/variants";

type GuessProductCardProps = {
  item: AdventureItem;
  reduced: boolean;
  onCorrect: () => void;
  onSkip: () => void;
};

/** Offline "Raad het product": hide the name, pick the matching drawing. */
export function GuessProductCard({ item, reduced, onCorrect, onSkip }: GuessProductCardProps) {
  const distractorId = item.play?.distractorId;
  const [wrong, setWrong] = useState(false);
  const choices = useMemo(() => {
    if (!distractorId) return [{ id: item.productId, correct: true }];
    const pair = [
      { id: item.productId, correct: true },
      { id: distractorId, correct: false },
    ];
    // Stable left/right from item id so reload does not flip the answer.
    let hash = 0;
    for (let i = 0; i < item.id.length; i += 1) hash = (hash + item.id.charCodeAt(i) * (i + 1)) % 2;
    return hash === 0 ? pair : pair.reverse();
  }, [item.id, item.productId, distractorId]);

  if (!distractorId) return null;

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
          Waar is de <strong>{item.name}</strong>? Tik op het goede plaatje.
        </p>
        <div className="guess-choices" role="group" aria-label={`Tik op ${item.name}`}>
          {choices.map((choice) => {
            const label = productById(choice.id)?.name ?? choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                className="guess-choice"
                data-testid={choice.correct ? "guess-correct" : "guess-wrong"}
                aria-label={label}
                onClick={() => {
                  if (choice.correct) {
                    setWrong(false);
                    onCorrect();
                    return;
                  }
                  setWrong(true);
                }}
              >
                <ItemArt item={{ icon: choice.id, name: label }} />
              </button>
            );
          })}
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
