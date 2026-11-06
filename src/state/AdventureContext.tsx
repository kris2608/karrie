import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { setSoundEnabled } from "../feedback/sound";
import { loadPersisted, savePersisted } from "../storage/db";
import { preparePhotos } from "../storage/photos";
import { references } from "../storage/references";
import { wantedReferences } from "../domain/referenceTargets";
import { Karrie } from "../components/mascot/Karrie";
import { initialState, reducer, type Action, type AppState } from "./reducer";

type AdventureContextValue = AppState & {
  dispatch: (action: Action) => void;
};

const AdventureContext = createContext<AdventureContextValue | null>(null);

export function AdventureProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    Promise.all([loadPersisted(), references.hydrate()])
      .then(async ([data]) => {
        const minePhotos = data.mine.flatMap((entry) => (entry.photoId ? [entry.photoId] : []));
        const photos = preparePhotos(data.adventure, data.saved, [...references.photoIds(), ...minePhotos]).catch(() => undefined);
        await Promise.race([photos, new Promise((resolve) => window.setTimeout(resolve, 1500))]);
        if (!cancel) dispatch({ type: "hydrate", data });
      })
      .finally(() => {
        if (!cancel) setReady(true);
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

  const wanted = useMemo(() => (ready && state.settings.referenceImages ? wantedReferences(state.adventure) : []), [ready, state.adventure, state.settings.referenceImages]);
  useEffect(() => {
    references.setEnabled(state.settings.referenceImages);
    for (const identity of wanted) references.request(identity);
  }, [wanted, state.settings.referenceImages]);

  const value = useMemo(() => ({ ...state, dispatch }), [state]);
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
