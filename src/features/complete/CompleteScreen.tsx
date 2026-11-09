import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Karrie } from "../../components/mascot/Karrie";
import { Chest } from "../../components/rewards/Chest";
import { celebrate } from "../../components/rewards/confetti";
import { StickerBadge } from "../../components/StickerBadge";
import { PressButton } from "../../components/ui/PressButton";
import { StarIcon } from "../../components/ui/StarIcon";
import { feedbackUrl, wantsFeedbackInvite } from "../../domain/feedback";
import { foundCount } from "../../domain/shopQueue";
import { starTotal } from "../../domain/scoring";
import { stickerLabel } from "../../domain/stickers";
import { buzz } from "../../feedback/haptics";
import { playFanfare } from "../../feedback/sound";
import { softSpring } from "../../motion/variants";
import { trackEvent } from "../../services/analytics";
import { useAdventure } from "../../state/AdventureContext";
import { SaveListSheet } from "../review/SaveListSheet";
import { ShareListSheet } from "../share/ShareListSheet";

const CHEST_AT = 0.5;
/** After the sticker has appeared, so the child's celebration is never interrupted. */
const FEEDBACK_AT = CHEST_AT + 1.7;

export function CompleteScreen() {
  const { adventure, saved, completedAdventures, feedbackAsked, dispatch } = useAdventure();
  const navigate = useNavigate();
  const reduced = useReducedMotion() ?? false;
  const stars = adventure ? starTotal(adventure.items) : 0;
  const bonus = adventure ? stars - foundCount(adventure.items) : 0;
  const [shown, setShown] = useState(reduced ? stars : 0);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [inviteReady, setInviteReady] = useState(reduced);
  const fired = useRef(false);
  const invite = wantsFeedbackInvite(completedAdventures, feedbackAsked);

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

  useEffect(() => {
    if (!invite || reduced) {
      setInviteReady(Boolean(invite));
      return;
    }
    const timer = window.setTimeout(() => setInviteReady(true), FEEDBACK_AT * 1000);
    return () => window.clearTimeout(timer);
  }, [invite, reduced]);

  if (!adventure || adventure.phase !== "done") return <Navigate to="/" replace />;

  const favorite = saved.some((list) => list.id === adventure.id && list.favorite);
  const sticker = adventure.stickerId ?? "ster";
  const flyers = reduced ? 0 : Math.min(stars, 5);

  function askFeedback() {
    dispatch({ type: "feedback-asked" });
  }

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
      {bonus > 0 && <p className="bonus-line">Waarvan {bonus} extra sterren van bonusmissies!</p>}

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

      {invite && inviteReady && (
        <motion.aside
          className="feedback-invite"
          data-testid="feedback-invite"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <strong>Wat vonden jullie van Karrie? 💛</strong>
          <p>Met jouw feedback maken we boodschappen doen nóg leuker!</p>
          <div className="feedback-invite-actions">
            <a
              className="pbtn pbtn-secondary pbtn-m pbtn-wide"
              href={feedbackUrl("completed")}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="feedback-open"
              onClick={() => {
                trackEvent({ name: "feedback_opened", data: { source: "completed" } });
                askFeedback();
              }}
            >
              Geef feedback
            </a>
            <PressButton variant="quiet" wide data-testid="feedback-later" onClick={askFeedback}>
              Niet nu
            </PressButton>
          </div>
        </motion.aside>
      )}

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
        <PressButton variant="secondary" wide data-testid="save-list" disabled={favorite} onClick={() => setSaving(true)}>
          {favorite ? "Bewaard" : "Bewaar lijstje"}
        </PressButton>
        <PressButton variant="quiet" wide data-testid="share-list-complete" onClick={() => setSharing(true)}>
          Deel lijstje
        </PressButton>
        <button type="button" className="text-button" onClick={() => navigate("/")}>
          Naar het begin
        </button>
      </div>
      <SaveListSheet
        open={saving}
        adventure={adventure}
        onClose={() => setSaving(false)}
        onSave={(name, store) => {
          dispatch({ type: "save-favorite", name, store });
          setSaving(false);
        }}
      />
      <ShareListSheet open={sharing} source={adventure} onClose={() => setSharing(false)} />
    </main>
  );
}
