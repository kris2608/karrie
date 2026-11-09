import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Karrie } from "../../components/mascot/Karrie";
import { ItemArt } from "../../components/ItemArt";
import { HomeScene } from "../../components/scenery/HomeScene";
import { StickerBadge } from "../../components/StickerBadge";
import { DiscoverySwitch } from "../../components/ui/DiscoverySwitch";
import { ReferenceSwitch } from "../../components/ui/ReferenceSwitch";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { SoundSwitch } from "../../components/ui/SoundSwitch";
import { Toast, useNotice } from "../../components/ui/Toast";
import { useLongPress } from "../../components/ui/useLongPress";
import { softSpring } from "../../motion/variants";
import { appVersionLabel } from "../../domain/appVersion";
import { retailerName } from "../../domain/retailers";
import { stickerPreview } from "../../domain/stickers";
import { RetailerPicker } from "../offers/RetailerPicker";
import type { SavedList } from "../../domain/types";
import { useAdventure } from "../../state/AdventureContext";
import { listName } from "../../state/reducer";
import { needsIntro } from "../../domain/intro";
import { feedbackUrl } from "../../domain/feedback";
import { shareKarrie } from "../../domain/share";
import { trackEvent } from "../../services/analytics";
import { AboutKarrie } from "./AboutKarrie";
import { HowKarrieWorks } from "./HowKarrieWorks";
import { PrivacyInfo } from "./PrivacyInfo";
import { StickerBook } from "./StickerBook";

type ParentView = "settings" | "howto" | "about" | "privacy";

const viewLabels: Record<ParentView, string> = {
  settings: "Instellingen voor ouders",
  howto: "Hoe werkt Karrie?",
  about: "Over Karrie",
  privacy: "Privacy en gegevens",
};

const linkLabels: Record<Exclude<ParentView, "settings">, string> = {
  howto: "❓ Hoe werkt Karrie?",
  about: "❤️ Over Karrie",
  privacy: "Privacy en gegevens",
};

function ListCard({ list, label: fallback, onOpen, onForget }: { list: SavedList; label: string; onOpen: () => void; onForget: () => void }) {
  const { pressing, handlers } = useLongPress(onForget);
  const label = listName(list) ?? fallback;
  const detail = [`${list.items.length} producten`, list.store].filter(Boolean).join(" · ");
  return (
    <motion.button
      type="button"
      className={pressing ? "list-card is-pressing" : "list-card"}
      aria-label={`${label}, ${detail}. Lang drukken om te wissen`}
      data-testid="list-card"
      whileTap={{ scale: 0.96 }}
      onClick={onOpen}
      {...handlers}
    >
      <span className="list-card-art">
        {list.items.slice(0, 3).map((item, index) => (
          <ItemArt key={`${item.productId}-${index}`} item={item} />
        ))}
      </span>
      <span className="list-card-text">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </motion.button>
  );
}

export function HomeScreen() {
  const state = useAdventure();
  const { adventure, saved, stickers, settings, dispatch } = state;
  const navigate = useNavigate();
  const location = useLocation();
  const [parentOpen, setParentOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const preview = stickerPreview(stickers);
  const previewRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<ParentView>("settings");
  const lastView = useRef<ParentView>("settings");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rowRefs = useRef<Partial<Record<ParentView, HTMLButtonElement | null>>>({});
  const [introOpen, setIntroOpen] = useState(false);
  const introHeadingRef = useRef<HTMLHeadingElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const undo = useNotice();
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);

  useEffect(() => {
    if (!notice) return;
    navigate(".", { replace: true, state: null });
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice, navigate]);

  useEffect(() => {
    const from = lastView.current;
    lastView.current = parentOpen ? view : "settings";
    if (!parentOpen || from === view) return;
    headingRef.current?.closest(".sheet-body")?.scrollTo({ top: 0 });
    if (view === "settings") rowRefs.current[from]?.focus();
    else headingRef.current?.focus();
  }, [view, parentOpen]);

  useEffect(() => {
    if (introOpen) introHeadingRef.current?.focus();
  }, [introOpen]);

  function startAdventure() {
    dispatch({ type: "new-draft" });
    navigate("/toevoegen");
  }

  function clickNewAdventure() {
    trackEvent({ name: "new_adventure_clicked" });
    if (needsIntro(state)) {
      trackEvent({ name: "onboarding_opened" }, "onboarding-open");
      setIntroOpen(true);
      return;
    }
    startAdventure();
  }

  function finishIntro(action: "start" | "skip") {
    trackEvent({ name: "onboarding_finished", data: { action } }, "onboarding-finished");
    dispatch({ type: "intro-seen" });
    startAdventure();
  }

  function dismissIntro() {
    trackEvent({ name: "onboarding_finished", data: { action: "dismiss" } }, "onboarding-finished");
    dispatch({ type: "intro-seen" });
    setIntroOpen(false);
    newRef.current?.focus();
  }

  function closeStickers() {
    setStickersOpen(false);
    previewRef.current?.focus();
  }

  function closeParent() {
    setParentOpen(false);
    setConfirmClear(false);
    setView("settings");
  }

  const shopping = adventure?.phase === "shopping";
  const draft = adventure?.phase === "draft" && adventure.items.length > 0;
  const previous = adventure?.phase === "done" ? saved[0] : saved.find((list) => list.id !== adventure?.id);
  const favorites = saved.filter((list) => list.favorite && list.id !== previous?.id).slice(0, 6);
  const shelf = [...(previous ? [{ list: previous, label: "Vorig lijstje" }] : []), ...favorites.map((list) => ({ list, label: "Bewaard" }))];

  function openList(list: SavedList) {
    dispatch({ type: "open-saved", id: list.id });
    navigate("/controleren");
  }

  function forgetList(list: SavedList) {
    const index = saved.findIndex((entry) => entry.id === list.id);
    dispatch({ type: "forget-saved", id: list.id });
    undo.show("Lijstje gewist", { label: "Ongedaan maken", run: () => dispatch({ type: "restore-saved", list, index }) });
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
        <Karrie mood="greeting" enter="roll" className="home-mascot" />
        <motion.div
          className="wordmark"
          initial={{ y: 18, opacity: 0, scale: 0.92 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ ...softSpring, delay: 0.35 }}
        >
          <h1>Karrie</h1>
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
          ref={newRef}
          onClick={clickNewAdventure}
        >
          Nieuw avontuur
        </PressButton>
        {needsIntro(state) && (
          <p className="home-teaser" data-testid="home-teaser">
            <strong>Boodschappen doen wordt een spelletje!</strong>
            Maak samen een lijstje. In de winkel speurt je kind naar de producten en verdient sterren en stickers.
          </p>
        )}
        {(shopping || draft) && (
          <PressButton variant="secondary" wide onClick={() => navigate(shopping ? "/winkel" : "/controleren")}>
            {shopping ? "Verder speuren" : "Verder met lijstje"}
          </PressButton>
        )}
      </motion.div>

      {shelf.length > 0 && (
        <section className="home-shelf" aria-label="Eerdere lijstjes">
          <ul>
            {shelf.map(({ list, label }) => (
              <li key={list.id}>
                <ListCard list={list} label={label} onOpen={() => openList(list)} onForget={() => forgetList(list)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview.count > 0 && (
        <motion.button
          ref={previewRef}
          type="button"
          className="sticker-preview"
          aria-label={`Mijn stickers: ${preview.count}. Open het stickerboek`}
          data-testid="sticker-preview"
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            trackEvent({ name: "sticker_book_opened" });
            setStickersOpen(true);
          }}
        >
          <span className="sticker-preview-head" aria-hidden="true">
            <strong>Mijn stickers</strong>
            <span className="sticker-count">{preview.count}</span>
          </span>
          <span className="sticker-preview-row" aria-hidden="true">
            {preview.shown.map((id) => (
              <span key={id} className="sticker-slot sticker-mini">
                <StickerBadge id={id} />
              </span>
            ))}
            {preview.more > 0 && <span className="sticker-more">+{preview.more}</span>}
          </span>
        </motion.button>
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

      <Toast notice={undo.notice} onDismiss={undo.dismiss} />

      <Sheet open={introOpen} onClose={dismissIntro} label="Hoe werkt Karrie?">
        <HowKarrieWorks headingRef={introHeadingRef} onStart={() => finishIntro("start")} onSkip={() => finishIntro("skip")} />
      </Sheet>

      <Sheet open={stickersOpen} onClose={closeStickers} label="Stickerboek">
        <StickerBook stickers={[...new Set(stickers)]} onClose={closeStickers} />
      </Sheet>

      <Sheet open={parentOpen} onClose={closeParent} label={viewLabels[view]}>
        {view === "settings" ? (
          <>
            <h2 ref={headingRef}>Voor ouders</h2>
            <SoundSwitch />
            <DiscoverySwitch />
            <ReferenceSwitch />
            <div className="setting-block" data-testid="default-retailer">
              <span className="switch-label">
                <strong>Supermarkt</strong>
                <small>{settings.retailer ? `Nieuwe lijstjes tonen aanbiedingen van ${retailerName(settings.retailer)}` : "Geen: Karrie zoekt geen aanbiedingen"}</small>
              </span>
              <RetailerPicker value={settings.retailer} onChange={(retailer) => dispatch({ type: "set-default-retailer", retailer })} />
            </div>
            {saved.length > 0 &&
              (confirmClear ? (
                <div className="clear-saved" data-testid="clear-saved-confirm">
                  <p>
                    Alle {saved.length} bewaarde {saved.length === 1 ? "lijstje" : "lijstjes"} wissen?
                  </p>
                  <div className="clear-saved-actions">
                    <PressButton variant="quiet" onClick={() => setConfirmClear(false)}>
                      Annuleer
                    </PressButton>
                    <PressButton
                      variant="secondary"
                      data-testid="clear-saved-yes"
                      onClick={() => {
                        dispatch({ type: "clear-saved" });
                        setConfirmClear(false);
                      }}
                    >
                      Wissen
                    </PressButton>
                  </div>
                </div>
              ) : (
                <button type="button" className="text-button" data-testid="clear-saved" onClick={() => setConfirmClear(true)}>
                  Bewaarde lijstjes wissen
                </button>
              ))}
            <nav className="settings-links" aria-label="Meer over Karrie">
              {(["howto", "about"] as const).map((target) => (
                <button
                  key={target}
                  ref={(node) => {
                    rowRefs.current[target] = node;
                  }}
                  type="button"
                  className="settings-link"
                  data-testid={`open-${target}`}
                  onClick={() => setView(target)}
                >
                  {linkLabels[target]}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
              <a
                className="settings-link"
                href={feedbackUrl("settings")}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="open-feedback"
                onClick={() => trackEvent({ name: "feedback_opened", data: { source: "settings" } })}
              >
                💬 Geef feedback
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 5h5v5M19 5l-9 9M10 5H5v14h14v-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <button
                type="button"
                className="settings-link"
                data-testid="share-karrie"
                onClick={() => {
                  void shareKarrie({
                    share: navigator.share?.bind(navigator),
                    canShare: navigator.canShare?.bind(navigator),
                    copy: (text) => navigator.clipboard.writeText(text),
                  }).then((outcome) => {
                    if (outcome === "cancelled") return;
                    trackEvent({ name: "share_completed", data: { method: outcome === "shared" ? "native" : "copied" } });
                    if (outcome === "copied") undo.show("Link gekopieerd!");
                  });
                }}
              >
                📤 Deel Karrie
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v12M8 7l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                ref={(node) => {
                  rowRefs.current.privacy = node;
                }}
                type="button"
                className="settings-link"
                data-testid="open-privacy"
                onClick={() => setView("privacy")}
              >
                {linkLabels.privacy}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </nav>
            <p className="sheet-note">Zet Karrie op je beginscherm via Safari (deel-knop) of Chrome (menu). Lang drukken op een lijstje wist het.</p>
            <p className="sheet-note">Na een update: sluit Karrie helemaal en open hem opnieuw.</p>
            <p className="app-version" data-testid="app-version">
              {appVersionLabel()}
            </p>
            <PressButton variant="secondary" wide onClick={closeParent}>
              Klaar
            </PressButton>
          </>
        ) : (
          <>
            <button type="button" className="text-button sheet-back" data-testid="sheet-back" onClick={() => setView("settings")}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Terug
            </button>
            {view === "howto" ? (
              <HowKarrieWorks headingRef={headingRef} />
            ) : view === "about" ? (
              <AboutKarrie headingRef={headingRef} />
            ) : (
              <PrivacyInfo headingRef={headingRef} />
            )}
            <PressButton variant="secondary" wide onClick={() => setView("settings")}>
              Terug
            </PressButton>
          </>
        )}
      </Sheet>
    </main>
  );
}
