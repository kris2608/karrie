import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Karrrie } from "../../components/mascot/Karrrie";
import { ProductArt } from "../../components/ProductArt";
import { HomeScene } from "../../components/scenery/HomeScene";
import { StickerBadge } from "../../components/StickerBadge";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { SoundSwitch } from "../../components/ui/SoundSwitch";
import { softSpring } from "../../motion/variants";
import { stickerLabel } from "../../domain/stickers";
import type { SavedList } from "../../domain/types";
import { useAdventure } from "../../state/AdventureContext";

export function HomeScreen() {
  const { adventure, saved, stickers, dispatch } = useAdventure();
  const navigate = useNavigate();
  const location = useLocation();
  const [parentOpen, setParentOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);

  useEffect(() => {
    if (!notice) return;
    navigate(".", { replace: true, state: null });
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice, navigate]);
  const shopping = adventure?.phase === "shopping";
  const draft = adventure?.phase === "draft" && adventure.items.length > 0;
  const previous = adventure?.phase === "done" ? saved[0] : saved.find((list) => list.id !== adventure?.id);
  const favorites = saved.filter((list) => list.favorite && list.id !== previous?.id).slice(0, 6);
  const shelf = [...(previous ? [{ list: previous, label: "Vorig lijstje" }] : []), ...favorites.map((list) => ({ list, label: "Bewaard" }))];

  function openList(list: SavedList) {
    dispatch({ type: "open-saved", id: list.id });
    navigate("/controleren");
  }

  return (
    <main className="screen home">
      <HomeScene />
      <button type="button" className="parent-button" aria-label="Instellingen voor ouders" onClick={() => setParentOpen(true)}>
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

      <section className="home-hero">
        <Karrrie mood="greeting" enter="roll" className="home-mascot" />
        <motion.div
          className="wordmark"
          initial={{ y: 18, opacity: 0, scale: 0.92 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ ...softSpring, delay: 0.35 }}
        >
          <h1>Karrrie</h1>
          <p>Speur, vind en vink af!</p>
        </motion.div>
      </section>

      <motion.div
        className="home-actions"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...softSpring, delay: 0.55 }}
      >
        <PressButton
          variant="primary"
          size="l"
          wide
          data-testid="new-adventure"
          onClick={() => {
            dispatch({ type: "new-draft" });
            navigate("/toevoegen");
          }}
        >
          Nieuw avontuur
        </PressButton>
        {(shopping || draft) && (
          <PressButton variant="secondary" wide onClick={() => navigate(shopping ? "/winkel" : "/controleren")}>
            {shopping ? "Verder speuren" : "Verder met lijstje"}
          </PressButton>
        )}
        <PressButton
          variant="quiet"
          wide
          data-testid="sample-adventure"
          onClick={() => {
            dispatch({ type: "start-sample" });
            navigate("/winkel");
          }}
        >
          Probeer het voorbeeld
        </PressButton>
      </motion.div>

      {shelf.length > 0 && (
        <section className="home-shelf" aria-label="Eerdere lijstjes">
          <ul>
            {shelf.map(({ list, label }) => (
              <li key={list.id}>
                <motion.button type="button" className="list-card" whileTap={{ scale: 0.96 }} onClick={() => openList(list)}>
                  <span className="list-card-art">
                    {list.items.slice(0, 3).map((item) => (
                      <ProductArt key={item.productId} id={item.icon} />
                    ))}
                  </span>
                  <span className="list-card-text">
                    <strong>{label}</strong>
                    <small>{list.items.length} producten</small>
                  </span>
                </motion.button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stickers.length > 0 && (
        <section className="sticker-shelf" aria-label={`Stickers: ${stickers.map(stickerLabel).join(", ")}`}>
          {stickers.map((id) => (
            <span key={id} className="sticker-slot">
              <StickerBadge id={id} />
            </span>
          ))}
        </section>
      )}

      <AnimatePresence>
        {notice && (
          <motion.p
            key="notice"
            className="toast"
            role="status"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            transition={softSpring}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {notice}
          </motion.p>
        )}
      </AnimatePresence>

      <Sheet open={parentOpen} onClose={() => setParentOpen(false)} label="Instellingen voor ouders">
        <h2>Voor ouders</h2>
        <SoundSwitch />
        <p className="sheet-note">Zet Karrrie op je beginscherm: deel-knop in Safari, of het menu in Chrome.</p>
        <PressButton variant="secondary" wide onClick={() => setParentOpen(false)}>
          Klaar
        </PressButton>
      </Sheet>
    </main>
  );
}
