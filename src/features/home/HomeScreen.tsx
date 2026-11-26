import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Karrie } from "../../components/mascot/Karrie";
import { HomeScene } from "../../components/scenery/HomeScene";
import { StickerBadge } from "../../components/StickerBadge";
import { StarIcon } from "../../components/ui/StarIcon";
import { DiscoverySwitch } from "../../components/ui/DiscoverySwitch";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { SoundSwitch } from "../../components/ui/SoundSwitch";
import { VoiceSwitch } from "../../components/ui/VoiceSwitch";
import { Toast, useNotice } from "../../components/ui/Toast";
import { softSpring } from "../../motion/variants";
import { appVersionLabel } from "../../domain/appVersion";
import { retailerName } from "../../domain/retailers";
import { stickerPreview } from "../../domain/stickers";
import { RetailerPicker } from "../offers/RetailerPicker";
import { useAdventure } from "../../state/AdventureContext";
import { needsIntro } from "../../domain/intro";
import { feedbackUrl } from "../../domain/feedback";
import { shareKarrie } from "../../domain/share";
import { trackEvent } from "../../services/analytics";
import { trackFirstHomeViewed } from "../../services/analyticsMilestones";
import { attributionEventData } from "../../services/campaignAttribution";
import { InstallCard } from "../install/InstallCard";
import { VoiceOptInSheet } from "../shop/VoiceOptInSheet";
import { ListsSheet } from "../lists/ListsSheet";
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

export function HomeScreen() {
  const state = useAdventure();
  const { adventure, stickers, settings, dispatch } = state;
  const navigate = useNavigate();
  const location = useLocation();
  const [parentOpen, setParentOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const preview = stickerPreview(stickers);
  const previewRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<ParentView>("settings");
  const lastView = useRef<ParentView>("settings");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rowRefs = useRef<Partial<Record<ParentView, HTMLButtonElement | null>>>({});
  const [introOpen, setIntroOpen] = useState(false);
  const [practiceAsk, setPracticeAsk] = useState(false);
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

  const firstHome = needsIntro(state);

  useEffect(() => {
    if (firstHome) trackFirstHomeViewed();
  }, [firstHome]);

  function startAdventure(entry: "first" | "return") {
    const campaign = attributionEventData();
    trackEvent({ name: "new_adventure_clicked", data: { entry, ...campaign } });
    dispatch({ type: "new-draft" });
    navigate("/toevoegen");
  }

  function launchPractice() {
    dispatch({ type: "start-practice" });
    navigate("/winkel");
  }

  function startPractice() {
    if (!settings.voiceOptInSeen) {
      setPracticeAsk(true);
      return;
    }
    launchPractice();
  }

  function openHowTo() {
    trackEvent({ name: "onboarding_opened" }, "onboarding-open");
    setIntroOpen(true);
  }

  function dismissIntro() {
    trackEvent({ name: "onboarding_finished", data: { action: "dismiss" } }, "onboarding-finished");
    setIntroOpen(false);
    newRef.current?.focus();
  }

  function closeStickers() {
    setStickersOpen(false);
    previewRef.current?.focus();
  }

  function closeParent() {
    setParentOpen(false);
    setView("settings");
  }

  const shopping = adventure?.phase === "shopping";
  const draft = adventure?.phase === "draft" && adventure.items.length > 0;

  function resumeAdventure() {
    if (!adventure) return;
    trackEvent(
      { name: "adventure_resumed", data: { phase: shopping ? "shopping" : "draft" } },
      `resume:${adventure.id}:${shopping ? "shopping" : "draft"}`,
    );
    navigate(shopping ? "/winkel" : "/controleren");
  }

  return (
    <main className={firstHome ? "screen home home-first" : "screen home"}>
      <HomeScene />
      <button type="button" className="lists-button" data-testid="open-lists-home" aria-label="Lijstjes" onClick={() => setListsOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14M5 12h14M5 17h10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        <span>Lijstjes</span>
      </button>
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

      {firstHome ? (
        <motion.div
          className="home-actions home-first-copy"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...softSpring, delay: 0.55 }}
        >
          <p className="home-value" data-testid="home-value">
            <span>Een boodschappenlijstje voor jou.</span>
            <span>Een speurtocht voor je kind.</span>
          </p>
          <ol className="home-steps">
            <li>
              <span className="home-step-art" aria-hidden="true">
                <ListStepArt />
              </span>
              <span className="home-step-label">Maak samen een lijstje</span>
            </li>
            <li>
              <span className="home-step-art" aria-hidden="true">
                <SearchStepArt />
              </span>
              <span className="home-step-label">Speur in de winkel</span>
            </li>
            <li>
              <span className="home-step-art" aria-hidden="true">
                <StarIcon />
              </span>
              <span className="home-step-label">Verdien sterren en stickers</span>
            </li>
          </ol>
          <p className="home-practice-note">Thuis oefenen mag ook.</p>
          <PressButton variant="primary" size="l" wide data-testid="new-adventure" ref={newRef} onClick={() => startAdventure("first")}>
            Kies een paar plaatjes
          </PressButton>
          <PressButton variant="secondary" size="l" wide data-testid="practice-round" onClick={startPractice}>
            Oefenrondje
          </PressButton>
          <button type="button" className="text-button home-how" data-testid="open-howto" onClick={openHowTo}>
            Hoe werkt Karrie?
          </button>
          <p className="home-trust">Gratis · Geen account nodig</p>
        </motion.div>
      ) : (
        <motion.div
          className="home-actions"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...softSpring, delay: 0.55 }}
        >
          {shopping ? (
            <PressButton variant="primary" size="l" wide data-testid="resume-adventure" onClick={resumeAdventure}>
              Verder speuren
            </PressButton>
          ) : null}
          <PressButton
            variant={shopping ? "secondary" : "primary"}
            size={shopping ? "m" : "l"}
            wide
            data-testid="new-adventure"
            ref={newRef}
            onClick={() => startAdventure("return")}
          >
            Nieuw avontuur
          </PressButton>
          <PressButton variant="secondary" wide data-testid="practice-round" onClick={startPractice}>
            Oefenrondje
          </PressButton>
          {draft && !shopping && (
            <PressButton variant="secondary" wide data-testid="resume-adventure" onClick={resumeAdventure}>
              Verder met lijstje
            </PressButton>
          )}
          <InstallCard />
        </motion.div>
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

      <VoiceOptInSheet
        open={practiceAsk}
        onAnswer={(enabled) => {
          dispatch({ type: "set-voice", enabled });
          setPracticeAsk(false);
          launchPractice();
        }}
      />

      <Sheet open={introOpen} onClose={dismissIntro} label="Hoe werkt Karrie?">
        <HowKarrieWorks
          headingRef={introHeadingRef}
          onStart={
            firstHome
              ? () => {
                  trackEvent({ name: "onboarding_finished", data: { action: "start" } }, "onboarding-finished");
                  setIntroOpen(false);
                  startAdventure("first");
                }
              : undefined
          }
        />
      </Sheet>

      <Sheet open={stickersOpen} onClose={closeStickers} label="Stickerboek">
        <StickerBook stickers={[...new Set(stickers)]} onClose={closeStickers} />
      </Sheet>

      <Sheet open={parentOpen} onClose={closeParent} label={viewLabels[view]}>
        {view === "settings" ? (
          <>
            <h2 ref={headingRef}>Voor ouders</h2>
            <SoundSwitch />
            <VoiceSwitch />
            <DiscoverySwitch />
            <div className="setting-block" data-testid="default-retailer">
              <span className="switch-label">
                <strong>Supermarkt</strong>
                <small>{settings.retailer ? `Nieuwe lijstjes tonen aanbiedingen van ${retailerName(settings.retailer)}` : "Geen: Karrie zoekt geen aanbiedingen"}</small>
              </span>
              <RetailerPicker value={settings.retailer} onChange={(retailer) => dispatch({ type: "set-default-retailer", retailer })} />
            </div>
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

      <ListsSheet open={listsOpen} onClose={() => setListsOpen(false)} />
    </main>
  );
}

function ListStepArt() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="6" y="4" width="52" height="56" rx="14" fill="#fffdf9" stroke="#0c8c84" strokeWidth="3" />
      <path d="M16 22.5l3.2 3.2 6.2-6.6" fill="none" stroke="#16bfb2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 22h16" stroke="#ffd23f" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M16 34.5l3.2 3.2 6.2-6.6" fill="none" stroke="#16bfb2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 34h16" stroke="#ffd23f" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M16 46.5l3.2 3.2 6.2-6.6" fill="none" stroke="#16bfb2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 46h12" stroke="#ffd23f" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchStepArt() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="27" cy="27" r="17" fill="#d4f4f0" stroke="#0c8c84" strokeWidth="4" />
      <path d="M20 22c2-4 7-6 11-4" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      <path d="M39.5 39.5L55 55" stroke="#ff8a1f" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
