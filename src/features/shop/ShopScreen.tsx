import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Karrie, type Mood } from "../../components/mascot/Karrie";
import { ItemArt } from "../../components/ItemArt";
import { ShopScene } from "../../components/scenery/ShopScene";
import { DiscoverySwitch } from "../../components/ui/DiscoverySwitch";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { SoundSwitch } from "../../components/ui/SoundSwitch";
import { StarIcon } from "../../components/ui/StarIcon";
import { productById } from "../../data/catalog";
import { playActive } from "../../domain/bonusPlay";
import { productHeading } from "../../domain/productHeading";
import { SCORING, starTotal } from "../../domain/scoring";
import { activeItem, foundCount } from "../../domain/shopQueue";
import type { AdventureItem } from "../../domain/types";
import { productEnter, productExit, spring } from "../../motion/variants";
import { useFoundSequence, type Flight } from "../../motion/useFoundSequence";
import { analyticsRetailer } from "../../domain/retailers";
import { trackEvent } from "../../services/analytics";
import { useOfferViews } from "../../storage/offers";
import { useScreenWakeLock } from "../../hooks/useScreenWakeLock";
import { useAdventure } from "../../state/AdventureContext";
import { OfferSheet, type OpenOffer } from "../offers/OfferSheet";
import { OfferTag, offerLabel } from "../offers/OfferTag";
import { GuessProductCard } from "./GuessProductCard";
import { MissionCard, ParentCheck } from "./MissionCard";

const SWIPE_DISTANCE = 90;
const SWIPE_VELOCITY = 600;
/** The child sees the regular product first, then Karrie brings up the mission. */
const MISSION_DELAY_MS = 900;
const INTRO_MS = 2200;

export function ShopScreen() {
  const { adventure, dispatch } = useAdventure();
  const navigate = useNavigate();
  const reduced = useReducedMotion() ?? false;
  const [listOpen, setListOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState<OpenOffer | null>(null);
  const [missionShown, setMissionShown] = useState<string | null>(null);
  const [playMood, setPlayMood] = useState<Mood | null>(null);
  const location = useLocation();
  /** Shown once when a list collected at home goes shopping; a tap or a moment later it is gone. */
  const [intro, setIntro] = useState(() => Boolean((location.state as { intro?: boolean } | null)?.intro));
  const keep = useRef<"original" | "alternative">("original");
  const artRef = useRef<HTMLSpanElement | null>(null);
  // The leaving product unmounts after the next one mounted; its null must not clear the new node.
  const attachArt = useCallback((node: HTMLSpanElement | null) => {
    if (node) artRef.current = node;
  }, []);
  const basketRef = useRef<SVGRectElement>(null);
  const starRef = useRef<HTMLSpanElement>(null);
  const dragged = useRef(false);
  const dragCollected = useRef(false);

  const sequence = useFoundSequence({
    reduced,
    artRef,
    basketRef,
    starRef,
    onFound: (bonus) => dispatch(bonus ? { type: "mission-done", keep: keep.current } : { type: "found" }),
    onSkip: () => dispatch({ type: "skip" }),
    onUndo: () => dispatch({ type: "undo" }),
    onFinished: () => navigate("/klaar", { replace: true }),
  });
  useScreenWakeLock(Boolean(adventure && (adventure.phase === "shopping" || sequence.finishing)));

  const current = adventure ? activeItem(adventure.items) : undefined;
  const retailer = adventure?.retailer;
  const { views: offerViews } = useOfferViews(adventure?.items ?? [], retailer);
  const offer = current ? offerViews.get(current.id) : undefined;
  const healthierBusy = current?.mission?.status === "active" || current?.mission?.status === "offered";
  const play = !healthierBusy ? playActive(current) : undefined;
  const offered = current?.mission?.status === "offered" && !sequence.locked && !intro ? current.id : null;
  /** Hide the stage product as soon as a guess is pending so the name does not flash under the card. */
  const guessPending = Boolean(play?.kind === "guess" && play.status === "offered" && play.distractorItemId && current);
  const showGuess = Boolean(guessPending && !sequence.locked && !intro);
  const guessDistractor =
    showGuess && current && play?.distractorItemId
      ? adventure?.items.find((entry) => entry.id === play.distractorItemId)
      : undefined;
  const heading = current
    ? productHeading({ name: current.name, brand: current.brand, packageSize: current.packageSize })
    : undefined;

  useEffect(() => {
    if (!offered) return;
    const timer = window.setTimeout(() => setMissionShown(offered), reduced ? 0 : MISSION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [offered, reduced]);

  const missionPresented = Boolean(current && offered === current.id && missionShown === current.id && !showGuess);

  useEffect(() => {
    if (!missionPresented || !current || !adventure) return;
    trackEvent({ name: "bonus_offered", data: { kind: "healthier" } }, `bonus-offer:${adventure.id}:${current.id}:healthier`);
  }, [missionPresented, current, adventure]);

  useEffect(() => {
    if (!showGuess || !current || !adventure || !play) return;
    trackEvent({ name: "bonus_offered", data: { kind: play.kind } }, `bonus-offer:${adventure.id}:${current.id}:${play.kind}`);
  }, [showGuess, current, adventure, play]);

  useEffect(() => {
    if (!play || !current || !adventure) return;
    if (play.kind !== "color" && play.kind !== "drag") return;
    if (play.status !== "offered" && play.status !== "active") return;
    if (intro || sequence.locked) return;
    trackEvent({ name: "bonus_offered", data: { kind: play.kind } }, `bonus-offer:${adventure.id}:${current.id}:${play.kind}`);
  }, [play, current, adventure, intro, sequence.locked]);

  useEffect(() => {
    if ((location.state as { intro?: boolean } | null)?.intro) navigate(".", { replace: true, state: null });
  }, [location.state, navigate]);

  useEffect(() => {
    if (!intro) return;
    const timer = window.setTimeout(() => setIntro(false), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [intro]);

  useEffect(() => {
    if (!play || play.status !== "offered") return;
    if (play.kind === "color" || play.kind === "drag") dispatch({ type: "play-activate" });
  }, [play, dispatch]);

  useEffect(() => {
    dragCollected.current = false;
    setPlayMood(null);
  }, [current?.id]);

  if (!adventure || adventure.items.length === 0) return <Navigate to="/" replace />;
  if (adventure.phase === "draft") return <Navigate to="/controleren" replace />;
  if (adventure.phase === "done" && !sequence.finishing) return <Navigate to="/klaar" replace />;

  const total = adventure.items.length;
  const found = foundCount(adventure.items) - (sequence.starPending ? 1 : 0);
  const stars = starTotal(adventure.items) - sequence.starPending;
  const openItems = adventure.items.filter((item) => item.status !== "found");
  const dragPlay = play?.kind === "drag" && (play.status === "offered" || play.status === "active");
  const colorPlay = play?.kind === "color" && (play.status === "offered" || play.status === "active");
  const canLater = openItems.length > 1 && !sequence.locked;
  /** Swipe-to-skip stays off during drag-play so kids do not confuse a left flick with “later”. */
  const canSwipe = canLater && !dragPlay;
  const searching = current?.mission?.status === "active" ? current : null;
  const missionTarget = searching?.alternative?.targetType ? productById(searching.alternative.targetType) : undefined;
  const showMission = missionPresented;

  function finishPlay(kind: "guess" | "color" | "drag") {
    dispatch({ type: "play-done" });
    trackEvent({ name: "bonus_play_completed", data: { kind } });
  }

  function collect() {
    if (!current || showGuess) return;
    if (searching) {
      setCheckOpen(true);
      return;
    }
    if (play && (play.kind === "color" || play.kind === "drag") && play.status !== "done" && play.status !== "skipped") {
      finishPlay(play.kind);
    }
    sequence.collect(current, openItems.length === 1);
  }

  function celebrateGuess() {
    finishPlay("guess");
    setPlayMood("celebrating");
    window.setTimeout(() => setPlayMood(null), 1200);
  }

  function dropOnBasket(_: unknown, info: { point: { x: number; y: number } }) {
    if (!dragPlay || !current || sequence.locked || dragCollected.current) return;
    const basket = basketRef.current?.getBoundingClientRect();
    if (!basket) return;
    const pad = 48;
    const hit =
      info.point.x >= basket.left - pad &&
      info.point.x <= basket.right + pad &&
      info.point.y >= basket.top - pad &&
      info.point.y <= basket.bottom + pad;
    if (!hit) return;
    dragCollected.current = true;
    collect();
  }

  function missionFound(choice: "original" | "alternative") {
    if (!searching) return;
    setCheckOpen(false);
    keep.current = choice;
    const flying: AdventureItem =
      choice === "alternative" && missionTarget ? { ...searching, icon: missionTarget.id, imageKind: "generic", photoId: undefined, imageUrl: undefined } : searching;
    sequence.collect(flying, openItems.length === 1, SCORING.discoveryBonus);
  }

  return (
    <main className="screen shop">
      <ShopScene />

      <header className="shop-bar">
        <button type="button" className="round-button round-s" data-testid="bekijk-lijstje" aria-label="Bekijk lijstje" onClick={() => setListOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 5h10v14H7z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M10 9h4M10 13h4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="round-button round-s round-quiet" data-testid="shop-parent" aria-label="Voor ouders" onClick={() => setParentOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" fill="none" stroke="currentColor" strokeWidth="2" />
            <path
              d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={found} aria-label={`${found} van ${total} gevonden`}>
          <motion.span className="progress-fill" initial={false} animate={{ scaleX: found / total }} transition={spring} />
          {total <= 12 && (
            <span className="progress-dots" aria-hidden="true">
              {Array.from({ length: total }, (_, index) => (
                <span key={index} className={index < found ? "is-done" : undefined} />
              ))}
            </span>
          )}
        </div>
        <span className="star-pill" ref={starRef} aria-label={`${stars} sterren`} data-testid="star-count">
          <motion.span key={stars} className="star-pill-icon" initial={{ scale: stars ? 1.5 : 1, rotate: stars ? -20 : 0 }} animate={{ scale: 1, rotate: 0 }} transition={spring}>
            <StarIcon />
          </motion.span>
          <span className="star-pill-count">{stars}</span>
        </span>
      </header>

      <section className="shop-guide">
        <Karrie mood={playMood ?? sequence.mood} beat={sequence.beat} basketRef={basketRef} className="shop-mascot" />
        <AnimatePresence mode="wait">
          <motion.p
            key={
              !current
                ? "done"
                : showMission
                  ? "mission"
                  : searching
                    ? "bonus"
                    : guessPending
                      ? "guess"
                      : colorPlay
                        ? "color"
                        : dragPlay
                          ? "drag"
                          : "search"
            }
            className="speech"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={spring}
          >
            {!current
              ? "Alles gevonden!"
              : showMission
                ? "Ik heb een bonusmissie!"
                : searching
                  ? "Zoek de bonus!"
                  : guessPending
                    ? "Tik op het goede plaatje!"
                    : colorPlay
                      ? `Zoek iets ${play?.colorLabel ?? "kleurigs"}!`
                      : dragPlay
                        ? "Sleep naar Karrie!"
                        : "Zoek dit product!"}
          </motion.p>
        </AnimatePresence>
      </section>

      <section className="stage">
        <AnimatePresence initial={false} custom={sequence.exitKind}>
          {current && !guessPending && (
            <motion.button
              key={current.id}
              type="button"
              className={`stage-product${dragPlay ? " is-drag-play" : ""}`}
              data-testid="product-stage"
              aria-label={dragPlay ? `Sleep ${heading?.title ?? current.name} naar Karrie` : `Gevonden: ${heading?.title ?? current.name}`}
              disabled={sequence.locked}
              custom={sequence.enterDelay}
              variants={{ ...productEnter, ...productExit }}
              initial="hidden"
              animate="shown"
              exit={sequence.exitKind}
              whileTap={sequence.locked || dragPlay ? undefined : { scale: 0.93 }}
              drag={dragPlay ? true : canSwipe ? "x" : false}
              dragConstraints={dragPlay ? undefined : { left: 0, right: 0 }}
              dragElastic={dragPlay ? 0.35 : { left: 0.9, right: 0.12 }}
              dragSnapToOrigin={dragPlay}
              onPointerDown={() => {
                dragged.current = false;
              }}
              onDragStart={() => {
                dragged.current = true;
              }}
              onDragEnd={(_, info) => {
                if (dragPlay) {
                  dropOnBasket(_, info);
                  return;
                }
                if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) sequence.skip();
              }}
              onKeyDown={(event) => {
                if (dragPlay && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  collect();
                }
              }}
              onClick={() => {
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                if (dragPlay) return;
                collect();
              }}
            >
              <span className="stage-glow" aria-hidden="true" />
              <span ref={attachArt} className="stage-art">
                <ItemArt item={current} />
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </section>

      <div className="product-title" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {current && heading && !guessPending && (
            <motion.div
              key={current.id}
              className="product-title-copy"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { ...spring, delay: sequence.enterDelay } }}
              exit={{ y: -8, opacity: 0, transition: { duration: 0.12 } }}
            >
              <h1>
                {current.quantity > 1 && <span className="qty">{current.quantity}×</span>}
                {heading.title}
              </h1>
              {heading.subtitle && <p className="product-title-sub">{heading.subtitle}</p>}
            </motion.div>
          )}
        </AnimatePresence>
        {current && offer?.answer.offer && retailer && (
          <button
            type="button"
            className="offer-tag-button shop-offer"
            aria-label={`${offerLabel(offer.shown, retailer)}: details`}
            data-testid="shop-offer"
            onClick={() => {
              const deal = offer.answer.offer;
              if (!deal) return;
              setOfferOpen({ itemName: heading?.title ?? current.name, offer: deal, shown: offer.shown });
              trackEvent({ name: "offer_opened", data: { retailer: analyticsRetailer(retailer), match_type: deal.matchType } });
            }}
          >
            <OfferTag shown={offer.shown} retailer={retailer} />
          </button>
        )}
      </div>

      <div className="scan-mission">
        <AnimatePresence>
          {searching && missionTarget && (
            <motion.div
              key={searching.id}
              className="scan-pill mission-pill"
              data-testid="mission-active"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, transition: spring }}
              exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.12 } }}
            >
              <ItemArt item={{ icon: missionTarget.id, name: missionTarget.name }} className="mission-pill-art" />
              <span>{searching.alternative?.childPrompt ?? `Zoek ${missionTarget.name.toLowerCase()}`}</span>
              <span className="mission-pill-stars" aria-label={`${SCORING.discoveryBonus} extra sterren`}>
                <StarIcon />+{SCORING.discoveryBonus}
              </span>
              <button type="button" className="mission-stop" aria-label="Stop bonusmissie" data-testid="mission-stop" onClick={() => dispatch({ type: "mission-skip" })}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          )}
          {colorPlay && play?.colorLabel && !searching && (
            <motion.div
              key={`color-${current?.id}`}
              className="scan-pill mission-pill"
              data-testid="color-hunt"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, transition: spring }}
              exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.12 } }}
            >
              <span>{`Zoek iets ${play.colorLabel}!`}</span>
              <button type="button" className="mission-stop" aria-label="Stop kleurjacht" data-testid="color-skip" onClick={() => dispatch({ type: "play-skip" })}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          )}
          {dragPlay && !searching && (
            <motion.div
              key={`drag-${current?.id}`}
              className="scan-pill mission-pill"
              data-testid="drag-play"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, transition: spring }}
              exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.12 } }}
            >
              <span>Sleep naar Karrie!</span>
              <button type="button" className="mission-stop" aria-label="Stop sleepmissie" data-testid="drag-skip" onClick={() => dispatch({ type: "play-skip" })}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="shop-actions">
        <button type="button" className="side-action" data-testid="undo" onClick={sequence.undo} disabled={adventure.history.length === 0 || sequence.locked}>
          <span className="round-button round-quiet" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M9 7L4.5 11.5 9 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 11.5h9a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </span>
          <span>Terug</span>
        </button>
        <PressButton variant="go" size="l" data-testid="found" aria-label="Gevonden" disabled={!current || sequence.locked} onClick={collect}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="go-check">
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Gevonden!
        </PressButton>
        <button type="button" className="side-action" data-testid="skip" onClick={sequence.skip} disabled={!canLater}>
          <span className="round-button round-quiet" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M6 6l7 6-7 6M13 6l7 6-7 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>Later</span>
        </button>
      </footer>

      {sequence.flight && <FlightLayer flight={sequence.flight} />}

      <AnimatePresence>
        {showMission && current && (
          <MissionCard
            key={current.id}
            item={current}
            reduced={reduced}
            onGo={() => dispatch({ type: "mission-accept" })}
            onSkip={() => dispatch({ type: "mission-skip" })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGuess && current && guessDistractor && (
          <GuessProductCard
            key={`guess-${current.id}`}
            item={current}
            distractor={guessDistractor}
            reduced={reduced}
            onCorrect={celebrateGuess}
            onSkip={() => dispatch({ type: "play-skip" })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {intro && (
          <motion.button
            type="button"
            className="shop-intro"
            data-testid="shop-intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            onClick={() => setIntro(false)}
          >
            <Karrie mood="greeting" enter={reduced ? "none" : "pop"} className="shop-intro-karrie" />
            <span className="speech">Alles verzameld? Nu gaan we ze zoeken!</span>
          </motion.button>
        )}
      </AnimatePresence>

      <OfferSheet open={offerOpen} onClose={() => setOfferOpen(null)} />

      <Sheet open={checkOpen && Boolean(searching)} onClose={() => setCheckOpen(false)} label="Bonusmissie controleren">
        {searching && (
          <ParentCheck
            item={searching}
            onAlternative={() => missionFound("alternative")}
            onOriginal={() => missionFound("original")}
            onNotYet={() => setCheckOpen(false)}
          />
        )}
      </Sheet>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} label="Bekijk lijstje">
        <div className="bekijk-lijstje" data-testid="bekijk-lijstje-sheet">
          <h2>Nog te vinden</h2>
          <p className="sheet-note">Tik op wat je ziet in de winkel.</p>
          <ul className="bekijk-lijstje-grid" aria-label="Nog te vinden">
            {openItems.map((item) => {
              const heading = productHeading(item);
              const active = current?.id === item.id;
              const view = offerViews.get(item.id);
              const deal = view && retailer ? offerLabel(view.shown, retailer) : "";
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={active ? "bekijk-card is-active" : "bekijk-card"}
                    data-testid="bekijk-card"
                    aria-current={active ? "true" : undefined}
                    aria-label={`${heading.title}${item.status === "skipped" ? ", later" : ""}${deal ? `, ${deal}` : ""}${active ? ", nu zoeken" : ""}`}
                    onClick={() => {
                      dispatch({ type: "focus-item", itemId: item.id });
                      setListOpen(false);
                    }}
                  >
                    <ItemArt item={item} />
                    <strong>
                      {item.quantity > 1 ? `${item.quantity}× ` : ""}
                      {heading.title}
                    </strong>
                    {view && retailer && <OfferTag shown={view.shown} retailer={retailer} />}
                    {item.status === "skipped" && <small>later</small>}
                  </button>
                </li>
              );
            })}
          </ul>
          <PressButton variant="secondary" wide onClick={() => setListOpen(false)}>
            Verder speuren
          </PressButton>
        </div>
      </Sheet>

      <Sheet open={parentOpen} onClose={() => setParentOpen(false)} label="Voor ouders">
        <h2>Voor ouders</h2>
        <SoundSwitch />
        <DiscoverySwitch />
        <div className="sheet-actions">
          <PressButton variant="quiet" onClick={() => navigate("/controleren")}>
            Lijst aanpassen
          </PressButton>
          <PressButton variant="secondary" onClick={() => setParentOpen(false)}>
            Verder speuren
          </PressButton>
        </div>
        <button type="button" className="text-button" data-testid="shop-home" onClick={() => navigate("/")}>
          Naar het beginscherm
        </button>
        <p className="sheet-note">Het avontuur blijft staan; op het beginscherm ga je verder.</p>
      </Sheet>
    </main>
  );
}

function center(box: Flight["from"]) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function FlightLayer({ flight }: { flight: Flight }) {
  const from = center(flight.from);
  const basket = center(flight.basket);
  const star = center(flight.star);
  const dx = basket.x - from.x;
  const dy = basket.y - from.y;

  return (
    <div className="flight-layer" aria-hidden="true">
      <motion.div
        key={`p-${flight.token}`}
        className="flight-product"
        style={{ left: flight.from.x, top: flight.from.y, width: flight.from.width, height: flight.from.height }}
        initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
        animate={{ x: [0, 0, dx], y: [0, -18, dy], scale: [1, 1.12, 0.16], rotate: [0, -5, 16], opacity: [1, 1, 0.9] }}
        transition={{ duration: 0.46, times: [0, 0.3, 1], ease: ["easeOut", "easeIn"] }}
      >
        <ItemArt item={flight.item} />
      </motion.div>
      <motion.div
        key={`s-${flight.token}`}
        className="flight-star"
        style={{ left: basket.x - 22, top: basket.y - 22 }}
        initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
        animate={{
          x: [0, (star.x - basket.x) * 0.45, star.x - basket.x],
          y: [0, Math.min(-50, (star.y - basket.y) * 0.5 - 40), star.y - basket.y],
          scale: [0.3, 1.3, 0.7],
          opacity: [0, 1, 1],
        }}
        transition={{ delay: 0.32, duration: 0.3, times: [0, 0.45, 1], ease: "easeInOut" }}
      >
        <StarIcon />
      </motion.div>
      {Array.from({ length: flight.bonus }, (_, index) => (
        <motion.div
          key={`b-${flight.token}-${index}`}
          className="flight-star flight-bonus"
          style={{ left: from.x - 22 + (index ? 34 : -34), top: from.y - 22 }}
          initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
          animate={{
            x: [0, (star.x - from.x) * 0.4, star.x - from.x - (index ? 34 : -34)],
            y: [0, -60, star.y - from.y],
            scale: [0.3, 1.2, 0.6],
            opacity: [0, 1, 1],
          }}
          transition={{ delay: 0.08 + index * 0.08, duration: 0.55, times: [0, 0.4, 1], ease: "easeInOut" }}
        >
          <StarIcon />
        </motion.div>
      ))}
      {flight.bonus > 0 && (
        <motion.span
          key={`plus-${flight.token}`}
          className="flight-plus"
          style={{ left: star.x - 20, top: star.y + 26 }}
          initial={{ y: 8, scale: 0.4, opacity: 0 }}
          animate={{ y: [8, 0, -6], scale: [0.4, 1.15, 1], opacity: [0, 1, 0] }}
          transition={{ delay: 0.45, duration: 0.9, times: [0, 0.3, 1] }}
        >
          +{flight.bonus}
        </motion.span>
      )}
    </div>
  );
}
