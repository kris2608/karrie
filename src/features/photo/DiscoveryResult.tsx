import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Karrie, type Mood } from "../../components/mascot/Karrie";
import { ProductArt } from "../../components/ProductArt";
import { celebrate } from "../../components/rewards/confetti";
import { PressButton } from "../../components/ui/PressButton";
import { fitsChallenge, type Challenge } from "../../domain/challenges";
import { childName, collectedLine, discoveredCount, discoveryVerdict, milestoneReached } from "../../domain/homeAdventure";
import { newItemFor, type ProductDraft } from "../../domain/productDraft";
import type { AdventureItem } from "../../domain/types";
import { buzz } from "../../feedback/haptics";
import { playFanfare, playPop } from "../../feedback/sound";
import { spring } from "../../motion/variants";
import { useAdventure } from "../../state/AdventureContext";
import { savePhoto, usePhotoUrl } from "../../storage/photos";

type DiscoveryResultProps = {
  draft: ProductDraft;
  photoUrl?: string;
  photo?: Blob;
  items: AdventureItem[];
  challenge?: Challenge;
  /** Back to the camera for the next product; the code just handled is ignored for a moment. */
  onNext: (ean?: string) => void;
  onRetake: () => void;
  /** Opens the detailed sheet with the same result. */
  onParent: () => void;
  onClose: () => void;
};

type Collected = { count: number; milestone: number | null; fits: boolean };
type Flight = { dx: number; dy: number };

/** Karrie turns happy once the product lands in the basket. */
const LAND_MS = 380;

function center(element: Element | null) {
  const rect = element?.getBoundingClientRect();
  return rect && (rect.width || rect.height) ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
}

/** The child's result: one big button into the basket, no fields. Doubtful results go to a parent. */
export function DiscoveryResult({ draft, photoUrl, photo, items, challenge, onNext, onRetake, onParent, onClose }: DiscoveryResultProps) {
  const { adventure, dispatch } = useAdventure();
  const reduced = useReducedMotion() ?? false;
  const [confirmed, setConfirmed] = useState(false);
  const [collected, setCollected] = useState<Collected | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [mood, setMood] = useState<Mood>(() => {
    const first = discoveryVerdict(draft, items).kind;
    return first === "collect" ? "happy" : first === "duplicate" ? "surprised" : "searching";
  });
  const [beat, setBeat] = useState(0);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const artRef = useRef<HTMLSpanElement>(null);
  const basketRef = useRef<SVGRectElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const earlier = usePhotoUrl(photoUrl ? undefined : draft.photoId);

  const verdict = discoveryVerdict(draft, items, confirmed);
  const name = childName(draft);
  const drawing = !draft.keepPhoto ? draft.match : null;
  const picture = photoUrl ?? earlier ?? draft.imageUrl ?? null;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function collect() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    const category = draft.match && !draft.keepPhoto ? draft.match.category : draft.category;
    const { item, withPhoto } = newItemFor(draft, draft.name, category);
    try {
      const photoId = withPhoto && photo ? await savePhoto(photo) : photo ? undefined : draft.photoId;
      const list = adventure && adventure.phase !== "done" ? adventure : null;
      const count = discoveredCount(list) + 1;
      const milestone = milestoneReached(count, list?.cheered);
      dispatch({ type: "add-recognized", ...item, photoId, discovered: true });
      if (milestone) dispatch({ type: "cheer", milestone });

      const from = center(artRef.current);
      const basket = center(basketRef.current);
      if (!reduced && from && basket) setFlight({ dx: basket.x - from.x, dy: basket.y - from.y });
      setCollected({ count, milestone, fits: Boolean(challenge && fitsChallenge(challenge, item)) });
      timer.current = window.setTimeout(
        () => {
          setMood(milestone ? "celebrating" : "happy");
          setBeat((value) => value + 1);
        },
        reduced ? 0 : LAND_MS,
      );
      if (milestone) {
        playFanfare();
        celebrate();
        buzz([20, 40, 20]);
      } else {
        playPop();
        buzz(8);
      }
    } catch {
      saving.current = false;
    } finally {
      setBusy(false);
    }
  }

  function yes() {
    setConfirmed(true);
    if (discoveryVerdict(draft, items, true).kind === "collect") void collect();
  }

  function addOne(item: AdventureItem) {
    dispatch({ type: "set-quantity", itemId: item.id, quantity: item.quantity + 1 });
    playPop();
    buzz(8);
    onNext(draft.ean);
  }

  const art = drawing ? (
    <ProductArt id={drawing.id} />
  ) : picture ? (
    <span className="product-art item-photo">
      <img src={picture} alt="" referrerPolicy="no-referrer" />
    </span>
  ) : (
    <ProductArt id={draft.icon} />
  );

  const heading = collected
    ? collected.milestone
      ? `Hoera! Karrie heeft al ${collected.milestone} producten verzameld!`
      : collectedLine(collected.count)
    : verdict.kind === "collect"
      ? `${name} gevonden!`
      : verdict.kind === "ask"
        ? `Is dit een ${name.toLowerCase()}?`
        : verdict.kind === "duplicate"
          ? "Die hebben we al!"
          : "Wat is dit?";

  return (
    <div className="discover" data-testid="discover-result" data-verdict={collected ? "collected" : verdict.kind}>
      <h2 aria-live="polite">{heading}</h2>
      <div className="discover-stage">
        <motion.span
          ref={artRef}
          className="discover-art"
          initial={reduced ? false : { scale: 0.7, opacity: 0 }}
          animate={
            collected
              ? flight
                ? { x: [0, 0, flight.dx], y: [0, -18, flight.dy], scale: [1, 1.12, 0.16], rotate: [0, -5, 16], opacity: [1, 1, 0] }
                : { opacity: 0, scale: 0.6 }
              : { scale: 1, opacity: 1 }
          }
          transition={collected && flight ? { duration: 0.46, times: [0, 0.3, 1], ease: ["easeOut", "easeIn"] } : reduced ? { duration: 0 } : spring}
        >
          {art}
        </motion.span>
        <Karrie mood={mood} beat={beat} basketRef={basketRef} className="discover-karrie" />
      </div>

      {collected ? (
        <>
          {collected.fits && challenge && (
            <motion.p className="discover-fit" initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
              Gelukt!
            </motion.p>
          )}
          <PressButton variant="go" size="l" wide autoFocus data-testid="discover-next" onClick={() => onNext(draft.ean)}>
            Zoek de volgende!
          </PressButton>
          <button type="button" className="text-button discover-small" data-testid="discover-done" onClick={onClose}>
            Klaar
          </button>
        </>
      ) : verdict.kind === "collect" ? (
        <>
          <PressButton variant="go" size="l" wide data-testid="discover-collect" disabled={busy} onClick={() => void collect()}>
            In het mandje!
          </PressButton>
          <SmallActions onRetake={onRetake} onParent={onParent} />
        </>
      ) : verdict.kind === "ask" ? (
        <>
          <PressButton variant="go" size="l" wide data-testid="discover-yes" disabled={busy} onClick={yes}>
            Ja!
          </PressButton>
          <SmallActions onRetake={onRetake} onParent={onParent} />
        </>
      ) : verdict.kind === "duplicate" ? (
        <>
          <p className="discover-note">{verdict.item.name} staat al op je lijst.</p>
          <PressButton variant="go" size="l" wide data-testid="discover-next" onClick={() => onNext(draft.ean)}>
            Zoek de volgende!
          </PressButton>
          <button type="button" className="text-button discover-small" data-testid="discover-add-one" onClick={() => addOne(verdict.item)}>
            Nog één erbij
          </button>
        </>
      ) : (
        <>
          <p className="discover-note">Karrie weet het niet zeker.</p>
          <PressButton variant="primary" size="l" wide data-testid="discover-parent" onClick={onParent}>
            Vraag een ouder
          </PressButton>
          <button type="button" className="text-button discover-small" data-testid="discover-retake" onClick={onRetake}>
            Nog een foto
          </button>
        </>
      )}
    </div>
  );
}

function SmallActions({ onRetake, onParent }: { onRetake: () => void; onParent: () => void }) {
  return (
    <div className="discover-actions">
      <button type="button" className="text-button discover-small" data-testid="discover-retake" onClick={onRetake}>
        Nog een foto
      </button>
      <button type="button" className="text-button discover-small" data-testid="discover-parent" onClick={onParent}>
        Vraag een ouder
      </button>
    </div>
  );
}
