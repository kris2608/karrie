import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { StorageLoadError } from "../components/StorageLoadError";
import { setSoundEnabled } from "../feedback/sound";
import { trackEvent } from "../services/analytics";
import { trackStorageFailure } from "../services/analyticsHelpers";
import { bootstrapAnalytics } from "../services/analyticsMilestones";
import { catalogSync } from "../services/catalog/sync";
import { loadPersisted, mayPersist, resetDatabaseConnection, savePersisted, type Persisted } from "../storage/db";
import { preparePhotos } from "../storage/photos";
import { offerQueries, offers } from "../storage/offers";
import { references } from "../storage/references";
import { nameImages, privateLabelImages, useNameImagesVersion } from "../storage/nameImages";
import { setStoreImageRetailer, storeImages, useStoreImagesVersion } from "../storage/storeImages";
import { wantedReferences, wantedStoreImages } from "../domain/referenceTargets";
import { Karrie } from "../components/mascot/Karrie";
import { analyticsEvents, commitMilestoneEvents } from "./analyticsEvents";
import { useCustomEnrichment } from "./customEnrichment";
import { initialState, reducer, type Action, type AppState } from "./reducer";
import { useSharedPackHydrate } from "./sharedPackHydrate";

type PersistStatus = "loading" | "ready" | "failed" | "save_failed";

type AdventureContextValue = AppState & {
  dispatch: (action: Action) => void;
};

const AdventureContext = createContext<AdventureContextValue | null>(null);

async function hydrateFromDisk(cancel: () => boolean): Promise<{ ok: true; data: Persisted } | { ok: false }> {
  const [result] = await Promise.all([loadPersisted(), references.hydrate()]);
  if (cancel()) return { ok: false };
  if (!result.ok) return { ok: false };
  const data = result.data;
  const minePhotos = data.mine.flatMap((entry) => [entry.photoId, entry.illustrationId].filter((id): id is string => Boolean(id)));
  const photos = preparePhotos(data.adventure, data.saved, [...references.photoIds(), ...minePhotos]).catch(() => undefined);
  await Promise.race([photos, new Promise((resolve) => window.setTimeout(resolve, 1500))]);
  if (cancel()) return { ok: false };
  return { ok: true, data };
}

export function AdventureProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, initialState);
  const [persistStatus, setPersistStatus] = useState<PersistStatus>("loading");
  const [retrying, setRetrying] = useState(false);
  const latest = useRef(state);
  const persistStatusRef = useRef(persistStatus);
  persistStatusRef.current = persistStatus;

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

  const applyHydrated = useCallback((data: Persisted) => {
    rawDispatch({ type: "hydrate", data });
    void catalogSync.sync();
    setPersistStatus("ready");
    void bootstrapAnalytics(data);
  }, []);

  useEffect(() => {
    let cancel = false;
    void offers.hydrate();
    void storeImages.hydrate();
    void nameImages.hydrate();
    void privateLabelImages.hydrate();
    void catalogSync.hydrate();
    void hydrateFromDisk(() => cancel)
      .then((result) => {
        if (cancel) return;
        if (result.ok) applyHydrated(result.data);
        else {
          setPersistStatus("failed");
          trackStorageFailure("load", "unavailable");
        }
      })
      .catch(() => {
        if (!cancel) {
          setPersistStatus("failed");
          trackStorageFailure("load", "read_failed");
        }
      });
    return () => {
      cancel = true;
    };
  }, [applyHydrated]);

  const retryLoad = useCallback(() => {
    if (retrying) return;
    setRetrying(true);
    resetDatabaseConnection();
    void hydrateFromDisk(() => false)
      .then((result) => {
        if (result.ok) applyHydrated(result.data);
        else {
          setPersistStatus("failed");
          trackStorageFailure("load", "unavailable");
        }
      })
      .catch(() => {
        setPersistStatus("failed");
        trackStorageFailure("load", "read_failed");
      })
      .finally(() => setRetrying(false));
  }, [applyHydrated, retrying]);

  useEffect(() => {
    if (!mayPersist(persistStatus)) return;
    savePersisted(state)
      .then(() => {
        if (persistStatusRef.current === "save_failed") setPersistStatus("ready");
      })
      .catch(() => {
        if (mayPersist(persistStatusRef.current)) {
          setPersistStatus("save_failed");
          trackStorageFailure("save", "write_failed");
        }
      });
  }, [state, persistStatus]);

  useEffect(() => {
    setSoundEnabled(state.settings.soundEnabled);
  }, [state.settings.soundEnabled]);

  const ready = persistStatus === "ready" || persistStatus === "save_failed";

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
  useSharedPackHydrate(state, dispatch, ready);

  const value = useMemo(() => ({ ...state, dispatch }), [state, dispatch]);

  if (persistStatus === "loading") {
    return (
      <div className="splash">
        <Karrie mood="idle" className="splash-mascot" />
      </div>
    );
  }

  if (persistStatus === "failed") {
    return <StorageLoadError onRetry={retryLoad} busy={retrying} />;
  }

  return (
    <AdventureContext.Provider value={value}>
      {persistStatus === "save_failed" && (
        <div className="toast toast-warn" data-testid="storage-save-warning" role="status">
          Opslaan lukte even niet. Karrie probeert het opnieuw.
        </div>
      )}
      {children}
    </AdventureContext.Provider>
  );
}

export function useAdventure(): AdventureContextValue {
  const value = useContext(AdventureContext);
  if (!value) throw new Error("useAdventure moet binnen AdventureProvider staan");
  return value;
}
