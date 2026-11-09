import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { setSoundEnabled } from "../feedback/sound";
import { trackEvent } from "../services/analytics";
import { bootstrapAnalytics } from "../services/analyticsMilestones";
import { catalogSync } from "../services/catalog/sync";
import { loadPersisted, savePersisted, type Persisted } from "../storage/db";
import { preparePhotos } from "../storage/photos";
import { offerQueries, offers } from "../storage/offers";
import { references } from "../storage/references";
import { nameImages, useNameImagesVersion } from "../storage/nameImages";
import { setStoreImageRetailer, storeImages, useStoreImagesVersion } from "../storage/storeImages";
import { wantedReferences, wantedStoreImages } from "../domain/referenceTargets";
import { Karrie } from "../components/mascot/Karrie";
import { analyticsEvents, commitMilestoneEvents } from "./analyticsEvents";
import { useCustomEnrichment } from "./customEnrichment";
import { initialState, reducer, type Action, type AppState } from "./reducer";

type AdventureContextValue = AppState & {
  dispatch: (action: Action) => void;
};

const AdventureContext = createContext<AdventureContextValue | null>(null);

export function AdventureProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useState(false);
  const latest = useRef(state);

  useLayoutEffect(() => {
    latest.current = state;
  }, [state]);

  /** Screens dispatch through here; the step is replayed on the latest state only to derive statistics. */
  const dispatch = useCallback((action: Action) => {
    const before = latest.current;
    let events: ReturnType<typeof analyticsEvents> = [];
    try {
      const after = reducer(before, action);
      latest.current = after;
      events = analyticsEvents(action, before, after);
    } catch {
      events = [];
    }
    rawDispatch(action);
    const sent = events.map(({ event, once }) => trackEvent(event, once));
    commitMilestoneEvents(events, sent);
  }, []);

  useEffect(() => {
    let cancel = false;
    void offers.hydrate();
    void storeImages.hydrate();
    void nameImages.hydrate();
    void catalogSync.hydrate();
    let hydrated: Persisted | null = null;
    Promise.all([loadPersisted(), references.hydrate()])
      .then(async ([data]) => {
        hydrated = data;
        const minePhotos = data.mine.flatMap((entry) => [entry.photoId, entry.illustrationId].filter((id): id is string => Boolean(id)));
        const photos = preparePhotos(data.adventure, data.saved, [...references.photoIds(), ...minePhotos]).catch(() => undefined);
        await Promise.race([photos, new Promise((resolve) => window.setTimeout(resolve, 1500))]);
        if (!cancel) rawDispatch({ type: "hydrate", data });
        if (!cancel) void catalogSync.sync();
      })
      .finally(() => {
        if (cancel) return;
        setReady(true);
        if (hydrated) void bootstrapAnalytics(hydrated);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    savePersisted(state).catch(() => undefined);
  }, [state, ready]);

  useEffect(() => {
    setSoundEnabled(state.settings.soundEnabled);
  }, [state.settings.soundEnabled]);

  const storeVersion = useStoreImagesVersion();
  const storeEans = useMemo(() => (ready ? wantedStoreImages(state.adventure) : []), [ready, state.adventure]);
  useEffect(() => {
    setStoreImageRetailer(state.adventure?.phase === "draft" || state.adventure?.phase === "shopping" ? state.adventure.retailer : undefined);
    for (const ean of storeEans) storeImages.request(ean);
  }, [storeEans, state.adventure]);

  const nameVersion = useNameImagesVersion();
  const wanted = useMemo(
    () => (ready && state.settings.referenceImages ? wantedReferences(state.adventure, storeImages.status, nameImages.status) : []),
    /** storeVersion, nameVersion: a retailer or name photo answer decides whether a reference search is still needed. */
    [ready, state.adventure, state.settings.referenceImages, storeVersion, nameVersion],
  );
  useEffect(() => {
    references.setEnabled(state.settings.referenceImages);
    for (const identity of wanted) references.request(identity);
  }, [wanted, state.settings.referenceImages]);

  const listItems =
    ready && state.adventure && (state.adventure.phase === "draft" || state.adventure.phase === "shopping")
      ? state.adventure.items
      : null;
  const retailer = state.adventure?.retailer;
  useEffect(() => {
    offers.sync(listItems ? offerQueries(listItems, retailer) : []);
  }, [listItems, retailer]);

  useCustomEnrichment(state, dispatch, ready);

  const value = useMemo(() => ({ ...state, dispatch }), [state, dispatch]);
  if (!ready) {
    return (
      <div className="splash">
        <Karrie mood="idle" className="splash-mascot" />
      </div>
    );
  }

  return <AdventureContext.Provider value={value}>{children}</AdventureContext.Provider>;
}

export function useAdventure(): AdventureContextValue {
  const value = useContext(AdventureContext);
  if (!value) throw new Error("useAdventure moet binnen AdventureProvider staan");
  return value;
}
