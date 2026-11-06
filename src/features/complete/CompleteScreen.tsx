import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Karrie } from "../../components/mascot/Karrie";
import { Chest } from "../../components/rewards/Chest";
import { celebrate } from "../../components/rewards/confetti";
import { StickerBadge } from "../../components/StickerBadge";
import { PressButton } from "../../components/ui/PressButton";
import { StarIcon } from "../../components/ui/StarIcon";
import { foundCount } from "../../domain/shopQueue";
import { stickerLabel } from "../../domain/stickers";
import { buzz } from "../../feedback/haptics";
import { playFanfare } from "../../feedback/sound";
import { softSpring } from "../../motion/variants";
import { useAdventure } from "../../state/AdventureContext";

const CHEST_AT = 0.5;

export function CompleteScreen() {
  const { adventure, saved, dispatch } = useAdventure();
  const navigate = useNavigate();
  const reduced = useReducedMotion() ?? false;
  const stars = adventure ? foundCount(adventure.items) : 0;
  const [shown, setShown] = useState(reduced ? stars : 0);
  const fired = useRef(false);

  useEffect(() => {
    if (!adventure || adventure.phase !== "done" || fired.current) return;
    fired.current = true;
    celebrate();
    playFanfare();
    buzz([20, 60, 30]);
  }, [adventure]);

  useEffect(() => {
    if (reduced) {
      setShown(stars);
      return;
    }
    const controls = animate(0, stars, {
      delay: CHEST_AT + 0.2,
      duration: Math.min(1.2, 0.25 + stars * 0.12),
      ease: "easeOut",
      onUpdate: (value) => setShown(Math.round(value)),
    });
    return () => controls.stop();
  }, [reduced, stars]);

  if (!adventure || adventure.phase !== "done") return <Navigate to="/" replace />;

  const favorite = saved.some((list) => list.id === adventure.id && list.favorite);
  const sticker = adventure.stickerId ?? "ster";
  const flyers = reduced ? 0 : Math.min(stars, 5);

  return (
    <main className="screen complete">
      <div className="complete-sky" aria-hidden="true" />
      <section className="complete-stage">
        <Karrie mood="complete" enter="pop" className="complete-mascot" />
        <div className="chest-wrap">
          <Chest open delay={CHEST_AT} />
          {Array.from({ length: flyers }, (_, index) => (
            <motion.span
              key={index}
              className="chest-star"
              aria-hidden="true"
              initial={{ x: (index - (flyers - 1) / 2) * 44, y: -150, scale: 0.6, opacity: 0 }}
              animate={{ x: 0, y: 6, scale: [0.6, 1.1, 0.3], opacity: [0, 1, 0] }}
              transition={{ delay: CHEST_AT + 0.25 + index * 0.12, duration: 0.55, ease: "easeIn" }}
            >
              <StarIcon />
            </motion.span>
          ))}
        </div>
      </section>

      <motion.h1 initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...softSpring, delay: 0.2 }}>
        Gelukt!
      </motion.h1>
      <p className="stars-line" aria-label={`${stars} ${stars === 1 ? "ster" : "sterren"}`}>
        <StarIcon />
        <strong>{shown}</strong> {stars === 1 ? "ster" : "sterren"}
      </p>

      <motion.div
        className="sticker-prize"
        initial={{ scaleX: 0, rotate: -12, opacity: 0 }}
        animate={{ scaleX: [0, 1.08, 1], rotate: [-12, 4, 0], opacity: 1 }}
        transition={{ delay: reduced ? 0 : CHEST_AT + 1.1, duration: 0.5, ease: "easeOut" }}
      >
        <span className="sticker-slot sticker-big">
          <StickerBadge id={sticker} />
        </span>
        <p>
          Nieuwe sticker: <strong>{stickerLabel(sticker)}</strong>
        </p>
      </motion.div>

      <div className="complete-actions">
        <PressButton
          variant="primary"
          size="l"
          wide
          onClick={() => {
            dispatch({ type: "new-draft" });
            navigate("/toevoegen");
          }}
        >
          Nieuw avontuur
        </PressButton>
        <PressButton variant="secondary" wide data-testid="save-list" disabled={favorite} onClick={() => dispatch({ type: "save-favorite" })}>
          {favorite ? "Bewaard" : "Bewaar lijstje"}
        </PressButton>
        <button type="button" className="text-button" onClick={() => navigate("/")}>
          Naar het begin
        </button>
      </div>
    </main>
  );
}
