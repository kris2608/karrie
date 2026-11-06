import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { setSoundEnabled } from "../feedback/sound";
import { loadPersisted, savePersisted } from "../storage/db";
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
    loadPersisted()
      .then((data) => {
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
