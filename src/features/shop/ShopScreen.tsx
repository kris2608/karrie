import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Suspense, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Karrie } from "../../components/mascot/Karrie";
import { ItemArt } from "../../components/ItemArt";
import { ShopScene } from "../../components/scenery/ShopScene";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { SoundSwitch } from "../../components/ui/SoundSwitch";
import { BarcodeIcon } from "../../components/ui/ScanButton";
import { StarIcon } from "../../components/ui/StarIcon";
import { productById } from "../../data/catalog";
import { starTotal } from "../../domain/scoring";
import { activeItem, foundCount } from "../../domain/shopQueue";
import type { ScanOutcome } from "../scanner/BarcodeScanner";
import { LazyScanner } from "../scanner/ScanFlow";
import { productEnter, productExit, spring } from "../../motion/variants";
import { useFoundSequence, type Flight } from "../../motion/useFoundSequence";
import { useAdventure } from "../../state/AdventureContext";

const SWIPE_DISTANCE = 90;
const SWIPE_VELOCITY = 600;

export function ShopScreen() {
  const { adventure, dispatch } = useAdventure();
  const navigate = useNavigate();
  const reduced = useReducedMotion() ?? false;
  const [parentOpen, setParentOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const artRef = useRef<HTMLSpanElement>(null);
  const basketRef = useRef<SVGRectElement>(null);
  const starRef = useRef<HTMLSpanElement>(null);
  const dragged = useRef(false);

  const sequence = useFoundSequence({
    reduced,
    artRef,
    basketRef,
    starRef,
    onFound: ({ bonus, pack }) => dispatch({ type: "found", bonus, pack }),
    onSkip: () => dispatch({ type: "skip" }),
    onUndo: () => dispatch({ type: "undo" }),
    onFinished: () => navigate("/klaar", { replace: true }),
  });

  if (!adventure || adventure.items.length === 0) return <Navigate to="/" replace />;
  if (adventure.phase === "draft") return <Navigate to="/controleren" replace />;
  if (adventure.phase === "done" && !sequence.finishing) return <Navigate to="/klaar" replace />;

  const current = activeItem(adventure.items);
  const total = adventure.items.length;
  const found = foundCount(adventure.items) - (sequence.starPending ? 1 : 0);
  const stars = starTotal(adventure.items) - sequence.starPending;
  const openItems = adventure.items.filter((item) => item.status !== "found");
  const canSkip = openItems.length > 1 && !sequence.locked;

  const canScan = Boolean(
    current && !current.scan && !sequence.locked && (current.ean || (current.category !== "produce" && productById(current.productId))),
  );

  function collect() {
    if (!current) return;
    sequence.collect(current, openItems.length === 1);
  }

  function scanned(outcome: ScanOutcome) {
    setScanOpen(false);
    if (!current || outcome.kind === "lookup") return;
    const isLast = openItems.length === 1;
    if (outcome.kind === "confirmed") {
      const photo = outcome.product.imageUrl;
      const flying = photo ? { ...current, imageUrl: photo, imageKind: "photo" as const } : current;
      sequence.collect(flying, isLast, { bonus: "confirmed", pack: outcome.product });
    } else {
      sequence.collect(current, isLast, { bonus: "verified" });
    }
  }

  return (
    <main className="screen shop">
      <ShopScene />

      <header className="shop-bar">
        <button type="button" className="round-button round-s round-quiet" aria-label="Overzicht voor ouders" onClick={() => setParentOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
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
        <Karrie mood={sequence.mood} beat={sequence.beat} basketRef={basketRef} className="shop-mascot" />
        <AnimatePresence mode="wait">
          <motion.p
            key={current ? "search" : "done"}
            className="speech"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={spring}
          >
            {current ? "Zoek dit product!" : "Alles gevonden!"}
          </motion.p>
        </AnimatePresence>
      </section>

      <section className="stage">
        <AnimatePresence initial={false} custom={sequence.exitKind}>
          {current && (
            <motion.button
              key={current.id}
              type="button"
              className="stage-product"
              data-testid="product-stage"
              aria-label={`Gevonden: ${current.name}`}
              disabled={sequence.locked}
              custom={sequence.enterDelay}
              variants={{ ...productEnter, ...productExit }}
              initial="hidden"
              animate="shown"
              exit={sequence.exitKind}
              whileTap={sequence.locked ? undefined : { scale: 0.93 }}
              drag={canSkip ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.9, right: 0.12 }}
              onPointerDown={() => {
                dragged.current = false;
              }}
              onDragStart={() => {
                dragged.current = true;
              }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) sequence.skip();
              }}
              onClick={() => {
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                collect();
              }}
            >
              <span className="stage-glow" aria-hidden="true" />
              <span ref={artRef} className="stage-art">
                <ItemArt item={current} />
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </section>

      <div className="product-title" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {current && (
            <motion.h1
              key={current.id}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { ...spring, delay: sequence.enterDelay } }}
              exit={{ y: -8, opacity: 0, transition: { duration: 0.12 } }}
            >
              {current.quantity > 1 && <span className="qty">{current.quantity}×</span>}
              {current.name}
            </motion.h1>
          )}
        </AnimatePresence>
      </div>

      <div className="scan-mission">
        <AnimatePresence>
          {canScan && current && (
            <motion.button
              key={current.id}
              type="button"
              className="scan-pill"
              data-testid="scan-mission"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, transition: { ...spring, delay: sequence.enterDelay + 0.1 } }}
              exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.12 } }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setScanOpen(true)}
            >
              <BarcodeIcon />
              Scan de barcode
            </motion.button>
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
        <button type="button" className="side-action" data-testid="skip" onClick={sequence.skip} disabled={!canSkip}>
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
        {scanOpen && current && (
          <Suspense fallback={<div className="scanner" aria-busy="true" />}>
            <LazyScanner mode="verify-adventure-item" target={current} onResult={scanned} onClose={() => setScanOpen(false)} />
          </Suspense>
        )}
      </AnimatePresence>

      <Sheet open={parentOpen} onClose={() => setParentOpen(false)} label="Overzicht voor ouders">
        <h2>Nog te vinden</h2>
        <ul className="parent-list">
          {openItems.map((item, index) => (
            <li key={item.id}>
              <ItemArt item={item} />
              <span>
                {item.quantity > 1 ? `${item.quantity}× ` : ""}
                {item.name}
                {item.status === "skipped" && <small> · later</small>}
              </span>
              <button type="button" className="round-button round-s" aria-label="Omhoog" disabled={index === 0} onClick={() => dispatch({ type: "move-item", itemId: item.id, direction: -1 })}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 14.5L12 8.5l6 6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="round-button round-s"
                aria-label="Omlaag"
                disabled={index === openItems.length - 1}
                onClick={() => dispatch({ type: "move-item", itemId: item.id, direction: 1 })}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <SoundSwitch />
        <div className="sheet-actions">
          <PressButton variant="quiet" onClick={() => navigate("/controleren")}>
            Lijst aanpassen
          </PressButton>
          <PressButton variant="secondary" onClick={() => setParentOpen(false)}>
            Verder speuren
          </PressButton>
        </div>
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
